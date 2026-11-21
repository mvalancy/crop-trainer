// Run from the project root: node benchmark/studies/tomato-stage-training.mjs > tomato-stage-training.json
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {buildDataset, features, makeRecipe, MATCH_RADII_METERS, targetCenters} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId, weightArtifact} from '../../trainer/models/network.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {getSensor} from '../../trainer/generator/sensors.js';

const followup = process.argv[2] === '--balance';
if (process.argv.length > (followup ? 3 : 2)) throw Error('Usage: node benchmark/studies/tomato-stage-training.mjs [--balance]');
const design = {
  trainingSeeds:[82173,379331], trainingForms:followup?['mixed']:['seedling','mixed'], exampleLimit:256,
  cohorts:followup ? {followup:[5943079,6054211,6165361,6276481]} : {
    initial:[4831799,4942921,5054027,5165173,5276299,5387437],confirmation:[5498591,5609719,5720839,5831963]
  },
  ...(followup ? {positiveQuota:{seedling:43,transplant:43,branching:42}} : {}),
  testForms:['seedling','transplant','branching'], testLayouts:['reference','os1-64'],
  test:{points:60000,ground:true,weeds:false,sticks:false,boards:false,scanNoise:null}
};
const settings = {
  crop:'tomato',plantArchitecture:2,plantCondition:'healthy',trainFields:6,valFields:1,sensorMode:'reference',
  trainingRayBudget:60000,validationRayBudget:60000,minimumHeight:.065,threshold:.5,hiddenLayers:[4],
  activation:'tanh',epochs:40,optimizer:'sgd',batchSize:0,lr:.25,initSeed:12345
};
const testSeeds = Object.values(design.cohorts).flat();
assert.equal(new Set(testSeeds).size,testSeeds.length);
const timingsMs = {trainingData:0,fit:0,trainingAudit:0,testGeneration:0,validation:0};
const fits = [];
const trainingAudits = [];
const fields = [];

// Associate each eligible training positive with its nearest target, before balancing.
function auditTraining(scans,set) {
  const byForm = Object.fromEntries(design.testForms.map(form=>[form,{plants:0,accessiblePositiveRows:0}]));
  for (const scan of scans) {
    const boxes = scan.labels.boxes;
    const centers = targetCenters(boxes);
    if (scan.p.ground) for (const box of boxes) byForm[box.plant_form].plants++;
    const candidates = features(scan,settings.minimumHeight);
    for (const [x,y] of candidates.pos) {
      let nearest = -1, distance2 = .095**2;
      for (const [i,[tx,ty]] of centers.entries()) {
        const d2=(tx-x)**2+(ty-y)**2;
        if (d2<distance2) {nearest=i;distance2=d2;}
      }
      if (nearest!==-1) byForm[boxes[nearest].plant_form].accessiblePositiveRows++;
    }
  }
  const positiveCount = Object.values(byForm).reduce((sum,g)=>sum+g.accessiblePositiveRows,0);
  assert.equal(positiveCount,set.stats.trainingExamplesByField.reduce((sum,t)=>sum+t.availablePositive,0));
  return byForm;
}

// Change only the stage composition of an already shuffled positive training pool.
function selectStages(candidates,n,trainingLabels,quota,counts) {
  const selected=[];
  for (const [index,{tileId,xy:[x,y]}] of candidates.entries()) {
    const {centers,boxes}=trainingLabels.get(tileId);
    let nearest=-1, best=.095**2;
    for (const [i,[a,b]] of centers.entries()) {
      const d2=(a-x)**2+(b-y)**2;
      if (d2<best) {best=d2;nearest=i;}
    }
    assert.notEqual(nearest,-1,'Expected an eligible positive training peak');
    const stage=boxes[nearest].plant_form;
    if (quota && counts[stage]>=quota[stage]) continue;
    selected.push(index);
    counts[stage]++;
    if (selected.length===n) break;
  }
  if (quota) assert.deepEqual(counts,quota);
  return selected;
}

