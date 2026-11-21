// Run from the repository root with Node 22 or later. No downloads are needed.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {buildDataset, detectionStages, features, makeRecipe, matchCenters,
  MATCH_RADII_METERS, targetCenters} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {scoreSavedWeights, weightArtifact} from '../../trainer/models/network.js';

const seeds=[19871317,19871318], floors=[.065,.035];
const conditions=['seedling','branching'], layouts=['reference','os1-64'];
const settings={crop:'tomato',plantArchitecture:2,plantForm:'mixed',plantCondition:'healthy',
  trainFields:6,valFields:3,sensorMode:'reference',validationPlantForm:'seedling',
  trainingRayBudget:60000,validationRayBudget:60000,hiddenLayers:[4],activation:'tanh',
  optimizer:'sgd',batchSize:0,initSeed:12345,epochs:40,lr:.25,threshold:.5};
const timingsMs={dataset:0,training:0,generation:0,scoring:0};
const fits=[],tiles=[];
const standardFitChanges={scans:0,acceptedCandidatesChanged:0,finalPinsChanged:0};

function scorePins(pins,truth) {
  return MATCH_RADII_METERS.map(radius=>{
    const tp=matchCenters(pins,truth,radius).count;
    return {cm:radius*100,tp,fp:pins.length-tp,fn:truth.length-tp};
  });
}

for (const seed of seeds) {
  const models=new Map();
  let fieldSeeds;
  for (const minimumHeight of floors) {
    const config={...settings,seed,minimumHeight}, start=performance.now();
    const set=await buildDataset(config);
    if (fieldSeeds) assert.deepEqual(set.stats.fieldSeeds,fieldSeeds);
    fieldSeeds=set.stats.fieldSeeds;
    assert.ok(fieldSeeds.validation.every(id=>!fieldSeeds.training.includes(id)));
    const ready=performance.now();
    const fit=await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
    timingsMs.dataset+=ready-start;
    timingsMs.training+=performance.now()-ready;
    models.set(minimumHeight,weightArtifact({settings:config,scaling:set.scaling,weights:fit.weights,
      epochs:config.epochs,trainer:'crop-mlp-v1',stats:set.stats}));
    fits.push({seed,minimumHeight,samples:set.stats.samples,fieldSeeds});
  }

  for (const validationSeed of fieldSeeds.validation) for (const stage of conditions) {
    let pairedTargets;
    for (const layout of layouts) for (const ground of [true,false]) {
      const start=performance.now();
      const recipe=makeRecipe(validationSeed,ground,getSensor(layout),'tomato',2,stage,'healthy');
      recipe.points=settings.validationRayBudget;
      const scan=field(recipe), truth=targetCenters(scan.labels.boxes);
      if (pairedTargets) assert.deepEqual(truth,pairedTargets);
      else pairedTargets=truth;
      const generated=performance.now();
      timingsMs.generation+=generated-start;
      const scores=[];
      let originalStages;
      for (const detectionFloor of floors) {
        const peaks=features({xyz:scan.xyz},detectionFloor);
        const reachable=matchCenters(peaks.pos,truth,.15).count;
        for (const trainingFloor of [...floors,null]) {
          // The baseline ranks the very same peaks by their first raw feature, smoothed height.
          const model=models.get(trainingFloor);
          const probabilities=model?scoreSavedWeights(peaks.X,model):peaks.pos.map((_,i)=>peaks.X[13*i]);
          const stages=detectionStages(peaks,probabilities,model?settings.threshold:0,.22);
          if (trainingFloor===floors[0]) {
            if (detectionFloor===floors[0]) originalStages=stages;
            else {
              standardFitChanges.scans++;
              if (!isDeepStrictEqual(originalStages.accepted,stages.accepted)) standardFitChanges.acceptedCandidatesChanged++;
              if (!isDeepStrictEqual(originalStages.selected,stages.selected)) standardFitChanges.finalPinsChanged++;
            }
          }
          scores.push({method:model?'neural':'height',trainingFloor,detectionFloor,proposals:peaks.pos.length,
            reachableAt15cm:reachable,accepted:stages.accepted.length,byTolerance:scorePins(stages.selected,truth)});
        }
      }
      timingsMs.scoring+=performance.now()-generated;
      tiles.push({seed,validationSeed,stage,layout,ground,tileId:scan.labels.tile_id,scores});
    }
  }
}

// Pool each held-out tile once within a given stage, layout and detector setting.
const pooled=[];
for (const stage of conditions) for (const layout of layouts) {
  const cohort=tiles.filter(t=>t.stage===stage && t.layout===layout);
  for (const {method,trainingFloor,detectionFloor} of cohort[0].scores) {
    const runs=cohort.map(tile=>tile.scores.find(s=>s.trainingFloor===trainingFloor && s.detectionFloor===detectionFloor));
    const byTolerance=MATCH_RADII_METERS.map((radius,i)=>{
      let tp=0,fp=0,fn=0;
      for (const run of runs) {
        const s=run.byTolerance[i];tp+=s.tp;fp+=s.fp;fn+=s.fn;
      }
      return {cm:radius*100,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
    });
    pooled.push({stage,layout,method,trainingFloor,detectionFloor,byTolerance});
  }
}
console.log(JSON.stringify({domain:'synthetic',seeds,settings,floors,layouts,conditions,fits,standardFitChanges,pooled,timingsMs,tiles},null,2));
