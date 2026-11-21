// Choose a single operating point on the earlier duration study's development fields.
// Confirmation refits the selected schedules. The crossed replay reopens two scored cohorts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {buildDataset,features,targetCenters} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {weightArtifact,trainerId,scoreSavedWeights} from '../../trainer/models/network.js';
import {settings as soilSettings,scoreFields} from './tomato-soil-controls.mjs';
import {labelsFor,rankSummary} from './tomato-epoch-ranking.mjs';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';

const design={
  development:{trainSeed:914731,fieldSeeds:[39112043,39243071,39374039,39505087]},
  confirmation:{trainSeed:1273187,fieldSeeds:[42103033,42247069,42391057,42535081,42679033,42823097]}
};
const settings={...soilSettings,sampleLimit:600,positiveSampling:'ordinary'};
const lengths=[40,160,640];
const thresholds=Array.from({length:19},(_,i)=>5*(i+1));
const control={epochs:40,percent:50};
const allArms=lengths.flatMap(epochs=>thresholds.map(percent=>({epochs,percent})));
const armKey=arm=>arm.epochs+'@'+arm.percent;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rule='Global cutoff. At 15 cm require branching precision within one percentage point of 40@50 on both layouts. Independently for 40 and longer fits, maximize the smaller seedling F1 gain across layouts. Break ties by distance from .50, shorter fit, then higher cutoff. If no eligible longer arm, show the smallest branching precision shortfall on the worse layout as a diagnostic.';
const allSeeds=Object.values(design).flatMap(c=>c.fieldSeeds);
assert.equal(new Set(allSeeds).size,allSeeds.length);

function unique(arms) {return [...new Map(arms.map(a=>[armKey(a),a])).values()];}

// Field Test replays the frozen model at each proposed cutoff and scores all three match distances.
function score(arms,fits,seeds) {
  const view=arms.map(arm=>{
    const fit=fits.find(f=>f.epochs===arm.epochs && (arm.seed===undefined || f.seed===arm.seed));
    assert.ok(fit,'Each operating point needs its frozen weights.');
    return {...fit,model:{...fit.model,threshold:arm.percent/100}};
  });
  const {summary,fields,timingsMs}=scoreFields(view,seeds);
  const grid=arms.map((arm,i)=>({...arm,groups:summary.map(s=>({
    layout:s.layout,plantForm:s.plantForm,scores:s.models[i].scores
  }))}));
  const baseline=summary.map(s=>({layout:s.layout,plantForm:s.plantForm,targets:s.targets,
    reachable:s.proposalMatches15,height:s.height}));
  return {grid,baseline,timingsMs,fields:fields.map(f=>({...f,models:f.models.map((m,i)=>({...m,percent:arms[i].percent}))}))};
}

function compare(row,baseline) {
  const layouts=['reference','os1-64'].map(layout=>{
    function metric(source,form,measure) {
      return source.groups.find(s=>s.layout===layout && s.plantForm===form).scores.find(s=>s.cm===15)[measure];
    }
    const p=metric(row,'branching','precision'),p0=metric(baseline,'branching','precision');
    const precisionChange=p===null || p0===null ? null : p-p0;
    return {layout,seedlingF1Change:metric(row,'seedling','f1')-metric(baseline,'seedling','f1'),
      branchingPrecisionChange:precisionChange,precisionSafe:precisionChange!==null && precisionChange>=-.01};
  });
  return {layouts,withinLimit:layouts.every(l=>l.precisionSafe),smallerGain:Math.min(...layouts.map(l=>l.seedlingF1Change)),
    worstPrecisionChange:Math.min(...layouts.map(l=>l.branchingPrecisionChange ?? -Infinity))};
}
function choose(grid) {
  assert.deepEqual(grid.map(armKey),allArms.map(armKey));
  const baseline=grid.find(a=>armKey(a)===armKey(control));
  const checks=grid.map(({epochs,percent,...row})=>({epochs,percent,...compare(row,baseline)}));
  function best(candidates) {
    const safe=candidates.filter(a=>a.withinLimit);
    const ranking=(safe.length ? safe : candidates).sort((a,b)=>
      (safe.length ? 0 : b.worstPrecisionChange-a.worstPrecisionChange) || b.smallerGain-a.smallerGain ||
      Math.abs(a.percent-50)-Math.abs(b.percent-50) || a.epochs-b.epochs || b.percent-a.percent);
    const {epochs,percent,withinLimit,smallerGain}=ranking[0];
    return {epochs,percent,withinLimit,smallerGain};
  }
  return {short:best(checks.filter(c=>c.epochs===40)),long:best(checks.filter(c=>c.epochs!==40))};
}
function freeze(result) {
  return hash({design,settings,thresholds,rule,datasetHash:result.datasetHash,weightHashes:result.weightHashes,
    selection:choose(result.grid),gridHash:hash(result.grid)});
}