for (const seed of design.trainingSeeds) {
  let pairedRecipes;
  for (const plantForm of design.trainingForms) {
    const scanCache = new Map();
    let fullManifest;
    const trainingLabels=new Map();
    function generate(recipe,step) {
      const key=JSON.stringify(recipe);
      if (!scanCache.has(key)) scanCache.set(key,field(recipe));
      const scan=scanCache.get(key);
      if (followup && step?.split==='Training') trainingLabels.set(scan.labels.tile_id,{boxes:scan.labels.boxes,centers:targetCenters(scan.labels.boxes)});
      return scan;
    }
    const samplingModes=followup?['ordinary','stage-balanced']:['native','matched'];
    for (const sampling of samplingModes) {
      const sampleLimit=sampling==='native'?undefined:design.exampleLimit;
      const counts={seedling:0,transplant:0,branching:0};
      const quota=sampling==='stage-balanced'?design.positiveQuota:undefined;
      const selectPositiveRows=followup?(rows,n)=>selectStages(rows,n,trainingLabels,quota,counts):undefined;
      const config={...settings,seed,plantForm,sampleLimit};
      const dataStart=performance.now();
      const set=await buildDataset({...config,generate,selectPositiveRows});
      timingsMs.trainingData+=performance.now()-dataStart;
      assert.ok(set.manifest.every(tile=>tile.sampledRays===settings.trainingRayBudget && !testSeeds.includes(tile.seed)));
      const trainingTiles=set.manifest.filter(t=>t.split==='train');
      if (!fullManifest) {
        fullManifest=set.manifest;
        const matchedControls=trainingTiles.map(({recipe})=>{
          const {plantForm:form,...rest}=recipe;
          assert.equal(form,plantForm);
          return rest;
        });
        pairedRecipes??=matchedControls;
        assert.deepEqual(matchedControls,pairedRecipes);
        const auditStart=performance.now();
        const scans=trainingTiles.map(tile=>generate(tile.recipe));
        trainingAudits.push({seed,plantForm,byForm:auditTraining(scans,set)});
        timingsMs.trainingAudit+=performance.now()-auditStart;
      } else assert.deepEqual(set.manifest,fullManifest);
      if (sampleLimit!==undefined) {
        assert.equal(set.Y.length,sampleLimit);
        assert.equal(set.Y.reduce((a,b)=>a+b,0),sampleLimit/2);
      }
      const fitStart=performance.now();
      const fit=await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
      const model=weightArtifact({settings:config,trainer:trainerId(config),epochs:fit.epochsCompleted,weights:fit.weights,scaling:set.scaling});
      timingsMs.fit+=performance.now()-fitStart;
      const modelHash=createHash('sha256').update(JSON.stringify(model)).digest('hex');
      fits.push({seed,plantForm,sampling,samples:set.Y.length,...(followup?{positivesByStage:counts}:{}),
        trainingTiles:trainingTiles.map(t=>({seed:t.seed,tileId:t.tile_id,ground:t.recipe.ground})),modelHash,model});
    }
  }
}

// Finish every fit before scoring either test cohort. All models see the same scan.
for (const [cohort,seeds] of Object.entries(design.cohorts)) for (const seed of seeds) {
  const boxesByStage=new Map();
  for (const sensor of design.testLayouts) {
    let firstScan;
    for (const plantForm of design.testForms) {
      const recipe={...makeRecipe(seed,true,getSensor(sensor),settings.crop,settings.plantArchitecture,plantForm,settings.plantCondition),...design.test};
      const generationStart=performance.now();
      const scan=field(recipe);
      timingsMs.testGeneration+=performance.now()-generationStart;
      assert.equal(scan.sampledRays,design.test.points);
      assert.equal(scan.xyz.length,3*design.test.points);
      assert.ok(scan.labels.boxes.every(box=>box.plant_form===plantForm));
      if (boxesByStage.has(plantForm)) assert.deepEqual(scan.labels.boxes,boxesByStage.get(plantForm));
      else boxesByStage.set(plantForm,scan.labels.boxes);
      if (firstScan) {
        assert.equal(scan.labels.boxes.length,firstScan.labels.boxes.length);
        for (let i=0;i<scan.xyz.length;i+=3) {
          assert.equal(scan.xyz[i],firstScan.xyz[i]);
          assert.equal(scan.xyz[i+1],firstScan.xyz[i+1]);
        }
      } else firstScan=scan;
      const tileId=scan.labels.tile_id;
      const labels={filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
      const validationStart=performance.now();
      let height,proposals;
      const evaluations=[];
      for (const fit of fits) {
        const result=runFieldTest({xyz:scan.xyz,model:fit.model,labels,tileId});
        height??=result.baselineEvaluation.scores;
        proposals??=result.stages15cm[0];
        assert.deepEqual(result.baselineEvaluation.scores,height);
        assert.deepEqual(result.stages15cm[0],proposals);
        evaluations.push({modelHash:fit.modelHash,stages15cm:result.stages15cm,scores:result.evaluation.scores});
      }
      timingsMs.validation+=performance.now()-validationStart;
      fields.push({cohort,seed,sensor,plantForm,tileId,sampledRays:scan.sampledRays,
        plants:scan.labels.boxes.length,coverage:scan.coverage,proposals,height,evaluations});
    }
  }
}

function pool(scans,select) {
  return MATCH_RADII_METERS.map((radius,i)=>{
    let tp=0,fp=0,fn=0;
    for (const scan of scans) {
      const counts=select(scan)[i];
      assert.equal(counts.cm,radius*100);
      tp+=counts.tp;fp+=counts.fp;fn+=counts.fn;
    }
    return {cm:radius*100,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
  });
}
const pooled=[];
for (const cohort of Object.keys(design.cohorts)) for (const sensor of design.testLayouts) for (const plantForm of design.testForms) {
  const scans=fields.filter(t=>t.cohort===cohort&&t.sensor===sensor&&t.plantForm===plantForm);
  pooled.push({cohort,sensor,plantForm,plants:scans.reduce((sum,t)=>sum+t.plants,0),
    reachable15cm:scans.reduce((sum,t)=>sum+t.proposals.matched,0),height:pool(scans,t=>t.height),
    models:fits.map(({seed,plantForm:trainingForm,sampling,modelHash},i)=>({
      seed,trainingForm,sampling,modelHash,scores:pool(scans,t=>t.evaluations[i].scores)
    }))});
}
const host={node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model};
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',host,settings,design,timingsMs,trainingAudits,
  fits:fits.map(({model,...metadata})=>metadata),pooled,fields},null,2));
