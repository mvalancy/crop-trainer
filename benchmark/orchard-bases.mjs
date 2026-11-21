// node benchmark/orchard-bases.mjs > orchard-bases.json
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {buildDataset, makeRecipe, features, detectionStages, matchCenters, MATCH_RADII_METERS} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {trainNetworkCPU} from '../trainer/neural.js';
import {weightArtifact, trainerId, scoreSavedWeights} from '../trainer/network.js';
import {detectOrchardBases} from '../trainer/orchard.js';
import {getSensor} from '../trainer/sensors.js';

const developmentSeeds=[200033,399173,701081];
const testSeeds=[1430867,2279149,3461627,4521451,5639617,6777371];
const layouts=[
  {id:'grid-clean-30k',sensor:'reference',points:30000,clutter:false},
  {id:'grid-clutter-30k',sensor:'reference',points:30000,clutter:true},
  {id:'rings-clutter-30k',sensor:'os1-64',points:30000,clutter:true},
  {id:'rings-clutter-12k',sensor:'os1-64',points:12000,clutter:true}
];
const noise={xy:.8,z:.7,density:12,gaps:2,stray:.15,cluster:10};
const methods=['height','stockMLP','seasonalMLP','orchard'];
const elapsed={testGeneration:0,peakFeatures:0,height:0,stockMLP:0,seasonalMLP:0,orchard:0,matching:0};

async function fit(seasonal) {
  // The stock arm replays benchmark/plant-forms.mjs. The second learner
  // uses a fresh set of plantings, both seasons, damage and mixed layouts.
  const settings={crop:'apple',plantArchitecture:2,plantForm:'mixed',plantCondition:seasonal?'mixed':'healthy',
    seed:seasonal?251713:71309,trainFields:seasonal?12:6,valFields:1,
    sensorMode:seasonal?'mixed':'reference',trainingRayBudget:30000,validationRayBudget:30000,minimumHeight:.065,
    hiddenLayers:[4],activation:'tanh',epochs:40,optimizer:'sgd',batchSize:0,lr:.25,initSeed:12345,threshold:.5};
  const seasonByField=new Map();
  const start=performance.now();
  const set=await buildDataset({...settings,generate:seasonal?recipe=>{
    if (!seasonByField.has(recipe.seed)) seasonByField.set(recipe.seed,seasonByField.size%2?'dormant':'leafy');
    return field({...recipe,appleCanopy:seasonByField.get(recipe.seed)});
  }:undefined});
  const generated=performance.now();
  const trained=await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
  return {model:weightArtifact({settings,scaling:set.scaling,weights:trained.weights,trainer:trainerId(settings),epochs:40}),
    setup:{settings,fieldSeeds:set.stats.fieldSeeds,trainingSamples:set.stats.samples,
      trainingCanopies:seasonal?set.stats.fieldSeeds.training.map(seed=>seasonByField.get(seed)):'leafy',
      generationMs:generated-start,fitMs:performance.now()-generated}};
}

function timed(key,operation) {
  const start=performance.now(),result=operation();
  elapsed[key]+=performance.now()-start;
  return result;
}

function counts(positions,truth) {
  return MATCH_RADII_METERS.map(radius=>{
    const {count:tp}=matchCenters(positions,truth,radius);
    return {cm:radius*100,tp,fp:positions.length-tp,fn:truth.length-tp};
  });
}

function summarize(scans) {
  return Object.fromEntries(methods.map(method=>[method,MATCH_RADII_METERS.map((r,i)=>{
    let tp=0,fp=0,fn=0;
    for (const scan of scans) {
      const score=scan.scores[method][i];
      tp+=score.tp;fp+=score.fp;fn+=score.fn;
    }
    return {cm:r*100,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
      f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
  })]));
}

const stock=await fit(false), seasonal=await fit(true);
for (const {setup} of [stock,seasonal]) {
  const seen=Object.values(setup.fieldSeeds).flat();
  assert.ok([...developmentSeeds,...testSeeds].every(seed=>!seen.includes(seed)));
}
assert.ok(testSeeds.every(s=>!developmentSeeds.includes(s)));
const scans=[];
for (const seed of testSeeds) {
  let pairedBases;
  for (const layout of layouts) for (const form of ['central-leader','open-vase']) {
    for (const condition of ['healthy','damaged']) for (const canopy of ['leafy','dormant']) {
      const recipe=makeRecipe(seed,true,getSensor(layout.sensor),'apple',2,form,condition);
      const scan=timed('testGeneration',()=>field({...recipe,points:layout.points,appleCanopy:canopy,
        weeds:layout.clutter,sticks:layout.clutter,boards:layout.clutter,
        scanNoise:layout.clutter?{seed:recipe.scanNoise.seed,...noise}:null}));
      const xyz=scan.xyz;
      const pins=timed('orchard',()=>detectOrchardBases(xyz).pins.map(p=>[p.x,p.y]));
      const candidates=timed('peakFeatures',()=>features({xyz},.065));
      const height=timed('height',()=>detectionStages(candidates,candidates.pos.map((_,i)=>candidates.X[13*i]),0,1.05).selected);
      const predictions={orchard:pins,height};
      for (const [key,{model}] of [['stockMLP',stock],['seasonalMLP',seasonal]]) {
        predictions[key]=timed(key,()=>detectionStages(candidates,scoreSavedWeights(candidates.X,model),model.threshold,model.pinSeparation).selected);
      }
      const truth=scan.labels.boxes.map(b=>b.base_xy_m);
      pairedBases??=truth;
      assert.deepEqual(truth,pairedBases);
      const scores=timed('matching',()=>Object.fromEntries(methods.map(key=>[key,counts(predictions[key],truth)])));
      scans.push({seed,layout:layout.id,form,condition,canopy,tileId:scan.labels.tile_id,returns:xyz.length/3,trees:truth.length,scores});
    }
  }
}
const groupBy=key=>Object.fromEntries([...new Set(scans.map(key))].map(value=>[value,summarize(scans.filter(s=>key(s)===value))]));
console.log(JSON.stringify({domain:'synthetic',backend:'Node CPU',host:{node:process.version,cpu:cpus()[0]?.model},
  training:{stock:stock.setup,seasonal:seasonal.setup},developmentSeeds,
  development:'3 plantings x 2 forms x 2 seasons x 2 capture conditions (healthy grid 30k, mixed damage with noisy rings 12k); selected heights, cutoff, quadrant weighting and local refinement before running test seeds.',
  testSeeds,layouts,clutterNoise:noise,matchDistancesCm:[7.5,10,15],timingsMs:elapsed,overall:summarize(scans),
  byLayout:groupBy(s=>s.layout),byFormAndCanopy:groupBy(s=>s.form+'/'+s.canopy),byCondition:groupBy(s=>s.condition),
  bySeed:groupBy(s=>s.seed),scans},null,2));
