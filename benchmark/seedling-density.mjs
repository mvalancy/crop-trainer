// From the repository root, run: node benchmark/seedling-density.mjs > seedling-density.json
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {createHash} from 'node:crypto';
import {buildDataset, features, makeRecipe, matchCenters, MATCH_RADII_METERS} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {trainNetworkCPU} from '../trainer/neural.js';
import {trainerId, weightArtifact} from '../trainer/network.js';
import {runFieldTest} from '../trainer/score-scan.js';
import {getSensor,layoutCapacity} from '../trainer/sensors.js';

const design = {
  trainingSeeds:[82173,379331], testSeeds:[110821,216917,337013,449047,551099,669073],
  forms:['seedling','transplant'], rayBudgets:[12000,30000,100000,1000000], peakHeightsM:[.065,.035],
  heldOutRecipe:{crop:'tomato',plantArchitecture:2,plantCondition:'healthy',ground:true,sensor:'reference',
    weeds:false, sticks:false, boards:false, scanNoise:null}
};
const training = {crop:'tomato',plantArchitecture:2,plantForm:'mixed',plantCondition:'healthy',
  sensorMode:'reference',trainingRayBudget:30000,validationRayBudget:30000,trainFields:6,valFields:1,
  epochs:40,lr:.25,initSeed:12345,hiddenLayers:[4],activation:'tanh',optimizer:'sgd',batchSize:0,threshold:.5};
const args = process.argv.slice(2);
const mode = args[0];
if (args.length>1 || (mode && !['--match-training-density','--layout-transfer','--match-training-layout'].includes(mode))) {
  throw Error('Usage: node benchmark/seedling-density.mjs [--match-training-density | --layout-transfer | --match-training-layout]');
}
const compareFits = !!mode;
if (compareFits) {
  design.forms = ['seedling'];
  design.rayBudgets = [1000000];
  design.peakHeightsM = [.065];
  design.trainingRayBudgets = [30000,1000000];
  training.plantForm = 'seedling';
}
if (mode === '--match-training-density') {
  // The original six fields motivated this comparison. These four new fields
  // are held out separately for confirmation, without choosing a fit on them.
  design.testGroups = {original:[...design.testSeeds],confirmation:[793803,901213,1047581,1200833]};
  design.testSeeds = Object.values(design.testGroups).flat();
}
if (mode === '--layout-transfer') {
  const ringCapacity = layoutCapacity(getSensor('os1-64'));
  design.testSeeds = [1370561,1481707,1592011,1703069,1814201,1925237,2036279,2147411];
  design.scanArms = [30000,60000,ringCapacity].flatMap(sampledRays => [
    {sensor:'reference',points:sampledRays,sampledRays},
    {sensor:'os1-64',points:sampledRays===ringCapacity ? 1000000 : sampledRays,sampledRays}
  ]);
  design.scanArms.push({sensor:'reference',points:1000000,sampledRays:1000000});
  delete design.rayBudgets;
  delete design.heldOutRecipe.sensor;
}
const matchLayout = mode === '--match-training-layout';
if (matchLayout) {
  design.testSeeds = [2268523,2379659,2490781,2601907];
  design.trainingLayouts = ['reference','os1-64'];
  design.trainingRayBudgets = [60000];
  training.trainingRayBudget = 60000;
  training.validationRayBudget = 60000;
  training.validationSensorMode = 'reference';
  design.scanArms = design.trainingLayouts.map(sensor => ({sensor,points:60000,sampledRays:60000}));
  delete design.rayBudgets;
  delete design.heldOutRecipe.sensor;
}
const fitVariants = (design.trainingLayouts ?? [training.sensorMode]).flatMap(sensorMode =>
  design.peakHeightsM.flatMap(minimumHeight => (design.trainingRayBudgets ?? [training.trainingRayBudget])
    .map(trainingRayBudget => ({sensorMode,minimumHeight,trainingRayBudget}))));
const timingsMs = {trainingData:0,fit:0,heldOutGeneration:0,validation:0,soilDiagnostic:0};

