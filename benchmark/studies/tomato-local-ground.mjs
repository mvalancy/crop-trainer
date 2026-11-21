// Can two nearby-terrain features help a mixed-stage tomato classifier keep small seedlings?
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {readFileSync} from 'node:fs';
import {field} from '../../trainer/generator/field.js';
import {tomatoTerrainTraining as settings,tomatoTestRecipe} from './tomato-terrain-controls.mjs';
import {buildDataset,detectionStages,features,matchCenters,MATCH_RADII_METERS,targetCenters} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {scoreSavedWeights,trainerId,weightArtifact} from '../../trainer/models/network.js';

const trainingSeeds=[181381,293497];
const cohorts={
  development:[25117731,25228849,25339967,25451081],
  confirmation:[25562197,25673311,25784429,25895543,26006659,26117771],
  density:[26228887,26339999,26451113,26562229]
};
const modes=['absolute','local-ground'], forms=['seedling','branching'], layouts=['reference','os1-64'];
const separation=.22;
const heldout=Object.values(cohorts).flat();
assert.equal(new Set(heldout).size,heldout.length);
const selected=process.argv.slice(2);
if(selected[0]==='diagnose'){
  if (selected.length!==2) throw Error('Use diagnose followed by a completed confirmation JSON file.');
  console.log(JSON.stringify(diagnoseGrid(JSON.parse(readFileSync(selected[1],'utf8'))),null,2));
  process.exit(0);
}
if(selected.length>1 || selected.some(s=>!Object.hasOwn(cohorts,s))) throw Error('Choose development, confirmation or density.');

function invariantColumns(a,b) {
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++) if(i%13!==1 && i%13!==12) assert.equal(a[i],b[i]);
}
const elapsed={trainDataMs:0,fitMs:0}, fits=[];
for (const seed of trainingSeeds) {
  let control;
  for (const featureMode of modes) {
    const start=performance.now(),set=await buildDataset({...settings,seed,featureMode});
    const dataMs=performance.now()-start;
    assert.equal(set.dims,13);
    assert.equal(set.stats.featureMode??'absolute',featureMode,'Dataset did not use the requested features');
    assert.ok(set.manifest.every(t=>!heldout.includes(t.seed) && t.sampledRays===60000));
    if(control){
      assert.deepEqual(set.manifest,control.manifest);
      assert.deepEqual(set.Y,control.Y);
      assert.deepEqual(set.stats.trainingExamplesByField,control.stats.trainingExamplesByField);
      invariantColumns(set.X,control.X);
    } else control=set;
    const t=performance.now(),fit=await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
    const fitMs=performance.now()-t;
    assert.equal(fit.epochsCompleted,settings.epochs);
    elapsed.trainDataMs+=dataMs; elapsed.fitMs+=fitMs;
    const model=weightArtifact({settings:{...settings,featureMode},trainer:trainerId(settings),stats:set.stats,
      weights:fit.weights,scaling:set.scaling,epochs:fit.epochsCompleted});
    assert.equal(model.pinSeparation,separation);
    fits.push({seed,featureMode,examples:set.Y.length,fieldSeeds:set.stats.fieldSeeds.training,
      trainingTiles:set.manifest.filter(t=>t.split==='train').map(t=>t.tile_id),
      modelHash:createHash('sha256').update(JSON.stringify(model)).digest('hex'),
      featureSchema:model.featureSchema,dataMs,fitMs,model});
  }
}

