// First use development fields to choose a length. Run confirmation separately with that decision.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {buildDataset} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId, weightArtifact} from '../../trainer/models/network.js';
import {settings as soilSettings, scoreFields} from './tomato-soil-controls.mjs';

const design = {
  development:{trainSeed:914731,fieldSeeds:[39112043,39243071,39374039,39505087]},
  confirmation:{trainSeed:987149,fieldSeeds:[40117063,40248041,40379057,40510081,40641029,40772099]}
};
const lengths = [40,160,640];
const rule = 'At 15 cm, require positive seedling F1 gain on both layouts and at most 0.01 branching precision loss on either. Rank by the smaller seedling F1 gain, shorter on ties. Otherwise retain 40 epochs.';
const {epochs:baselineEpochs,...settings} = {...soilSettings,sampleLimit:600,positiveSampling:'ordinary'};
assert.equal(lengths[0],baselineEpochs);
const digest = data => createHash('sha256').update(data).digest('hex');
function score15(summary,layout,form,epochs) {
  return summary.find(s=>s.layout===layout && s.plantForm===form)
    .models.find(m=>m.epochs===epochs).scores.find(s=>s.cm===15);
}

function compareWithStarter(summary,epochs) {
  const layouts = ['reference','os1-64'].map(layout => {
    const seedlingGain = score15(summary,layout,'seedling',epochs).f1 -
      score15(summary,layout,'seedling',baselineEpochs).f1;
    const starter = score15(summary,layout,'branching',baselineEpochs).precision;
    const contender = score15(summary,layout,'branching',epochs).precision;
    const precisionGain = starter === null || contender === null ? null : contender-starter;
    return {layout,seedlingF1Gain:seedlingGain,branchingPrecisionGain:precisionGain,
      qualified:seedlingGain > 0 && precisionGain !== null && precisionGain >= -.01};
  });
  return {epochs,layouts,qualified:layouts.every(l=>l.qualified),
    smallerSeedlingGain:Math.min(...layouts.map(l=>l.seedlingF1Gain))};
}
function choose(checks) {
  const eligible = checks.filter(c=>c.qualified)
    .sort((a,b)=>b.smallerSeedlingGain-a.smallerSeedlingGain || a.epochs-b.epochs);
  return eligible[0]?.epochs ?? baselineEpochs;
}

const [phase,developmentFile] = process.argv.slice(2);
if (!(phase==='development' && process.argv.length===3 || phase==='confirmation' && process.argv.length===4)) {
  throw Error('Use development, or confirmation followed by the development JSON filename.');
}
const {trainSeed,fieldSeeds} = design[phase];
const allTestSeeds = Object.values(design).flatMap(cohort=>cohort.fieldSeeds);
assert.equal(allTestSeeds.length,new Set(allTestSeeds).size);
let development, frozen;
if (phase==='confirmation') {
  development = JSON.parse(await readFile(developmentFile,'utf8'));
  assert.equal(development.phase,'development');
  assert.deepEqual(development.design,design);
  assert.deepEqual(development.lengths,lengths);
  assert.deepEqual(development.settings,settings);
  assert.equal(development.rule,rule);
  frozen = choose(lengths.slice(1).map(epochs=>compareWithStarter(development.summary,epochs)));
  assert.equal(development.selectedEpochs,frozen);
}
const start = performance.now();
const set = await buildDataset({...settings,seed:trainSeed,auditPositiveSampling:true});
const preparationMs = performance.now()-start;
assert.equal(set.Y.length,settings.sampleLimit);
assert.equal(set.Y.reduce((total,y)=>total+y,0),settings.sampleLimit/2);
const rowDigest = () => createHash('sha256').update(new Uint8Array(set.X.buffer))
  .update(new Uint8Array(set.Y.buffer)).update(JSON.stringify(set.scaling)).digest('hex');
const datasetHash = rowDigest();
for (const t of set.manifest) {
  assert.ok(!allTestSeeds.includes(t.seed));
  if (development) assert.ok(!development.manifest.some(d=>d.seed===t.seed));
}

const fits=[];
let precedingLoss;
for (const epochs of lengths) {
  const config = {...settings,seed:trainSeed,epochs};
  const begin = performance.now();
  const trained = await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
  const fitMs = performance.now()-begin;
  assert.equal(trained.epochsCompleted,epochs);
  // Equal losses at every earlier update verify a common initialization and numerical trajectory.
  if (precedingLoss) assert.deepEqual(trained.loss.slice(0,precedingLoss.length),precedingLoss);
  precedingLoss = trained.loss;
  assert.equal(rowDigest(),datasetHash);
  const model=weightArtifact({settings:config,scaling:set.scaling,stats:set.stats,weights:trained.weights,
    trainer:trainerId(config),epochs});
  fits.push({seed:trainSeed,sampling:settings.positiveSampling,sampleLimit:settings.sampleLimit,
    manifest:set.manifest,epochs,fitMs,loss:trained.loss.at(-1),model,weightHash:digest(JSON.stringify(model))});
}
const result = scoreFields(fits,fieldSeeds);
const checks = lengths.slice(1).map(epochs=>compareWithStarter(result.summary,epochs));
const selectedEpochs = phase==='development' ? choose(checks) : frozen;
const selectedCheck = checks.find(c=>c.epochs===selectedEpochs);
console.log(JSON.stringify({
  domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,phase,design,lengths,rule,settings,
  datasetHash,preparationMs,manifest:set.manifest,stats:set.stats,
  fits:fits.map(({seed,sampling,sampleLimit,manifest,...fit})=>fit),
  ...result,checks,selectedEpochs,
  ...(phase==='confirmation' ? {developmentDatasetHash:development.datasetHash,
    decision:selectedCheck ? (selectedCheck.qualified?'replicated':'did not replicate') : 'retained 40 epochs in development'} : {})
},null,2));
