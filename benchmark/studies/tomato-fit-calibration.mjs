// Each detector chooses one cutoff for both stages and both scanners. Confirmation
// consumes frozen model artifacts and calibration choices without refitting.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {settings,hash,fitSchedules,score,compare,selectFitCutoffs,calibrationThresholds as thresholds} from './tomato-cutoff-controls.mjs';

const study = 'tomato-fit-calibration-v1';
const trainingSeeds = [1403129,1514021,1687553];
const panels = {
  primary:[43111013,43223027,43335041,43447053],
  sensitivity:[44111023,44223037,44335051,44447063]
};
const testSeeds = [45111047,45223059,45335071,45447083,45559097,45671113];
const rule = 'One cutoff per 640-epoch fit across stages and layouts. At 15 cm require strictly higher seedling F1 and no more than 0.01 branching precision loss on each layout versus that fit’s 40-epoch starter at 0.50. Maximize the smaller seedling F1 gain. Break ties by distance to 0.50, then higher cutoff. With no eligible cutoff retain 40 epochs at 0.50. The second panel tests sensitivity and cannot replace the primary choice.';
const design = {trainingSeeds,panels,testSeeds,thresholds,settings,rule};
const reserved = [...Object.values(panels).flat(),...testSeeds];
assert.equal(new Set([...trainingSeeds,...reserved]).size,trainingSeeds.length+reserved.length);

const starter = seed => ({seed,epochs:40,percent:50});
const longFit = (seed,percent) => ({seed,epochs:640,percent});
const key = arm => [arm.seed,arm.epochs,arm.percent].join('/');
const grid = trainingSeeds.flatMap(seed=>[starter(seed),...thresholds.map(p=>longFit(seed,p))]);

function heldOutChanges(candidate,starter,fields) {
  const pooled = compare(candidate,starter);
  const layouts = pooled.layouts.map(row=>{
    const matchedChangeByField = fields.filter(f=>f.layout===row.layout && f.plantForm==='seedling').map(field=>{
      function matched(arm) {
        return field.models.find(m=>key(m)===key(arm)).scores.find(s=>s.cm===15).tp;
      }
      return {seed:field.seed,change:matched(candidate)-matched(starter)};
    });
    return {...row,matchedChangeByField,
      extraSeedlings:matchedChangeByField.reduce((sum,f)=>sum+f.change,0)};
  });
  return {...pooled,layouts,
    recoveredOnBoth:layouts.every(l=>l.extraSeedlings>0 && l.seedlingF1Change>0 && l.precisionSafe)};
}

function scoreChoices(operatingPoints,fits,fieldSeeds,capture) {
  const arms = new Map();
  for (const {seed,...points} of operatingPoints) for (const arm of Object.values(points)) arms.set(key(arm),arm);
  const result = score([...arms.values()],fits,fieldSeeds,capture);
  const rows = new Map(result.grid.map(row=>[key(row),row]));
  const comparisons = operatingPoints.map(({seed,starter,...points})=>({seed,
    ...Object.fromEntries(Object.entries(points).map(([name,arm])=>[
      name,heldOutChanges(rows.get(key(arm)),rows.get(key(starter)),result.fields)
    ]))
  }));
  return {operatingPoints,comparisons,...result};
}

function freeze(training,calibration) {
  return hash({design,training:training.map(({datasetHash,manifest,fits})=>({
    datasetHash,scanIds:manifest.map(t=>t.tile_id),weights:fits.map(f=>f.weightHash)
  })),panels:Object.keys(panels).map(name=>({
    scans:calibration[name].fields.map(f=>f.tileId),grid:hash(calibration[name].grid),choices:selectFitCutoffs(calibration[name].grid,trainingSeeds)
  }))});
}

const [phase,path] = process.argv.slice(2);
assert.ok((phase==='calibrate' || phase==='plan') && process.argv.length===3 || ['confirm','weeds'].includes(phase) && process.argv.length===4,
  'Use plan, calibrate, confirm calibration.json, or weeds calibration.json.');