function score(pins,truth){
  let matched15;
  const scores=MATCH_RADII_METERS.map(radius=>{
    const {count:tp,pinByBox}=matchCenters(pins,truth,radius);
    if(radius===.15) matched15=Array.from(pinByBox,v=>v>=0);
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp};
  });
  return {scores,matched15};
}
function compare(scan,truth,timed) {
  const rows=Object.fromEntries(modes.map(mode=>[mode,timed('featuresMs',()=>features({xyz:scan.xyz},
    settings.minimumHeight,settings.peakAveraging,mode))]));
  assert.deepEqual(rows.absolute.pos,rows['local-ground'].pos,'Feature treatment moved proposals');
  invariantColumns(rows.absolute.X,rows['local-ground'].X);
  const heightScores=Float32Array.from(rows.absolute.pos,(_,i)=>rows.absolute.X[13*i]);
  const height=timed('inferenceMs',()=>detectionStages(rows.absolute,heightScores,0,separation).selected);
  const predictions=fits.map(fit=>timed('inferenceMs',()=>{
    const row=rows[fit.featureMode];
    const p=scoreSavedWeights(row.X,fit.model,settings.peakAveraging,fit.featureMode);
    return detectionStages(row,p,settings.threshold,separation);
  }));
  return timed('scoringMs',()=>({
    candidates:rows.absolute.pos.length,
    proposalMatches15:matchCenters(rows.absolute.pos,truth,.15).count,
    height:score(height,truth),
    models:predictions.map((p,i)=>({modelHash:fits[i].modelHash,accepted:p.accepted.length,...score(p.selected,truth)}))
  }));
}

function requireSoilTwin(withSoil,withoutSoil){
  assert.deepEqual(withSoil.labels.boxes,withoutSoil.labels.boxes);
  assert.deepEqual(withSoil.skeleton,withoutSoil.skeleton);
  assert.deepEqual(withSoil.plantReturns,withoutSoil.plantReturns);
  let offset=0;
  for(let i=0;i<withSoil.cls.length;i++) if(withSoil.cls[i]!==0) {
    assert.equal(withoutSoil.cls[offset],withSoil.cls[i]);
    for(let axis=0;axis<3;axis++) assert.equal(withoutSoil.xyz[3*offset+axis],withSoil.xyz[3*i+axis]);
    offset++;
  }
  assert.equal(offset,withoutSoil.cls.length);
}
function pooled(scans,select){
  return MATCH_RADII_METERS.map((radius,i)=>{
    let tp=0,fp=0,fn=0;
    for(const scan of scans){
      const row=select(scan).scores[i];
      assert.equal(row.cm,radius*100);
      tp+=row.tp;fp+=row.fp;fn+=row.fn;
    }
    return {cm:radius*100,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
  });
}
function run(cohort) {
  const started=performance.now(),fields=[],summary=[];
  const timingsMs={generationMs:0,featuresMs:0,inferenceMs:0,scoringMs:0};
  const timed=(phase,f)=>{const t=performance.now(),v=f();timingsMs[phase]+=performance.now()-t;return v;};
  const budgets=cohort==='density'?[12000,60000]:[60000];
  for(const seed of cohorts[cohort]){
    const byForm=new Map();
    for(const budget of budgets) for(const layout of layouts){
      let firstXYZ;
      for(const plantForm of forms){
        let soilScan;
        for(const ground of [true,false]){
          const recipe=tomatoTestRecipe(seed,layout,plantForm,ground,budget);
          const scan=timed('generationMs',()=>field(recipe)),truth=targetCenters(scan.labels.boxes);
          assert.equal(scan.sampledRays,budget);
          if(byForm.has(plantForm)) assert.deepEqual(scan.labels.boxes,byForm.get(plantForm)); else byForm.set(plantForm,scan.labels.boxes);
          if(ground){
            soilScan=scan;
            if(!firstXYZ) firstXYZ=scan.xyz;
            else for(let i=0;i<scan.xyz.length;i+=3){
              assert.equal(scan.xyz[i],firstXYZ[i]);assert.equal(scan.xyz[i+1],firstXYZ[i+1]);
            }
          } else requireSoilTwin(soilScan,scan);
          fields.push({seed,budget,layout,plantForm,ground,tileId:scan.labels.tile_id,returns:scan.xyz.length/3,
            plants:truth.length,...compare(scan,truth,timed)});
        }
      }
    }
  }
  for(const budget of budgets) for(const layout of layouts) for(const plantForm of forms) for(const ground of [true,false]){
    const scans=fields.filter(s=>s.budget===budget && s.layout===layout && s.plantForm===plantForm && s.ground===ground);
    summary.push({budget,layout,plantForm,ground,plants:scans.reduce((n,s)=>n+s.plants,0),
      proposalMatches15:scans.reduce((n,s)=>n+s.proposalMatches15,0),height:pooled(scans,s=>s.height),
      models:fits.map(({seed,featureMode,modelHash},i)=>({seed,featureMode,modelHash,scores:pooled(scans,s=>s.models[i])}))});
  }
  timingsMs.totalMs=performance.now()-started;
  return {summary,fields,timingsMs};
}
const results=Object.fromEntries((selected.length?selected:Object.keys(cohorts)).map(c=>[c,run(c)]));
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',host:{cpu:cpus()[0]?.model,node:process.version},
  settings,trainingSeeds,cohorts,layouts,forms,separation,fits:fits.map(({model,...metadata})=>metadata),
  trainingTimingsMs:elapsed,results}));

