// node benchmark/seedling-peak-fit.mjs > seedling-peak-fit.json
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {createHash} from 'node:crypto';
import {buildDataset, features, detectionStages, matchCenters, targetCenters, makeRecipe, MATCH_RADII_METERS} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {trainNetworkCPU} from '../trainer/neural.js';
import {weightArtifact,trainerId,scoreSavedWeights} from '../trainer/network.js';
import {runFieldTest} from '../trainer/score-scan.js';
import {getSensor} from '../trainer/sensors.js';
import {cropProfile} from '../trainer/crops.js';

const design = {
  trainingSeeds:[82173,379331], testSeeds:[3842783,3953909,4065031,4176151,4287287,4398419,4509541,4620673],
  layouts:['reference','os1-64'], rules:['zero-filled','occupied'], gates:[.065,.035], cutoffs:[.5,.75],
  noise:{xy:.8,z:.7,density:12,gaps:2,stray:.15,cluster:10}, points:60000
};
const training = {crop:'tomato',plantArchitecture:2,plantForm:'seedling',plantCondition:'healthy',
  trainFields:6,valFields:1,trainingRayBudget:design.points,validationRayBudget:design.points,
  hiddenLayers:[4],activation:'tanh',epochs:40,initSeed:12345,optimizer:'sgd',batchSize:0,lr:.25};
const spacing = cropProfile(training.crop).pinSeparation;
const timingsMs = {trainingData:0,fit:0,heldOutGeneration:0,scoring:0};
const fits = [];
const rows = [];

function getTrainingScan(cache,recipe) {
  const key = JSON.stringify(recipe);
  if (!cache.has(key)) cache.set(key,field(recipe));
  return cache.get(key);
}

for (const seed of design.trainingSeeds) {
  let pairedPlantings;
  for (const sensorMode of design.layouts) {
    // Each rule and gate sees the same raw XYZ arrays and target boxes.
    const cache = new Map();
    let pairedTiles;
    for (const gate of design.gates) for (const rule of design.rules) {
      const settings = {...training,seed,sensorMode,minimumHeight:gate,peakAveraging:rule};
      let start = performance.now();
      const set = await buildDataset({...settings,generate:recipe => getTrainingScan(cache,recipe)});
      timingsMs.trainingData += performance.now()-start;
      assert.equal(set.stats.peakAveraging ?? 'zero-filled',rule);
      assert.ok(set.manifest.every(tile => tile.sampledRays===design.points && !design.testSeeds.includes(tile.seed)));
      const tiles = set.manifest.map(tile => tile.tile_id);
      pairedTiles ??= tiles;
      assert.deepEqual(tiles,pairedTiles);
      const plantings = [...cache.values()].map(scan => {
        const {sampling,...recipe} = scan.p;
        assert.equal(sampling.key,sensorMode);
        return {recipe,boxes:scan.labels.boxes};
      });
      pairedPlantings ??= plantings;
      assert.deepEqual(plantings,pairedPlantings);
      start = performance.now();
      const {weights} = await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
      timingsMs.fit += performance.now()-start;
      const artifact = weightArtifact({settings:{...settings,threshold:design.cutoffs[0]},scaling:set.scaling,weights,
        trainer:trainerId(settings),epochs:training.epochs});
      const sha256 = createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
      fits.push({seed,sensorMode,gate,rule,samples:set.Y.length,trainingSeeds:set.stats.fieldSeeds.training,
        trainingTiles:set.manifest.filter(tile => tile.split==='train').map(tile=>tile.tile_id), sha256,artifact});
    }
  }
}

function assertFieldTestParity(scan,model,neural,height) {
  const evaluated = runFieldTest({xyz:scan.xyz,model:model.artifact,tileId:scan.labels.tile_id,
    labels:{filename:'field.labels.json',text:JSON.stringify(scan.labels)}});
  const counts = ({cm,tp,fp,fn})=>({cm,tp,fp,fn});
  assert.deepEqual(neural.byTolerance.map(counts),evaluated.evaluation.scores.map(counts));
  assert.deepEqual(height.byTolerance.map(counts),evaluated.baselineEvaluation.scores.map(counts));
}

function subset(scan,soilOnly) {
  const xyz = new Float32Array(scan.xyz.length);
  let n = 0;
  for (let i=0;i<scan.cls.length;i++) {
    if (soilOnly ? scan.cls[i]!==0 : scan.cls[i]===1) continue;
    xyz[n++] = scan.xyz[3*i];
    xyz[n++] = scan.xyz[3*i+1];
    xyz[n++] = scan.xyz[3*i+2];
  }
  return xyz.subarray(0,n);
}

function pinsAndMatches(f,scores,cutoff,truth,full) {
  const pins = detectionStages(f,scores,cutoff,spacing).selected;
  if (!full) return {pins:pins.length};
  const byTolerance = MATCH_RADII_METERS.map(radius => {
    const {count:tp,pinByBox} = matchCenters(pins,truth,radius);
    const matchedBoxes = [];
    if (radius===.15) pinByBox.forEach((pin,box)=>{if(pin!==-1)matchedBoxes.push(box);});
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp,...(radius===.15?{matchedBoxes}:{})};
  });
  return {pins:pins.length,byTolerance};
}

