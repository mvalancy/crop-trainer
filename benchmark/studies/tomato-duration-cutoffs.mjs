// Choose a single operating point on the earlier duration study's development fields.
// The second command refits the selected schedules and opens six new plantings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {buildDataset} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {weightArtifact,trainerId} from '../../trainer/models/network.js';
import {settings as soilSettings,scoreFields} from './tomato-soil-controls.mjs';

const design={
  development:{trainSeed:914731,fieldSeeds:[39112043,39243071,39374039,39505087]},
  confirmation:{trainSeed:1273187,fieldSeeds:[42103033,42247069,42391057,42535081,42679033,42823097]}
};
const settings={...soilSettings,sampleLimit:600,positiveSampling:'ordinary'};
const lengths=[40,160,640];
const thresholds=Array.from({length:19},(_,i)=>5*(i+1));
const control={epochs:40,percent:50};
const allArms=lengths.flatMap(epochs=>thresholds.map(percent=>({epochs,percent})));
const armKey=arm=>arm.epochs+'@'+arm.percent;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rule='Global cutoff. At 15 cm require branching precision within one percentage point of 40@50 on both layouts. Independently for 40 and longer fits, maximize the smaller seedling F1 gain across layouts. Break ties by distance from .50, shorter fit, then higher cutoff. If no eligible longer arm, show the smallest branching precision shortfall on the worse layout as a diagnostic.';
const allSeeds=Object.values(design).flatMap(c=>c.fieldSeeds);
assert.equal(new Set(allSeeds).size,allSeeds.length);

function unique(arms) {return [...new Map(arms.map(a=>[armKey(a),a])).values()];}

// Field Test replays the frozen model at each proposed cutoff and scores all three match distances.
function score(arms,fits,seeds) {
  const view=arms.map(arm=>{
    const fit=fits.find(f=>f.epochs===arm.epochs);
    return {...fit,model:{...fit.model,threshold:arm.percent/100}};
  });
  const {summary,fields,timingsMs}=scoreFields(view,seeds);
  const grid=arms.map((arm,i)=>({...arm,groups:summary.map(s=>({
    layout:s.layout,plantForm:s.plantForm,scores:s.models[i].scores
  }))}));
  const baseline=summary.map(s=>({layout:s.layout,plantForm:s.plantForm,targets:s.targets,
    reachable:s.proposalMatches15,height:s.height}));
  return {grid,baseline,timingsMs,fields:fields.map(f=>({...f,models:f.models.map((m,i)=>({...m,percent:arms[i].percent}))}))};
}

function compare(row,baseline) {
  const layouts=['reference','os1-64'].map(layout=>{
    function metric(source,form,measure) {
      return source.groups.find(s=>s.layout===layout && s.plantForm===form).scores.find(s=>s.cm===15)[measure];
    }
    const p=metric(row,'branching','precision'),p0=metric(baseline,'branching','precision');
    const precisionChange=p===null || p0===null ? null : p-p0;
    return {layout,seedlingF1Change:metric(row,'seedling','f1')-metric(baseline,'seedling','f1'),
      branchingPrecisionChange:precisionChange,precisionSafe:precisionChange!==null && precisionChange>=-.01};
  });
  return {layouts,withinLimit:layouts.every(l=>l.precisionSafe),smallerGain:Math.min(...layouts.map(l=>l.seedlingF1Change)),
    worstPrecisionChange:Math.min(...layouts.map(l=>l.branchingPrecisionChange ?? -Infinity))};
}
function choose(grid) {
  assert.deepEqual(grid.map(armKey),allArms.map(armKey));
  const baseline=grid.find(a=>armKey(a)===armKey(control));
  const checks=grid.map(({epochs,percent,...row})=>({epochs,percent,...compare(row,baseline)}));
  function best(candidates) {
    const safe=candidates.filter(a=>a.withinLimit);
    const ranking=(safe.length ? safe : candidates).sort((a,b)=>
      (safe.length ? 0 : b.worstPrecisionChange-a.worstPrecisionChange) || b.smallerGain-a.smallerGain ||
      Math.abs(a.percent-50)-Math.abs(b.percent-50) || a.epochs-b.epochs || b.percent-a.percent);
    const {epochs,percent,withinLimit,smallerGain}=ranking[0];
    return {epochs,percent,withinLimit,smallerGain};
  }
  return {short:best(checks.filter(c=>c.epochs===40)),long:best(checks.filter(c=>c.epochs!==40))};
}
function freeze(result) {
  return hash({design,settings,thresholds,rule,datasetHash:result.datasetHash,weightHashes:result.weightHashes,
    selection:choose(result.grid),gridHash:hash(result.grid)});
}