async function trainDetectors() {
  const models = [];
  for (const seed of design.trainingSeeds) {
    let manifest;
    let pairedTruth;
    for (const {sensorMode,minimumHeight,trainingRayBudget} of fitVariants) {
      const settings = {...training,seed,sensorMode,minimumHeight,trainingRayBudget};
      let start = performance.now();
      const truth = [];
      const set = await buildDataset({...settings,onScan:matchLayout ? scan => {
        assert.equal(scan.sampledRays,60000);
        truth.push(scan.labels.boxes);
      } : undefined});
      if (matchLayout) {
        pairedTruth ??= truth;
        assert.deepEqual(truth,pairedTruth);
      }
      const generationMs = performance.now()-start;
      timingsMs.trainingData += generationMs;
      const recipes = set.manifest.map(tile => tile.recipe);
      manifest ??= recipes;
      recipes.forEach((recipe,i) => {
        const sampling = set.manifest[i].split === 'train' ? sensorMode : settings.validationSensorMode ?? sensorMode;
        assert.deepEqual(recipe,{...manifest[i],points:recipe.points,sampling:getSensor(sampling)});
      });
      assert.ok(recipes.every((recipe,i) => recipe.points === (set.manifest[i].split === 'train' ? trainingRayBudget : training.validationRayBudget)));
      assert.ok(!set.manifest.some(tile => design.testSeeds.includes(tile.seed)));
      start = performance.now();
      const fit = await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
      const model = weightArtifact({settings,weights:fit.weights,scaling:set.scaling,trainer:trainerId(settings),epochs:fit.epochsCompleted});
      const fitMs = performance.now()-start;
      timingsMs.fit += fitMs;
      models.push({seed,minimumHeight,trainingSensor:sensorMode,trainingRayBudget,examples:set.stats.samples,
        modelJsonSha256:createHash('sha256').update(JSON.stringify(model)).digest('hex'),
        fieldSeeds:set.stats.fieldSeeds.training,timingsMs:{generationMs,fitMs},model});
    }
  }
  return models;
}