function assess(xyz,scan,sample,sensor,condition) {
  const truth = targetCenters(scan.labels.boxes);
  const full = sample==='full';
  for (const gate of design.gates) {
    let defaultHeightBoxes;
    for (const rule of design.rules) {
      const f = features({xyz},gate,rule);
      const heights = f.pos.map((_,i)=>f.X[13*i]);
      const heightResult = pinsAndMatches(f,heights,0,truth,full);
      const common = {seed:scan.p.seed,tileId:scan.labels.tile_id,sensor,condition,sample,gate,rule,returns:xyz.length/3,
        targets:full?truth.length:0,proposals:f.pos.length};
      if (full) common.inReach15 = matchCenters(f.pos,truth,.15).count;
      rows.push({...common,method:'height',...heightResult});
      let recovered;
      if (full) {
        const at15=heightResult.byTolerance.at(-1).matchedBoxes;
        if (rule==='zero-filled') defaultHeightBoxes = new Set(at15);
        else recovered = at15.filter(box => !defaultHeightBoxes.has(box));
      }
      // Only a fit created from this layout, smoothing rule and gate can score these rows.
      for (const model of fits.filter(m=>m.sensorMode===sensor && m.gate===gate && m.rule===rule)) {
        const scores = scoreSavedWeights(f.X,model.artifact,rule);
        for (const cutoff of design.cutoffs) {
          const result = pinsAndMatches(f,scores,cutoff,truth,full);
          if (full && condition==='clean' && scan.p.seed===design.testSeeds[0] && cutoff===design.cutoffs[0]) {
            assertFieldTestParity(scan,model,result,heightResult);
          }
          if (recovered) {
            const retained = new Set(result.byTolerance.at(-1).matchedBoxes);
            result.additionalHeightMatches15 = recovered.length;
            result.retainedAdditional15 = recovered.filter(box=>retained.has(box)).length;
          }
          rows.push({...common,method:'neural',trainingSeed:model.seed,cutoff,...result});
        }
      }
    }
  }
}

for (const seed of design.testSeeds) {
  let pairedBoxes;
  for (const sensor of design.layouts) for (const condition of ['clean','noisy-clutter']) {
    const recipe = makeRecipe(seed,true,getSensor(sensor),training.crop,training.plantArchitecture,training.plantForm,training.plantCondition);
    const clutter = condition==='noisy-clutter';
    let start = performance.now();
    const scan = field({...recipe,points:design.points,weeds:clutter,sticks:clutter,boards:clutter,
      scanNoise:clutter?{seed:recipe.scanNoise.seed,...design.noise}:null});
    timingsMs.heldOutGeneration += performance.now()-start;
    assert.equal(scan.sampledRays,design.points);
    pairedBoxes ??= scan.labels.boxes;
    assert.deepEqual(scan.labels.boxes,pairedBoxes);
    start = performance.now();
    assess(scan.xyz,scan,'full',sensor,condition);
    assess(subset(scan,true),scan,'soil',sensor,condition);
    if (clutter) assess(subset(scan,false),scan,'noncrop',sensor,condition);
    timingsMs.scoring += performance.now()-start;
  }
}

function summarize(group) {
  const sum = key => group.reduce((n,row)=>n+row[key],0);
  const first=group[0];
  const totals={plots:group.length,targets:sum('targets'),pins:sum('pins'),proposals:sum('proposals')};
  if (first.sample!=='full') return {...totals,falsePins:totals.pins};
  totals.inReach15=sum('inReach15');
  totals.scores=MATCH_RADII_METERS.map((radius,i)=>{
    const tp=group.reduce((n,row)=>n+row.byTolerance[i].tp,0);
    const fp=totals.pins-tp,fn=totals.targets-tp;
    return {cm:100*radius,tp,fp,fn,precision:totals.pins?tp/totals.pins:null,recall:tp/totals.targets,
      f1:2*tp/(totals.pins+totals.targets)};
  });
  if ('retainedAdditional15' in first) {
    totals.additionalHeightMatches15=sum('additionalHeightMatches15');
    totals.retainedAdditional15=sum('retainedAdditional15');
  }
  return totals;
}
const groups=Object.groupBy(rows,r=>[r.sensor,r.condition,r.sample,r.gate,r.rule,r.method,r.trainingSeed??'',r.cutoff??''].join('/'));
const summary=Object.fromEntries(Object.entries(groups).map(([key,group])=>[key,summarize(group)]));
console.log(JSON.stringify({domain:'synthetic',backend:'Node CPU',node:process.version,cpu:cpus()[0]?.model,training,design,
  controlScoring:'All pins on soil or noncrop subsets are false detections.',timingsMs,
  fits:fits.map(({artifact,...metadata})=>({...metadata,featureSchema:artifact.featureSchema})),summary,rows},null,2));