const [phase,filename]=process.argv.slice(2);
if (process.argv.length!==4 || !['development','confirmation'].includes(phase)) {
  throw Error('Use development followed by the duration development JSON, or confirmation followed by this study’s frozen development JSON.');
}
const prior=JSON.parse(await readFile(filename,'utf8'));
const {trainSeed,fieldSeeds}=design[phase];
let output;
if (phase==='development') {
  assert.equal(prior.phase,'development');
  assert.deepEqual(prior.design.development,design.development);
  const {epochs:discardEpochs,...sourceSettings}=settings;
  assert.deepEqual(prior.settings,sourceSettings);
  assert.deepEqual(prior.fits.map(f=>f.epochs),lengths);
  assert.ok(prior.manifest.every(t=>!allSeeds.includes(t.seed)));
  const fits=prior.fits.map(f=>{
    assert.equal(hash(f.model),f.weightHash);
    return {...f,manifest:prior.manifest,seed:trainSeed};
  });
  const result=score(allArms,fits,fieldSeeds);
  // The full cutoff sweep must replay the published .50 operating points exactly.
  for (const group of prior.summary) {
    for (const arm of group.models) {
      const scores=result.grid.find(r=>r.epochs===arm.epochs && r.percent===50).groups
        .find(g=>g.plantForm===group.plantForm && g.layout===group.layout).scores;
      assert.deepEqual(scores,arm.scores);
    }
  }
  output={...result,selection:choose(result.grid),datasetHash:prior.datasetHash,
    weightHashes:fits.map(({epochs,weightHash})=>({epochs,weightHash})),manifest:prior.manifest,
    preparationMs:prior.preparationMs,trainingMs:fits.map(({epochs,fitMs})=>({epochs,fitMs}))};
  output.freezeHash=freeze(output);
} else {
  assert.equal(prior.study,'tomato-duration-cutoffs-v1');
  assert.equal(prior.phase,'development');
  assert.deepEqual(prior.design,design);
  assert.deepEqual(prior.settings,settings);
  assert.equal(prior.rule,rule);
  assert.equal(prior.freezeHash,freeze(prior));
  const selection=choose(prior.grid);
  assert.deepEqual(selection,prior.selection);
  const arms=unique([control,selection.short,selection.long].map(({epochs,percent})=>({epochs,percent})));
  const start=performance.now(), config={...settings,seed:trainSeed};
  const set=await buildDataset({...config,auditPositiveSampling:true});
  assert.equal(set.Y.length,settings.sampleLimit);
  assert.ok(set.manifest.every(t=>!allSeeds.includes(t.seed) && !prior.manifest.some(p=>p.seed===t.seed)));
  const preparationMs=performance.now()-start;
  const datasetHash=createHash('sha256').update(new Uint8Array(set.X.buffer))
    .update(new Uint8Array(set.Y.buffer)).update(JSON.stringify(set.scaling)).digest('hex');
  const fits=[];
  for (const epochs of new Set(arms.map(a=>a.epochs))) {
    const begin=performance.now();
    const trained=await trainNetworkCPU(set.X,set.Y,{...config,epochs,dims:set.dims});
    assert.equal(trained.epochsCompleted,epochs);
    const model=weightArtifact({settings:config,scaling:set.scaling,stats:set.stats,weights:trained.weights,
      trainer:trainerId(config),epochs});
    fits.push({epochs,seed:trainSeed,manifest:set.manifest,model,weightHash:hash(model),fitMs:performance.now()-begin});
  }
  const result=score(arms,fits,fieldSeeds);
  const baseline=result.grid.find(a=>armKey(a)===armKey(control));
  const tunedShort=result.grid.find(a=>armKey(a)===armKey(selection.short));
  const tunedLong=result.grid.find(a=>armKey(a)===armKey(selection.long));
  output={...result,selection,freezeHash:prior.freezeHash,datasetHash,
    weightHashes:fits.map(({epochs,weightHash})=>({epochs,weightHash})),manifest:set.manifest,
    preparationMs,trainingMs:fits.map(({epochs,fitMs})=>({epochs,fitMs})),
    shortVsStarter:compare(tunedShort,baseline),longVsStarter:compare(tunedLong,baseline),longVsTunedShort:compare(tunedLong,tunedShort)};
}
console.log(JSON.stringify({study:'tomato-duration-cutoffs-v1',phase,domain:'synthetic',backend:'CPU',
  node:process.version,cpu:cpus()[0]?.model,design,settings,thresholds,rule,...output},null,2));
