// Keep the standard fit's pins and give newly admitted short peaks one extra chance.
import assert from 'node:assert/strict';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {buildDataset,detectionStages,features,makeRecipe,matchCenters,MATCH_RADII_METERS,targetCenters} from '../../trainer/models/data.js';
import {scoreSavedWeights,weightArtifact} from '../../trainer/models/network.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';

const trainingSeeds=[19871317,19871318];
const validationSeeds=[21901127,22012259,22123391,22234523,22345661,22456783];
const standardFloor=.065,lowFloor=.035,separation=.22;
const settings={crop:'tomato',plantArchitecture:2,plantForm:'mixed',plantCondition:'healthy',trainFields:6,valFields:3,
  sensorMode:'reference',validationPlantForm:'seedling',trainingRayBudget:60000,validationRayBudget:60000,
  epochs:40,lr:.25,optimizer:'sgd',batchSize:0,initSeed:12345,threshold:.5,hiddenLayers:[4],activation:'tanh'};
const fitPairs=[],training=[],tiles=[];
const timingsMs={dataset:0,fit:0,field:0,inferenceAndScoring:0};
for (const seed of trainingSeeds) {
  const pair=[];
  for (const minimumHeight of [standardFloor,lowFloor]) {
    const config={...settings,seed,minimumHeight},begin=performance.now();
    const set=await buildDataset(config),ready=performance.now();
    const knownSeeds=[...set.stats.fieldSeeds.training,...set.stats.fieldSeeds.validation];
    assert.ok(validationSeeds.every(s=>!knownSeeds.includes(s)));
    const fit=await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
    timingsMs.dataset+=ready-begin;timingsMs.fit+=performance.now()-ready;
    pair.push(weightArtifact({trainer:'crop-mlp-v1',weights:fit.weights,scaling:set.scaling,settings:config,epochs:config.epochs,stats:set.stats}));
    training.push({seed,minimumHeight,samples:set.stats.samples,trainingFields:set.stats.fieldSeeds.training});
  }
  fitPairs.push(pair);
}

function score(pins,truth) {
  return MATCH_RADII_METERS.map(radius=>{
    const {count:tp,pinByBox}=matchCenters(pins,truth,radius);
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp,pinByBox};
  });
}

for (const seed of validationSeeds) for (const stage of ['seedling','branching']) {
  let targets;
  for (const layout of ['reference','os1-64']) for (const ground of [true,false]) {
    const begin=performance.now(),recipe=makeRecipe(seed,ground,getSensor(layout),'tomato',2,stage,'healthy');
    recipe.points=settings.validationRayBudget;
    const scan=field(recipe),truth=targetCenters(scan.labels.boxes),ready=performance.now();
    timingsMs.field+=ready-begin;
    if (targets) assert.deepEqual(targets,truth);
    else targets=truth;
    const peaks=features({xyz:scan.xyz},lowFloor),high=features({xyz:scan.xyz},standardFloor);
    const short=peaks.pos.map((_,i)=>peaks.X[13*i]<standardFloor);
    assert.deepEqual(peaks.pos.filter((_,i)=>!short[i]),high.pos);
    const shortPoints=new Set(peaks.pos.filter((_,i)=>short[i]));
    const heightScores=peaks.pos.map((_,i)=>peaks.X[13*i]);
    const height=score(detectionStages(peaks,heightScores,0,separation).selected,truth);
    const fits=fitPairs.map(([standardModel,lowModel],i)=>{
      const standard=detectionStages(high,scoreSavedWeights(high.X,standardModel),settings.threshold,separation);
      const low=detectionStages(peaks,scoreSavedWeights(peaks.X,lowModel),settings.threshold,separation);
      const eligible=low.accepted.filter(point=>shortPoints.has(point));
      // low.accepted already uses descending fitted score and the detector's tie order.
      const pins=[...standard.selected];
      for (const [x,y] of eligible) {
        if (pins.every(([px,py])=>(px-x)**2+(py-y)**2>=separation**2)) pins.push([x,y]);
      }
      const scores={standard:score(standard.selected,truth),low:score(low.selected,truth),fallback:score(pins,truth)};
      const changes=scores.fallback.map(({cm,pinByBox},j)=>{
        const original=scores.standard[j].pinByBox;
        const gained=pinByBox.filter((pin,box)=>pin>=0&&original[box]<0).length;
        const lost=pinByBox.filter((pin,box)=>pin<0&&original[box]>=0).length;
        return {cm,gained,lost};
      });
      return {trainingSeed:trainingSeeds[i],shortPeaks:shortPoints.size,acceptedShort:eligible.length,
        added:pins.length-standard.selected.length,scores,changes};
    });
    tiles.push({seed,stage,layout,ground,tileId:scan.labels.tile_id,targets:truth.length,height,fits});
    timingsMs.inferenceAndScoring+=performance.now()-ready;
  }
}

const pooled=[];
for (const stage of ['seedling','branching']) for (const layout of ['reference','os1-64']) {
  const scans=tiles.filter(t=>t.stage===stage&&t.layout===layout);
  for(const method of ['standard','low','fallback','height']) {
    const totals=MATCH_RADII_METERS.map(radius=>({cm:100*radius,tp:0,fp:0,fn:0}));
    for(const scan of scans) {
      // Height alone has no fitted weights, so one evaluation per scan suffices.
      const evaluations=method==='height'?[scan.height]:scan.fits.map(fit=>fit.scores[method]);
      for(const rows of evaluations) rows.forEach((r,j)=>{
        totals[j].tp+=r.tp;totals[j].fp+=r.fp;totals[j].fn+=r.fn;
      });
    }
    pooled.push({stage,layout,method,byTolerance:totals.map(s=>{
      const {tp,fp,fn}=s;
      return {...s,precision:tp+fp?tp/(tp+fp):null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
    })});
  }
}
// The per-tile counts and changed assignments suffice for reproducing the pooled results.
function countsOnly(_,value) {return value?.pinByBox ? {cm:value.cm,tp:value.tp,fp:value.fp,fn:value.fn} : value;}
console.log(JSON.stringify({domain:'synthetic',settings,trainingSeeds,validationSeeds,standardFloor,lowFloor,separation,
  training,pooled,timingsMs,tiles},countsOnly,2));