const header = {study,phase,domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,design,designHash:hash(design)};
let output = {};
if (phase==='calibrate') {
  const training = [], excluded = new Set(reserved);
  for (const seed of trainingSeeds) {
    const {fits,datasetHash,manifest,preparationMs,trainingMs} = await fitSchedules(seed,[40,640],excluded);
    for (const t of manifest) excluded.add(t.seed);
    // Store each planting manifest once while preserving the full frozen weights.
    training.push({seed,datasetHash,manifest,preparationMs,trainingMs,
      fits:fits.map(({epochs,model,weightHash})=>({epochs,model,weightHash}))});
  }
  const fits = training.flatMap(t=>t.fits.map(f=>({...f,seed:t.seed,manifest:t.manifest})));
  const calibration = {};
  for (const [name,seeds] of Object.entries(panels)) {
    const result = score(grid,fits,seeds);
    calibration[name] = {...result,choices:selectFitCutoffs(result.grid,trainingSeeds)};
  }
  output = {training,calibration,freezeHash:freeze(training,calibration)};
} else if (phase==='confirm' || phase==='weeds') {
  const prior = JSON.parse(await readFile(path,'utf8'));
  assert.equal(prior.study,study);
  assert.equal(prior.phase,'calibrate');
  assert.deepEqual(prior.design,design);
  assert.equal(prior.designHash,header.designHash);
  assert.equal(prior.freezeHash,freeze(prior.training,prior.calibration));
  assert.deepEqual(prior.training.map(t=>t.seed),trainingSeeds);
  for (const name of Object.keys(panels)) assert.deepEqual(prior.calibration[name].choices,selectFitCutoffs(prior.calibration[name].grid,trainingSeeds));
  const fits = prior.training.flatMap(t=>{
    assert.deepEqual(t.fits.map(f=>f.epochs),[40,640]);
    return t.fits.map(f=>{
      assert.equal(hash(f.model),f.weightHash);
      return {...f,seed:t.seed,manifest:t.manifest};
    });
  });
  const operatingPoints = trainingSeeds.map(seed=>({seed,starter:starter(seed),shared50:longFit(seed,50),shared70:longFit(seed,70),
    ...Object.fromEntries(Object.keys(panels).map(name=>[name,prior.calibration[name].choices.find(a=>a.seed===seed)]))}));
  const receipts = {freezeHash:prior.freezeHash,
    weightHashes:fits.map(({seed,epochs,weightHash})=>({seed,epochs,weightHash}))};
  if (phase==='confirm') {
    output = {...receipts,...scoreChoices(operatingPoints,fits,testSeeds)};
  } else {
    // This follow-up holds the already-chosen primary cutoffs and reserves new plantings.
    const fieldSeeds = [47120071,47241257,47362513,47483789,47605039,47726281];
    assert.equal(new Set([...reserved,...trainingSeeds,...fieldSeeds]).size,reserved.length+trainingSeeds.length+fieldSeeds.length);
    const points = operatingPoints.map(({seed,starter,shared70,primary})=>({seed,starter,shared70,primary}));
    const clean = scoreChoices(points,fits,fieldSeeds,{weeds:false});
    const weedy = scoreChoices(points,fits,fieldSeeds,{weeds:true});
    for (const [i,a] of clean.fields.entries()) {
      const b = weedy.fields[i];
      assert.deepEqual([a.seed,a.layout,a.plantForm],[b.seed,b.layout,b.plantForm]);
      assert.equal(a.capture.boxHash,b.capture.boxHash);
      assert.equal(a.capture.rayXYHash,b.capture.rayXYHash);
      assert.notEqual(a.tileId,b.tileId);
      assert.equal(a.capture.weedReturns,0);
      assert.ok(b.capture.weedReturns>0);
      assert.equal(a.capture.cropReturns-b.capture.cropReturns,b.capture.coveredCropReturns);
      assert.equal(a.capture.soilReturns+a.capture.cropReturns,60000);
      assert.equal(b.capture.soilReturns+b.capture.cropReturns+b.capture.weedReturns,60000);
    }
    output = {...receipts,fieldSeeds,clean,weedy};
  }
}
console.log(JSON.stringify({...header,...output},null,2));
