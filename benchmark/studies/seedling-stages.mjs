// Reconstruct the four published seedling models and freeze them before opening any test plot.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {buildDataset, makeRecipe, targetCenters, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId, weightArtifact} from '../../trainer/models/network.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {getSensor} from '../../trainer/generator/sensors.js';

const design = {
  testSeeds:[3917711,4028823,4139941,4251077,4362181,4473331],
  forms:['seedling','transplant','branching'], layouts:['reference','os1-64'],
  validationRays:60000, ground:true, weeds:false, sticks:false, boards:false, scanNoise:null
};
const settings = {
  crop:'tomato', plantArchitecture:2, plantForm:'seedling', plantCondition:'healthy',
  sensorMode:'reference', validationRayBudget:30000, trainFields:6, valFields:1,
  minimumHeight:.065, epochs:40, lr:.25, initSeed:12345, hiddenLayers:[4], activation:'tanh',
  optimizer:'sgd', batchSize:0, threshold:.5
};
// SHA-256 of JSON.stringify(weightArtifact) from seedling-density.mjs --layout-transfer.
const previousFits = [
  [82173,30000,'93af98cae6c801ef8833bd9808c88d5948c4483bd954557dec8d911b533f7a4f'],
  [82173,1000000,'43c3b0992ae77ad5821ca1818a2e8109323d3d968e31af02ad8cbd6f86334d44'],
  [379331,30000,'fb02bcc6544d57d8c13382c9cfc3b0746ed56e55b383ed65f519b8336e472c88'],
  [379331,1000000,'fc68b4c04fc552949de86ff0f3cef8de2587adc70e52daf90b862eec9ed3a898']
];
const timingsMs = {trainingData:0, fit:0, heldOutGeneration:0, scoring:0};
const fits = [];
for (const [seed,trainingRayBudget,modelJsonSha256] of previousFits) {
  const config = {...settings,seed,trainingRayBudget};
  let start = performance.now();
  const set = await buildDataset(config);
  timingsMs.trainingData += performance.now()-start;
  assert.ok(set.manifest.every(tile=>!design.testSeeds.includes(tile.seed)));
  start = performance.now();
  const fit = await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
  const model = weightArtifact({settings:config,trainer:trainerId(config),epochs:fit.epochsCompleted,weights:fit.weights,scaling:set.scaling});
  assert.equal(createHash('sha256').update(JSON.stringify(model)).digest('hex'),modelJsonSha256,'Frozen seedling artifact changed');
  timingsMs.fit += performance.now()-start;
  fits.push({seed,trainingRayBudget,modelJsonSha256,trainingFieldSeeds:set.stats.fieldSeeds.training,model});
}

const fields = [];
for (const seed of design.testSeeds) {
  const centersByForm = new Map();
  for (const sensor of design.layouts) {
    let rayPositions;
    for (const plantForm of design.forms) {
      const recipe = {...makeRecipe(seed,design.ground,getSensor(sensor),'tomato',2,plantForm,'healthy'),
        points:design.validationRays,weeds:design.weeds,sticks:design.sticks,boards:design.boards,scanNoise:design.scanNoise};
      let start = performance.now();
      const scan = field(recipe);
      timingsMs.heldOutGeneration += performance.now()-start;
      assert.equal(scan.sampledRays,design.validationRays);
      assert.equal(scan.xyz.length/3,design.validationRays);
      if (rayPositions) {
        for (let i=0;i<scan.xyz.length;i+=3) {
          assert.equal(scan.xyz[i],rayPositions[i]);
          assert.equal(scan.xyz[i+1],rayPositions[i+1]);
        }
      } else rayPositions = scan.xyz;
      const centers = targetCenters(scan.labels.boxes);
      if (centersByForm.has(plantForm)) assert.deepEqual(centers,centersByForm.get(plantForm));
      else centersByForm.set(plantForm,centers);
      const seedlingCenters = centersByForm.get('seedling');
      assert.equal(centers.length,seedlingCenters.length);
      const centerShiftsM = centers.map(([x,y],i)=>Math.hypot(x-seedlingCenters[i][0],y-seedlingCenters[i][1]));
      start = performance.now();
      const tileId = scan.labels.tile_id;
      const labels = {filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
      const scores = [];
      let baseline, proposals;
      for (const fit of fits) {
        const result = runFieldTest({model:fit.model,xyz:scan.xyz,labels,tileId});
        baseline ??= result.baselineEvaluation.scores;
        proposals ??= result.stages15cm[0];
        assert.deepEqual(result.baselineEvaluation.scores,baseline);
        assert.deepEqual(result.stages15cm[0],proposals);
        scores.push({modelJsonSha256:fit.modelJsonSha256, byDistance:result.evaluation.scores});
      }
      timingsMs.scoring += performance.now()-start;
      fields.push({seed,plantForm,sensor,tileId,sampledRays:scan.sampledRays,targets:centers.length,
        maxCenterShiftFromSeedlingM:Math.max(...centerShiftsM),zeroReturnPlants:scan.coverage.zero,
        reachable15cm:proposals.matched, baseline, scores});
    }
  }
}

function pool(scans, select) {
  return MATCH_RADII_METERS.map((radius,i)=>{
    let tp=0,fp=0,fn=0;
    for (const scan of scans) {
      const score = select(scan)[i];
      assert.equal(score.cm,100*radius);
      tp+=score.tp; fp+=score.fp; fn+=score.fn;
    }
    return {cm:100*radius,tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};
  });
}
const pooled = [];
for (const plantForm of design.forms) for (const sensor of design.layouts) {
  const scans=fields.filter(scan=>scan.plantForm===plantForm&&scan.sensor===sensor);
  const sum = key=>scans.reduce((n,scan)=>n+scan[key],0);
  pooled.push({plantForm,sensor,targets:sum('targets'),zeroReturnPlants:sum('zeroReturnPlants'),
    reachable15cm:sum('reachable15cm'),maxCenterShiftFromSeedlingM:Math.max(...scans.map(scan=>scan.maxCenterShiftFromSeedlingM)),
    baseline:pool(scans,scan=>scan.baseline),fits:fits.map(({seed,trainingRayBudget},i)=>({
      seed,trainingRayBudget,byDistance:pool(scans,scan=>scan.scores[i].byDistance)
    }))});
}
const host={node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model};
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',host,settings,design,timingsMs,
  fits:fits.map(({model,...metadata})=>metadata),pooled,fields},null,2));
