// Frozen weights and Field Test scoring shared by the tomato cutoff studies.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildDataset} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {weightArtifact,trainerId} from '../../trainer/models/network.js';
import {settings as soilSettings,scoreFields} from './tomato-soil-controls.mjs';

export const settings={...soilSettings,sampleLimit:600,positiveSampling:'ordinary'};
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Field Test replays the frozen model at each proposed cutoff and scores all three match distances.
export function score(arms,fits,seeds,capture) {
  const view=arms.map(arm=>{
    const fit=fits.find(f=>f.epochs===arm.epochs && (arm.seed===undefined || f.seed===arm.seed));
    assert.ok(fit,'Each operating point needs its frozen weights.');
    return {...fit,model:{...fit.model,threshold:arm.percent/100}};
  });
  const {summary,fields,timingsMs}=scoreFields(view,seeds,capture);
  const grid=arms.map((arm,i)=>({...arm,groups:summary.map(s=>({
    layout:s.layout,plantForm:s.plantForm,scores:s.models[i].scores
  }))}));
  const baseline=summary.map(s=>({layout:s.layout,plantForm:s.plantForm,targets:s.targets,
    reachable:s.proposalMatches15,height:s.height}));
  return {grid,baseline,timingsMs,fields:fields.map(f=>({...f,models:f.models.map((m,i)=>({...m,percent:arms[i].percent}))}))};
}

export function compare(row,baseline) {
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
export async function fitSchedules(trainSeed,epochsToFit,excludedSeeds) {
  const start=performance.now(), config={...settings,seed:trainSeed};
  const set=await buildDataset({...config,auditPositiveSampling:true});
  assert.equal(set.Y.length,settings.sampleLimit);
  assert.ok(set.manifest.every(t=>!excludedSeeds.has(t.seed)));
  const preparationMs=performance.now()-start;
  const datasetHash=createHash('sha256').update(new Uint8Array(set.X.buffer))
    .update(new Uint8Array(set.Y.buffer)).update(JSON.stringify(set.scaling)).digest('hex');
  const fits=[];
  for (const epochs of new Set(epochsToFit)) {
    const begin=performance.now();
    const trained=await trainNetworkCPU(set.X,set.Y,{...config,epochs,dims:set.dims});
    assert.equal(trained.epochsCompleted,epochs);
    const model=weightArtifact({settings:config,scaling:set.scaling,stats:set.stats,weights:trained.weights,
      trainer:trainerId(config),epochs});
    fits.push({epochs,seed:trainSeed,manifest:set.manifest,model,weightHash:hash(model),fitMs:performance.now()-begin});
  }
  return {fits,datasetHash,manifest:set.manifest,preparationMs,
    weightHashes:fits.map(({epochs,weightHash})=>({epochs,weightHash})),trainingMs:fits.map(({epochs,fitMs})=>({epochs,fitMs}))};
}

// This rule is frozen for the independent-panel study and its panel-size replay.
export const calibrationThresholds = Array.from({length:19},(_,i)=>5*(i+1));

export function selectFitCutoffs(rows,trainingSeeds) {
  return trainingSeeds.map(seed=>{
    const starter = rows.filter(row=>row.seed===seed && row.epochs===40);
    assert.equal(starter.length,1);
    assert.equal(starter[0].percent,50);
    const longer = rows.filter(row=>row.seed===seed && row.epochs===640);
    assert.deepEqual(longer.map(row=>row.percent).sort((a,b)=>a-b),calibrationThresholds);
    const eligible = longer.map(row=>({percent:row.percent,...compare(row,starter[0])}))
      .filter(row=>row.withinLimit && row.smallerGain>0)
      .sort((a,b)=>b.smallerGain-a.smallerGain || Math.abs(a.percent-50)-Math.abs(b.percent-50) || b.percent-a.percent);
    return eligible.length ? {seed,epochs:640,percent:eligible[0].percent} : {seed,epochs:40,percent:50};
  });
}
