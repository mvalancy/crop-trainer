// Node.js 22+ · node benchmark/canopy-size.mjs > canopy-size.json
import assert from 'node:assert/strict';
import {buildDataset, makeRecipe, MATCH_RADII_METERS} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {trainNetworkCPU} from '../trainer/neural.js';
import {trainerId, weightArtifact} from '../trainer/network.js';
import {runFieldTest} from '../trainer/score-scan.js';
import {getSensor} from '../trainer/sensors.js';

const settings = {crop:'lettuce', trainFields:6, valFields:3, sensorMode:'mixed', minimumHeight:.035,
  epochs:40, lr:.25, hiddenLayers:[4], activation:'tanh', threshold:.5, initSeed:12345};
const design = {trainingSeeds:[27,53917,83911], blockSeeds:[61051,97259], plantingsPerBlock:8, smallerRadiusFactor:.60,
  trainingRule:'Alternating uses 60% radius on one-based training plantings 1, 3 and 5; both soil variants share the factor.',
  sensor:'os1-64', rays:30000, ground:true};
const timingsMs = {trainingData:0, fit:0, pairedScans:0, scoring:0};

function score(scan,model) {
  const labels = {filename:'tile.labels.json',text:JSON.stringify(scan.labels)};
  const result = runFieldTest({model,xyz:scan.xyz,labels,tileId:scan.labels.tile_id});
  const matchesAtStage = stage=>result.stages15cm.find(row=>row.stage===stage).matched;
  return {tile:scan.labels.tile_id, targets:scan.labels.boxes.length, zeroCropReturns:scan.coverage.zero,
    candidateMatches15:matchesAtStage('proposals'), acceptedMatches15:matchesAtStage('accepted'),
    scores:result.evaluation.scores};
}

function checkPair(nominal, smaller) {
  assert.equal(nominal.xyz.length,smaller.xyz.length);
  for (let i=0;i<nominal.xyz.length;i+=3) {
    assert.equal(nominal.xyz[i],smaller.xyz[i]);
    assert.equal(nominal.xyz[i+1],smaller.xyz[i+1]);
  }
  const boxes = nominal.labels.boxes;
  assert.equal(smaller.labels.boxes.length,boxes.length);
  let maxShift = 0;
  for (const [i,box] of boxes.entries()) {
    const scaled = smaller.labels.boxes[i];
    // The generator adds a fixed 2 mm margin to each side of the canopy.
    // Verify corresponding shapes scale together, in planting order.
    for (let axis=0;axis<3;axis++) {
      const span = box.max[axis]-box.min[axis]-.004;
      const smallSpan = scaled.max[axis]-scaled.min[axis]-.004;
      assert.ok(Math.abs(smallSpan-span*design.smallerRadiusFactor)<1e-10);
    }
    const displacement = [0,1].map(a=>(box.min[a]+box.max[a]-scaled.min[a]-scaled.max[a])/2);
    maxShift = Math.max(maxShift,Math.hypot(...displacement));
  }
  return maxShift*100;
}