// Diagnose the completed confirmation run without fitting weights or changing its threshold.
function diagnoseGrid(report) {
  const scans=report.results?.confirmation?.fields;
  const fits=report.fits?.filter(f=>f.seed===181381);
  if (!scans || fits?.length!==2) throw Error('Use a completed tomato local-ground confirmation report.');
  const columns={
    smoothedHeightCm:r=>100*r[0], middleHeightCm:r=>100*r[3], outerHeightCm:r=>100*r[4],
    nearbyReturnCount:r=>Math.round(Math.expm1(r[10]))
  };
  const group=()=>Object.fromEntries(Object.keys(columns).map(k=>[k,[]]));
  function describe(g) {
    const n=g.nearbyReturnCount.length;
    const quantiles=Object.fromEntries(Object.entries(g).map(([key,v])=>{
      v.sort((a,b)=>a-b);
      return [key,n?[.25,.5,.75].map(q=>v[Math.ceil(q*n)-1]):null];
    }));
    return {n,quartiles:quantiles};
  }
  return [true,false].map(ground=>{
    const fields=scans.filter(s=>s.budget===60000 && s.layout==='reference' && s.plantForm==='seedling' && s.ground===ground);
    assert.deepEqual(fields.map(s=>s.seed),cohorts.confirmation);
    const near=group(),far=group();
    let ambiguous=0;
    for(const record of fields){
      const scan=field(tomatoTestRecipe(record.seed,'reference','seedling',ground));
      assert.equal(scan.labels.tile_id,record.tileId);
      const truth=targetCenters(scan.labels.boxes),row=features({xyz:scan.xyz},settings.minimumHeight);
      assert.equal(row.pos.length,record.candidates);
      for(const [i,[x,y]] of row.pos.entries()){
        let distance2=Infinity;
        for(const [tx,ty] of truth) distance2=Math.min(distance2,(tx-x)**2+(ty-y)**2);
        const bucket=distance2<.095**2?near:distance2>.15**2?far:null;
        if (!bucket) {ambiguous++; continue;}
        const raw=row.X.subarray(13*i,13*(i+1));
        for(const [key,get] of Object.entries(columns)) bucket[key].push(get(raw));
      }
    }
    const stages=fits.map(fit=>{
      const rows=fields.map(s=>s.models.find(m=>m.modelHash===fit.modelHash));
      return {featureMode:fit.featureMode,modelHash:fit.modelHash,
        accepted:rows.reduce((n,r)=>n+r.accepted,0),
        kept:rows.reduce((n,r)=>n+r.scores[2].tp+r.scores[2].fp,0),
        matched:rows.reduce((n,r)=>n+r.scores[2].tp,0)};
    });
    return {ground,fields:fields.length,targets:fields.reduce((n,s)=>n+s.plants,0),
      candidates:fields.reduce((n,s)=>n+s.candidates,0),reachable15:fields.reduce((n,s)=>n+s.proposalMatches15,0),
      stages,near:describe(near),far:describe(far),ambiguous};
  });
}