function score(scan, {seed,minimumHeight,trainingSensor,trainingRayBudget,model}) {
  const tileId = scan.labels.tile_id;
  const labels = {filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
  const test = runFieldTest({model,xyz:scan.xyz,labels,tileId});
  const matchesWithoutCropReturns = test.evaluation.pinByReference15.filter((pin,i) => pin>=0 && scan.plantReturns[i]===0).length;
  return {seed,minimumHeight,trainingSensor,trainingRayBudget,stages15cm:test.stages15cm,scores:test.evaluation.scores,
    heightBaselineScores:test.baselineEvaluation.scores, matchesWithoutCropReturns};
}

// Negative control: discard simulator-labeled crop returns. Can the remaining
// sampled soil produce peaks near the original targets purely by coincidence?
function terrainControl(scan) {
  const xyz = new Float32Array(scan.counts[0]*3);
  let j = 0;
  for (let i=0;i<scan.cls.length;i++) {
    if (scan.cls[i] !== 0) continue;
    xyz[j++] = scan.xyz[3*i];
    xyz[j++] = scan.xyz[3*i+1];
    xyz[j++] = scan.xyz[3*i+2];
  }
  assert.equal(j,xyz.length);
  const truth = scan.labels.boxes.map(({min,max}) => [(min[0]+max[0])/2,(min[1]+max[1])/2]);
  return design.peakHeightsM.map(minimumHeight => {
    const {pos} = features({xyz},minimumHeight);
    return {minimumHeight,proposals:pos.length,coincidences15cm:matchCenters(pos,truth,.15).count};
  });
}

function poolScores(runs,key) {
  return MATCH_RADII_METERS.map((r,i) => {
    const scores = runs.map(run => run[key][i]);
    const count = key => scores.reduce((total,row) => total+row[key],0);
    const tp = count('tp'), fp = count('fp'), fn = count('fn');
    return {cm:100*r,tp,fp,fn,precision:tp+fp ? tp/(tp+fp) : null,recall:tp/(tp+fn),
      f1:2*tp/(2*tp+fp+fn)};
  });
}

function summarize(scans,models) {
  return models.map(({seed,minimumHeight,trainingSensor,trainingRayBudget},index) => {
    const runs = scans.map(scan => scan.evaluations[index]);
    const sum = key => scans.reduce((n,scan) => n+scan[key],0);
    const stages15cm = runs[0].stages15cm.map(({stage},i) => ({
      stage,count:runs.reduce((n,run) => n+run.stages15cm[i].count,0),
      matched:runs.reduce((n,run) => n+run.stages15cm[i].matched,0)
    }));
    const soil = scans.map(scan => scan.soilControl.find(result => result.minimumHeight===minimumHeight));
    return {trainingSeed:seed, minimumHeight, trainingSensor, trainingRayBudget, targets:sum('targets'), zeroReturnPlants:sum('zeroReturnPlants'),
      cropReturns:sum('cropReturns'), stages15cm, soilOnlyProposals:soil.reduce((n,row) => n+row.proposals,0),
      soilOnlyCoincidences15cm:soil.reduce((n,row) => n+row.coincidences15cm,0),
      finalMatchesWithoutCropReturns15cm:runs.reduce((n,run) => n+run.matchesWithoutCropReturns,0),
      scores:poolScores(runs,'scores'), heightBaselineScores:poolScores(runs,'heightBaselineScores')};
  });
}

const models = await trainDetectors();
const fields = [];
const {sensor,...heldOutRecipe} = design.heldOutRecipe;
const scanArms = design.scanArms ?? design.rayBudgets.map(points => ({sensor,points,sampledRays:points}));
for (const seed of design.testSeeds) {
  const originalBoxes = new Map();
  for (const arm of scanArms) {
    const {points} = arm;
    const common = makeRecipe(seed,heldOutRecipe.ground,getSensor(arm.sensor),heldOutRecipe.crop,heldOutRecipe.plantArchitecture);
    let pairedXYZ;
    for (const plantForm of design.forms) {
      const recipe = {...common,...heldOutRecipe,points,plantForm};
      let start = performance.now();
      const scan = field(recipe);
      timingsMs.heldOutGeneration += performance.now()-start;
      assert.equal(scan.sampledRays,arm.sampledRays);
      assert.equal(scan.xyz.length/3,arm.sampledRays);
      const boxes = scan.labels.boxes;
      if (!originalBoxes.has(plantForm)) originalBoxes.set(plantForm,boxes);
      assert.deepEqual(originalBoxes.get(plantForm),boxes);
      // At one budget both forms receive identical ray positions. Across budgets
      // the generator redraws its grid, while preserving the planting and boxes.
      if (pairedXYZ) {
        assert.equal(pairedXYZ.length,scan.xyz.length);
        for (let i=0;i<pairedXYZ.length;i+=3) {
          assert.equal(pairedXYZ[i],scan.xyz[i]);
          assert.equal(pairedXYZ[i+1],scan.xyz[i+1]);
        }
      } else pairedXYZ=scan.xyz;
      start = performance.now();
      const evaluations = models.map(model => score(scan,model));
      if (compareFits) {
        for (const result of evaluations.slice(1)) {
          assert.deepEqual(result.stages15cm[0],evaluations[0].stages15cm[0]);
          assert.deepEqual(result.heightBaselineScores,evaluations[0].heightBaselineScores);
        }
      }
      timingsMs.validation += performance.now()-start;
      start = performance.now();
      const soilControl = terrainControl(scan);
      timingsMs.soilDiagnostic += performance.now()-start;
      fields.push({seed,plantForm,sensor:arm.sensor,points,tileId:scan.labels.tile_id,sampledRays:scan.sampledRays,targets:boxes.length,
        zeroReturnPlants:scan.coverage.zero,cropReturns:scan.counts[1], evaluations, soilControl});
    }
    if (design.forms.includes('transplant')) assert.equal(originalBoxes.get('seedling').length,originalBoxes.get('transplant').length);
  }
}
const pooled = design.forms.flatMap(plantForm => scanArms.map(({sensor,points,sampledRays}) => ({
  plantForm,sensor,points,sampledRays,runs:summarize(fields.filter(scan => scan.plantForm===plantForm &&
    scan.sensor===sensor && scan.points===points),models)
})));
const groups = design.testGroups ? Object.fromEntries(Object.entries(design.testGroups).map(([name,seeds]) =>
  [name,summarize(fields.filter(scan => seeds.includes(scan.seed)),models)])) : undefined;
const host = {node:process.version,arch:process.arch,platform:process.platform,cpu:cpus()[0]?.model};
console.log(JSON.stringify({domain:'synthetic',backend:'Node CPU',host,training,design,timingsMs,
  fits:models.map(({model,...metadata})=>metadata),pooled,groups,fields},null,2));