function verifyFrozen(prior) {
  assert.equal(prior.study,'tomato-duration-cutoffs-v1');
  assert.equal(prior.phase,'development');
  assert.deepEqual(prior.design,design);
  assert.deepEqual(prior.settings,settings);
  assert.equal(prior.rule,rule);
  assert.equal(prior.freezeHash,freeze(prior));
  assert.deepEqual(prior.selection,choose(prior.grid));
}

async function fitSchedules(trainSeed,epochsToFit,excludedSeeds) {
  const start=performance.now(), config={...settings,seed:trainSeed};
  const set=await buildDataset({...config,auditPositiveSampling:true});
  assert.equal(set.Y.length,settings.sampleLimit);
  assert.ok(set.manifest.every(t=>!excludedSeeds.has(t.seed)));
  const preparationMs=performance.now()-start;
  const datasetHash=createHash('sha256').update(new Uint8Array(set.X.buffer))
    .update(new Uint8Array(set.Y.buffer)).update(JSON.stringify(set.scaling)).digest('hex');
  const fits=[];
  for (const epochs of new Set(epochsToFit)) {
    const begin=performance.now();
    const trained=await trainNetworkCPU(set.X,set.Y,{...config,epochs,dims:set.dims});
    assert.equal(trained.epochsCompleted,epochs);
    const model=weightArtifact({settings:config,scaling:set.scaling,stats:set.stats,weights:trained.weights,
      trainer:trainerId(config),epochs});
    fits.push({epochs,seed:trainSeed,manifest:set.manifest,model,weightHash:hash(model),fitMs:performance.now()-begin});
  }
  return {fits,datasetHash,manifest:set.manifest,preparationMs,
    weightHashes:fits.map(({epochs,weightHash})=>({epochs,weightHash})),trainingMs:fits.map(({epochs,fitMs})=>({epochs,fitMs}))};
}

// Revisit the ring seedlings where the two long fits diverged. XYZ goes to the
// scorers, while box distances supply the same labels as the original rank study.
function rankRingSeedlings(fits,fields) {
  const labels=[], scores=fits.map(()=>[]);
  let ambiguous=0;
  for (const record of fields.filter(f=>f.layout==='os1-64' && f.plantForm==='seedling')) {
    const scan=field(tomatoTestRecipe(record.seed,record.layout,record.plantForm,true));
    assert.equal(scan.labels.tile_id,record.tileId);
    const rows=features(scan,settings.minimumHeight,settings.peakAveraging,settings.featureMode);
    assert.equal(rows.pos.length,record.proposals);
    const truth=labelsFor(rows.pos,targetCenters(scan.labels.boxes));
    const raw=fits.map(f=>scoreSavedWeights(rows.X,f.model,settings.peakAveraging,settings.featureMode));
    for (const [i,label] of truth.entries()) {
      if (label===null) { ambiguous++; continue; }
      labels.push(label);
      for (const [k,values] of raw.entries()) scores[k].push(values[i]);
    }
  }
  const positives=labels.reduce((total,v)=>total+v,0);
  return {positives,background:labels.length-positives,ambiguous,models:fits.map(({seed,epochs},k)=>{
    const near=scores[k].filter((_,i)=>labels[i]).sort((a,b)=>a-b);
    const middle=Math.floor(near.length/2);
    const medianPositive=!near.length ? null : near.length%2 ? near[middle] : (near[middle-1]+near[middle])/2;
    return {seed,epochs,medianPositive,...rankSummary(scores[k],labels)};
  })};
}

