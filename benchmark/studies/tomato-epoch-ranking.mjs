// Score the same labeled peaks before the confidence gate and pin spacing.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {pathToFileURL} from 'node:url';
import {field} from '../../trainer/generator/field.js';
import {features,buildDataset,targetCenters} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId,weightArtifact,scoreSavedWeights} from '../../trainer/models/network.js';
import {settings as trainingSettings} from './tomato-soil-controls.mjs';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';

const trainSeed = 1108421;
const plantingSeeds = [41173031,41312053,41451089,41590063,41729099,41868077];
const epochs = [40,160,640];
const methods = ['height',...epochs.map(String)];
const config = {...trainingSettings,seed:trainSeed,sampleLimit:600,positiveSampling:'ordinary'};

// Tied scores represent one threshold and enter the precision-recall curve together.
// A tie spanning the top-fifth boundary contributes its expected positives under random ordering.
export function rankSummary(scores,labels,threshold=null) {
  assert.equal(scores.length,labels.length);
  const total = scores.length;
  const positives = labels.reduce((a,b)=>a+b,0);
  const k = Math.ceil(total/5);
  const order = Array.from({length:total},(_,i)=>i).sort((a,b)=>scores[b]-scores[a]);
  let area=0, found=0, topPositive=0, acceptedPositive=0, acceptedNegative=0;
  for (let begin=0;begin<total;) {
    const score=scores[order[begin]];
    assert.ok(Number.isFinite(score));
    let end=begin, groupPositive=0;
    while (end<total && scores[order[end]]===score) groupPositive+=labels[order[end++]];
    found+=groupPositive;
    area+=groupPositive*(found/end);
    if (begin<k) topPositive+=groupPositive*(Math.min(k,end)-begin)/(end-begin);
    if (threshold!==null && score>=threshold) {
      acceptedPositive+=groupPositive;
      acceptedNegative+=(end-begin)-groupPositive;
    }
    begin=end;
  }
  return {ap:positives ? area/positives : null,k,precisionAtK:k ? topPositive/k : null,
    ...(threshold===null ? {} : {acceptedPositive,acceptedNegative})};
}

// Use the same open matching distances as the training labels (the boundary band is unevaluated).
export function labelsFor(points,centers) {
  return points.map(([x,y])=>{
    let nearest=Infinity;
    for (const [cx,cy] of centers) nearest=Math.min(nearest,(x-cx)**2+(y-cy)**2);
    return nearest<.095**2 ? 1 : nearest>.15**2 ? 0 : null;
  });
}

function emptyPool() {
  return {labels:[],ambiguous:0,scores:Object.fromEntries(methods.map(method=>[method,[]]))};
}

function summarize(pool) {
  const positives=pool.labels.reduce((a,b)=>a+b,0);
  return {positives,background:pool.labels.length-positives,ambiguous:pool.ambiguous,
    methods:Object.fromEntries(methods.map(method=>[method,rankSummary(pool.scores[method],pool.labels,
      method==='height' ? null : config.threshold)]))};
}

async function run() {
  const preparation=performance.now();
  const set=await buildDataset(config);
  assert.ok(set.manifest.every(t=>!plantingSeeds.includes(t.seed)));
  assert.equal(set.Y.length,config.sampleLimit);
  const dataHash=()=>createHash('sha256').update(new Uint8Array(set.X.buffer))
    .update(new Uint8Array(set.Y.buffer)).update(JSON.stringify(set.scaling)).digest('hex');
  const datasetHash=dataHash(), fits=[];
  const timingsMs={preparation:performance.now()-preparation,training:{},generation:0,validation:0};
  for (const count of epochs) {
    const start=performance.now(), settings={...config,epochs:count};
    const trained=await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
    assert.equal(trained.epochsCompleted,count);
    assert.equal(dataHash(),datasetHash);
    const model=weightArtifact({settings,scaling:set.scaling,weights:trained.weights,
      trainer:trainerId(settings),epochs:count,stats:set.stats});
    fits.push({epochs:count,weightHash:createHash('sha256').update(JSON.stringify(model)).digest('hex'),model});
    timingsMs.training[count]=performance.now()-start;
  }
  const groups=[], fields=[];
  for (const plantForm of ['seedling','branching']) {
    const referenceBoxes=new Map();
    for (const layout of ['reference','os1-64']) {
      const pool=emptyPool();
      for (const seed of plantingSeeds) {
        const start=performance.now();
        const scan=field(tomatoTestRecipe(seed,layout,plantForm,true));
        timingsMs.generation+=performance.now()-start;
        assert.equal(scan.sampledRays,60000);
        if (referenceBoxes.has(seed)) assert.deepEqual(scan.labels.boxes,referenceBoxes.get(seed));
        else referenceBoxes.set(seed,scan.labels.boxes);
        const validation=performance.now();
        const candidates=features(scan,config.minimumHeight,config.peakAveraging,config.featureMode);
        const labels=labelsFor(candidates.pos,targetCenters(scan.labels.boxes));
        const scores={height:labels.map((_,i)=>candidates.X[i*set.dims])};
        for (const fit of fits) scores[fit.epochs]=scoreSavedWeights(candidates.X,fit.model,config.peakAveraging,config.featureMode);
        const local=emptyPool();
        for (const [i,label] of labels.entries()) {
          if (label===null) { local.ambiguous++; continue; }
          local.labels.push(label);
          for (const method of methods) local.scores[method].push(scores[method][i]);
        }
        fields.push({plantForm,layout,seed,tileId:scan.labels.tile_id,...summarize(local)});
        pool.ambiguous+=local.ambiguous;
        pool.labels.push(...local.labels);
        for (const method of methods) pool.scores[method].push(...local.scores[method]);
        timingsMs.validation+=performance.now()-validation;
      }
      groups.push({plantForm,layout,...summarize(pool)});
    }
  }
  return {domain:'synthetic',backend:'CPU',node:process.version,cpu:cpus()[0]?.model,trainSeed,plantingSeeds,
    epochs,config,datasetHash,trainFields:set.stats.fieldSeeds.training,
    fits:fits.map(({model,...receipt})=>receipt),timingsMs,groups,fields};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(),null,2));
}