function summarize(scans) {
  const total = key=>scans.reduce((sum,scan)=>sum+scan[key],0);
  const scores = MATCH_RADII_METERS.map((r,i)=>{
    const pooled = key=>scans.reduce((sum,scan)=>sum+scan.scores[i][key],0);
    const tp=pooled('tp'), fp=pooled('fp'), fn=pooled('fn');
    return {cm:r*100,tp,fp,fn,precision:tp/(tp+fp),recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
  });
  return {fields:scans.length,targets:total('targets'),zeroCropReturns:total('zeroCropReturns'),
    candidateMatches15:total('candidateMatches15'),candidateRecall15:total('candidateMatches15')/total('targets'),
    acceptedMatches15:total('acceptedMatches15'),acceptedRecall15:total('acceptedMatches15')/total('targets'),scores};
}

// Generate each held-out scan once, including its own boxes. All six fits score
// the same point arrays, tile IDs and target coordinates.
const testFields = [];
const generating = performance.now();
for (const block of design.blockSeeds) {
  for (let i=0;i<design.plantingsPerBlock;i++) {
    const seed = block+i;
    const recipe = {...makeRecipe(seed,design.ground,getSensor(design.sensor),'lettuce'),points:design.rays};
    const nominal = field(recipe);
    const smaller = field({...recipe,radius:recipe.radius*design.smallerRadiusFactor});
    const maxBoxCenterShiftCm = checkPair(nominal,smaller);
    testFields.push({block,seed,nominalRadiusM:recipe.radius,maxBoxCenterShiftCm,nominal,smaller});
  }
}
timingsMs.pairedScans = performance.now()-generating;

function trainingFactor(arm,fieldIndex) {
  return arm==='alternating' && fieldIndex%2===0 ? design.smallerRadiusFactor : 1;
}

async function buildTraining(seed,arm) {
  const observed = new Map();
  const start = performance.now();
  const set = await buildDataset({...settings,seed,generate:(recipe,step)=>{
    const factor = step.split==='Training' ? trainingFactor(arm,Math.floor((step.done-1)/2)) : 1;
    return field({...recipe,radius:recipe.radius*factor});
  },onScan:(scan,step)=>{
    if (step.split!=='Training') return;
    const id = scan.p.seed;
    const row = observed.get(id) ?? {targets:0,zeroCropReturns:0};
    row.targets += scan.labels.boxes.length;
    row.zeroCropReturns += scan.coverage.zero;
    observed.set(id,row);
  }});
  timingsMs.trainingData += performance.now()-start;
  for (const field of testFields) {
    assert.ok(!set.stats.fieldSeeds.training.includes(field.seed) && !set.stats.fieldSeeds.validation.includes(field.seed));
  }
  const training = set.stats.trainingExamplesByField.map((row,i)=>({
    ...row,...observed.get(row.seed),radiusFactor:trainingFactor(arm,i)
  }));
  const used = key=>training.reduce((n,f)=>n+f[key],0);
  assert.equal(used('usedPositive'),used('usedNegative'));
  assert.equal(used('usedPositive')+used('usedNegative'),set.Y.length);
  return {set,training};
}

const compare = rows=>({nominal:summarize(rows.map(f=>f.nominal)),smaller:summarize(rows.map(f=>f.smaller))});
const runs = [];
for (const seed of design.trainingSeeds) {
  let controlManifest;
  for (const arm of ['nominal','alternating']) {
    const {set,training} = await buildTraining(seed,arm);
    if (arm==='nominal') controlManifest = set.manifest;
    else for (const [i,control] of controlManifest.entries()) {
      const factor = control.split==='train' ? trainingFactor(arm,Math.floor(i/2)) : 1;
      assert.deepEqual(set.manifest[i].recipe,{...control.recipe,radius:control.recipe.radius*factor});
      if (factor===1) assert.equal(set.manifest[i].tile_id,control.tile_id);
    }
    const fitting = performance.now();
    const fit = await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
    const model = weightArtifact({settings,weights:fit.weights,scaling:set.scaling,trainer:trainerId(settings),epochs:settings.epochs});
    timingsMs.fit += performance.now()-fitting;
    const scoring = performance.now();
    const fields = testFields.map(({nominal,smaller,...metadata})=>({
      ...metadata,nominal:score(nominal,model),smaller:score(smaller,model)
    }));
    timingsMs.scoring += performance.now()-scoring;
    runs.push({seed,arm,samples:set.stats.samples,training,pooled:compare(fields),
      byBlock:design.blockSeeds.map(block=>({block,...compare(fields.filter(f=>f.block===block))})),fields});
  }
}
console.log(JSON.stringify({backend:'Node CPU',node:process.version,settings,design,timingsMs,runs},null,2));
