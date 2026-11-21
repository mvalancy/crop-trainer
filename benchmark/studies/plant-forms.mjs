// node benchmark/studies/plant-forms.mjs [crop] > plant-forms.json
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {cropProfile, crops} from '../../trainer/generator/crops.js';
import {buildDataset, makeRecipe, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId, weightArtifact} from '../../trainer/models/network.js';
import {formsFor} from '../../trainer/plants/forms.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {getSensor} from '../../trainer/generator/sensors.js';

const training = {
  plantArchitecture:2, plantForm:'mixed', plantCondition:'healthy', seed:71309,
  sensorMode:'reference', trainingRayBudget:30000, validationRayBudget:30000, trainFields:6, valFields:1,
  hiddenLayers:[4], activation:'tanh', epochs:40, optimizer:'sgd', batchSize:0, lr:.25, initSeed:12345, threshold:.5
};
const evaluation = {seeds:[39119,53267,70657], sensor:'reference', points:30000, ground:true,
  weeds:false, sticks:false, boards:false, scanNoise:null};

function treatments(crop) {
  return [
    ...['mixed', ...formsFor(crop).map(form => form.id)].map(plantForm => ({plantForm,plantCondition:'healthy'})),
    {plantForm:'mixed',plantCondition:'mixed'}, {plantForm:'mixed',plantCondition:'damaged'}
  ];
}

function score(scan, model) {
  const tileId = scan.labels.tile_id;
  const labels = {filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
  const result = runFieldTest({model,xyz:scan.xyz,labels,tileId});
  const plantTraits = {};
  for (const box of scan.labels.boxes) {
    const key = box.plant_form+'/'+box.plant_condition;
    plantTraits[key] = (plantTraits[key] ?? 0) + 1;
  }
  return {
    seed:scan.p.seed, tileId, targets:result.references.length, sampledRays:scan.sampledRays, returns:result.pointCount,
    cropReturns:scan.plantReturns.reduce((sum, hits) => sum+hits,0), zeroReturnPlants:scan.coverage.zero, plantTraits,
    stages15cm:result.stages15cm, scores:result.evaluation.scores, heightBaselineScores:result.baselineEvaluation.scores
  };
}

function poolScores(scans, key) {
  return MATCH_RADII_METERS.map((radius,i) => {
    let tp = 0, fp = 0, fn = 0;
    for (const scan of scans) {
      const score = scan[key][i];
      assert.equal(score.cm, radius*100);
      tp += score.tp;
      fp += score.fp;
      fn += score.fn;
    }
    return {cm:radius*100, tp,fp,fn, precision:tp+fp ? tp/(tp+fp) : null, recall:tp+fn ? tp/(tp+fn) : null,
      f1:2*tp+fp+fn ? 2*tp/(2*tp+fp+fn) : null};
  });
}

function summarize(scans) {
  const total = key => scans.reduce((sum,scan) => sum+scan[key],0);
  const targets = total('targets');
  const available = scans.reduce((sum,scan) => sum+scan.stages15cm.find(row => row.stage==='proposals').matched,0);
  const scores = poolScores(scans,'scores');
  return {targets, cropReturnsPerPlant:total('cropReturns')/targets, zeroReturnPlants:total('zeroReturnPlants'),
    proposalMatches15cm:available, proposalRecall15cm:available/targets, scores, heightBaselineScores:poolScores(scans,'heightBaselineScores'),
    meanF1:scores.reduce((sum,row) => sum+row.f1,0)/scores.length};
}

async function runCrop(crop) {
  const profile = cropProfile(crop);
  const settings = {...training,crop,minimumHeight:profile.peakHeight};
  const timingsMs = {};
  let start = performance.now();
  const set = await buildDataset(settings);
  timingsMs.trainingData = performance.now()-start;
  const seen = new Set(set.manifest.map(tile => tile.seed));
  assert.ok(evaluation.seeds.every(seed => !seen.has(seed)), 'The survey needs unseen plantings.');
  start = performance.now();
  const fit = await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
  const model = weightArtifact({settings,weights:fit.weights,scaling:set.scaling,trainer:trainerId(settings),epochs:fit.epochsCompleted});
  timingsMs.fit = performance.now()-start;

  const {sensor,seeds,ground,...scanSettings} = evaluation;
  timingsMs.heldOutGeneration = 0;
  timingsMs.validation = 0;
  const arms = treatments(crop).map(treatment => ({...treatment,scans:[]}));
  for (const seed of seeds) {
    const common = {...makeRecipe(seed,ground,getSensor(sensor),crop,2),...scanSettings};
    let originalBoxes;
    for (const arm of arms) {
      start = performance.now();
      const scan = field({...common,plantForm:arm.plantForm,plantCondition:arm.plantCondition});
      timingsMs.heldOutGeneration += performance.now()-start;

      // System labels record the planted base. Vegetable box centers can move
      // when one side changes shape, so only plant identities/counts pair there.
      const boxes = scan.labels.boxes;
      originalBoxes ??= boxes;
      assert.equal(boxes.length, originalBoxes.length);
      if (profile.system) {
        assert.deepEqual(boxes.map(box => box.base_xy_m), originalBoxes.map(box => box.base_xy_m));
      }
      start = performance.now();
      arm.scans.push(score(scan,model));
      timingsMs.validation += performance.now()-start;
    }
  }
  return {settings, pinSeparationM:model.pinSeparation, trainingSeeds:set.stats.fieldSeeds.training,
    trainingGroundVariants:[true,false], evaluationInfrastructure:!!profile.fixtures,
    scoringTarget:profile.system ? 'plant base XY' : 'horizontal box midpoint',
    trainExamples:set.stats.samples, fittedWeights:model.weights.length, timingsMs,
    arms:arms.map(arm => ({...arm, pooled:summarize(arm.scans)}))};
}

const selected = process.argv.slice(2);
const usage = 'Usage: node benchmark/studies/plant-forms.mjs [crop]\nCrop options: '+Object.keys(crops).join(', ');
if (selected.length === 1 && selected[0] === '--help') console.log(usage);
else if (selected.length > 1 || (selected.length && !Object.hasOwn(crops,selected[0]))) {
  console.error(usage);
  process.exitCode = 1;
} else {
  const runs = [];
  for (const crop of selected.length ? selected : Object.keys(crops)) runs.push(await runCrop(crop));
  const host = {node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model};
  console.log(JSON.stringify({domain:'synthetic',backend:'Node CPU',host,training,evaluation,runs},null,2));
}