const [phase,...paths]=process.argv.slice(2);
if (!(phase==='crossed' && paths.length===3 || ['development','confirmation'].includes(phase) && paths.length===1)) {
  throw Error('Use development duration-dev.json, confirmation cutoffs-dev.json, or crossed duration-check.json cutoffs-dev.json cutoffs-check.json.');
}
const [prior,frozen,confirmation]=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
const {epochs:starterEpochs,...sourceSettings}=settings;
assert.equal(starterEpochs,control.epochs);
let output;
if (phase==='development') {
  const {trainSeed,fieldSeeds}=design.development;
  assert.equal(prior.phase,'development');
  assert.deepEqual(prior.design.development,design.development);
  assert.deepEqual(prior.settings,sourceSettings);
  assert.deepEqual(prior.fits.map(f=>f.epochs),lengths);
  assert.ok(prior.manifest.every(t=>!allSeeds.includes(t.seed)));
  const fits=prior.fits.map(f=>{
    assert.equal(hash(f.model),f.weightHash);
    return {...f,manifest:prior.manifest,seed:trainSeed};
  });
  const result=score(allArms,fits,fieldSeeds);
  // The full cutoff sweep must replay the published .50 operating points exactly.
  for (const group of prior.summary) {
    for (const arm of group.models) {
      const scores=result.grid.find(r=>r.epochs===arm.epochs && r.percent===50).groups
        .find(g=>g.plantForm===group.plantForm && g.layout===group.layout).scores;
      assert.deepEqual(scores,arm.scores);
    }
  }
  output={...result,selection:choose(result.grid),datasetHash:prior.datasetHash,
    weightHashes:fits.map(({epochs,weightHash})=>({epochs,weightHash})),manifest:prior.manifest,
    preparationMs:prior.preparationMs,trainingMs:fits.map(({epochs,fitMs})=>({epochs,fitMs}))};
  output.freezeHash=freeze(output);
} else if (phase==='confirmation') {
  verifyFrozen(prior);
  const {trainSeed,fieldSeeds}=design.confirmation, {selection}=prior;
  const arms=unique([control,selection.short,selection.long].map(({epochs,percent})=>({epochs,percent})));
  const excluded=new Set([...allSeeds,...prior.manifest.map(t=>t.seed)]);
  const {fits,...receipt}=await fitSchedules(trainSeed,arms.map(a=>a.epochs),excluded);
  const result=score(arms,fits,fieldSeeds);
  const baseline=result.grid.find(a=>armKey(a)===armKey(control));
  const tunedShort=result.grid.find(a=>armKey(a)===armKey(selection.short));
  const tunedLong=result.grid.find(a=>armKey(a)===armKey(selection.long));
  output={...result,selection,freezeHash:prior.freezeHash,...receipt,
    shortVsStarter:compare(tunedShort,baseline),longVsStarter:compare(tunedLong,baseline),longVsTunedShort:compare(tunedLong,tunedShort)};
} else {
  verifyFrozen(frozen);
  assert.equal(confirmation.phase,'confirmation');
  assert.equal(confirmation.study,frozen.study);
  assert.deepEqual(confirmation.settings,settings);
  assert.deepEqual(confirmation.design,design);
  assert.deepEqual(confirmation.selection,frozen.selection);
  assert.equal(confirmation.freezeHash,frozen.freezeHash);
  assert.equal(prior.phase,'confirmation');
  assert.deepEqual(prior.settings,sourceSettings);
  assert.deepEqual(prior.design.development,design.development);
  const first=prior.design.confirmation, second=design.confirmation;
  assert.deepEqual(first,{trainSeed:987149,fieldSeeds:[40117063,40248041,40379057,40510081,40641029,40772099]});
  const excluded=new Set([...allSeeds,...first.fieldSeeds,...frozen.manifest.map(t=>t.seed)]);
  assert.ok(prior.manifest.every(t=>!excluded.has(t.seed)));
  for(const t of prior.manifest) excluded.add(t.seed);
  const counts=[control.epochs,frozen.selection.long.epochs];
  const cutoffs=[control.percent,frozen.selection.long.percent];
  const older=prior.fits.filter(f=>counts.includes(f.epochs)).map(f=>{
    assert.equal(hash(f.model),f.weightHash);
    return {...f,seed:first.trainSeed,manifest:prior.manifest};
  });
  assert.deepEqual(older.map(f=>f.epochs),counts);
  const {fits:recent,...receipt}=await fitSchedules(second.trainSeed,counts,excluded);
  assert.equal(receipt.datasetHash,confirmation.datasetHash);
  assert.equal(hash(receipt.manifest),hash(confirmation.manifest));
  assert.deepEqual(receipt.weightHashes,confirmation.weightHashes.filter(f=>counts.includes(f.epochs)));
  const fits=[...older,...recent], arms=fits.flatMap(({seed,epochs})=>cutoffs.map(percent=>({seed,epochs,percent})));
  const cohorts=[];
  for (const [name,source] of [['duration',first],['cutoffs',second]]) {
    const result=score(arms,fits,source.fieldSeeds);
    const historical=name==='duration' ? prior : confirmation;
    for (const row of result.grid.filter(g=>g.seed===source.trainSeed)) {
      for (const group of row.groups) {
        const same=g=>g.plantForm===group.plantForm && g.layout===group.layout;
        const previous=name==='duration' && row.percent===control.percent
          ? prior.summary.find(same).models.find(m=>m.epochs===row.epochs)
          : name==='cutoffs' ? confirmation.grid.find(g=>armKey(g)===armKey(row))?.groups.find(same) : null;
        if (previous) assert.deepEqual(group.scores,previous.scores);
      }
    }
    assert.deepEqual(result.fields.map(f=>[f.tileId,f.proposals,f.proposalMatches15]),
      historical.fields.map(f=>[f.tileId,f.proposals,f.proposalMatches15]));
    const started=performance.now();
    const ringSeedlingRanking=rankRingSeedlings(fits.filter(f=>f.epochs===frozen.selection.long.epochs),result.fields);
    cohorts.push({name,fieldSeeds:source.fieldSeeds,...result,ringSeedlingRanking,rankingMs:performance.now()-started});
  }
  output={analysis:'retrospective',freezeHash:frozen.freezeHash,arms,
    training:[{seed:first.trainSeed,datasetHash:prior.datasetHash},{seed:second.trainSeed,...receipt}],
    weightHashes:fits.map(({seed,epochs,weightHash})=>({seed,epochs,weightHash})),cohorts};
}
console.log(JSON.stringify({study:'tomato-duration-cutoffs-v1',phase,domain:'synthetic',backend:'CPU',
  node:process.version,cpu:cpus()[0]?.model,design,settings,thresholds,rule,...output},null,2));
