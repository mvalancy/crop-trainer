// Both studies fit the same starter network and evaluate downloaded weights through Field Test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../../trainer/generator/field.js';
import {buildDataset, targetCenters, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {weightArtifact, trainerId} from '../../trainer/models/network.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {tomatoTerrainTraining, tomatoTestRecipe} from './tomato-terrain-controls.mjs';

export const settings = {...tomatoTerrainTraining, featureMode:'local-ground'};
const layouts = ['reference', 'os1-64'];
const forms = ['seedling', 'branching'];

// Match the joint sampler's stage totals, allowing the ordinary shuffle to choose soil variants.
function selectByForm(candidates, count, labels, quotas) {
  const remaining = new Map(quotas);
  const selected = [];
  for (const [index,{tileId,xy:[x,y]}] of candidates.entries()) {
    const {centers,boxes} = labels.get(tileId);
    let nearest = -1, best = .095 ** 2;
    for (const [i,[tx,ty]] of centers.entries()) {
      const distance = (x-tx)**2 + (y-ty)**2;
      if (distance < best) { nearest=i; best=distance; }
    }
    assert.notEqual(nearest,-1);
    const form = boxes[nearest].plant_form;
    if (remaining.get(form) > 0) {
      remaining.set(form,remaining.get(form)-1);
      selected.push(index);
    }
    if (selected.length === count) break;
  }
  assert.equal(selected.length,count);
  return selected;
}

function assertPairedRows(first,next) {
  assert.deepEqual(next.manifest,first.manifest);
  assert.deepEqual(next.Y,first.Y);
  const fieldPools=set=>set.stats.trainingExamplesByField.map(({usedPositive,...counts})=>counts);
  assert.deepEqual(fieldPools(next),fieldPools(first));
  assert.deepEqual(next.stats.positiveExamplesByFormSoil.map(({selected,...pool}) => pool),
    first.stats.positiveExamplesByFormSoil.map(({selected,...pool}) => pool));
  for (let row=0; row<next.Y.length; row++) {
    if (next.Y[row] !== 0) continue;
    for (let col=0; col<next.dims; col++) {
      const i=row*next.dims+col;
      const rawA=first.X[i]*first.scaling.std[col]+first.scaling.means[col];
      const rawB=next.X[i]*next.scaling.std[col]+next.scaling.means[col];
      assert.ok(Math.abs(rawA-rawB) < 2e-6*Math.max(1,Math.abs(rawA),Math.abs(rawB)),
        'The ordered negative features should match after undoing each fit’s Float32 scaling');
    }
  }
}

export async function fitPair(seed,sampleLimit,{stageControl=false}={}) {
  const fits=[];
  let ordinary;
  const quotas=new Map(), labels=new Map();
  for (const sampling of stageControl ? ['ordinary','form-soil','form-only'] : ['ordinary','form-soil']) {
    const config={...settings,seed,sampleLimit,positiveSampling:sampling==='form-only'?'ordinary':sampling};
    const start=performance.now();
    const hook=sampling==='form-only' ? {
      onScan(scan,step) {
        if (step.split==='Training') labels.set(scan.labels.tile_id,{
          centers:targetCenters(scan.labels.boxes),boxes:scan.labels.boxes
        });
      },
      selectPositiveRows:(rows,count)=>selectByForm(rows,count,labels,quotas)
    } : {};
    const set=await buildDataset({...config,...hook,auditPositiveSampling:true});
    const preparationMs=performance.now()-start;
    if (ordinary) assertPairedRows(ordinary,set); else ordinary=set;
    const strata=set.stats.positiveExamplesByFormSoil;
    assert.equal(set.Y.length,2*strata.reduce((sum,g)=>sum+g.selected,0));
    assert.ok(strata.every(g=>g.selected<=g.available));
    if (sampling==='form-soil') {
      for (const g of strata) quotas.set(g.plantForm,(quotas.get(g.plantForm)??0)+g.selected);
    }
    if (sampling==='form-only') {
      for (const [form,n] of quotas) {
        assert.equal(strata.filter(g=>g.plantForm===form).reduce((sum,g)=>sum+g.selected,0),n);
      }
    }
    const t=performance.now();
    const trained=await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
    const fitMs=performance.now()-t;
    assert.equal(trained.epochsCompleted,settings.epochs);
    const model=weightArtifact({settings:config,scaling:set.scaling,weights:trained.weights,
      trainer:trainerId(config),epochs:trained.epochsCompleted,stats:set.stats});
    fits.push({seed,sampling,sampleLimit,samples:set.Y.length,strata,manifest:set.manifest,
      weightHash:createHash('sha256').update(JSON.stringify(model)).digest('hex'),model,preparationMs,fitMs});
  }
  return fits;
}

function pool(scans,read) {
  return MATCH_RADII_METERS.map((r,i)=>{
    let tp=0,fp=0,fn=0;
    for (const scan of scans) {
      const row=read(scan)[i];
      assert.equal(row.cm,100*r);
      tp+=row.tp;fp+=row.fp;fn+=row.fn;
    }
    return {cm:100*r,tp,fp,fn,precision:tp+fp ? tp/(tp+fp) : null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
  });
}

export function scoreFields(fits,fieldSeeds) {
  const fields=[], summary=[];
  const timingsMs={generationMs:0,validationMs:0};
  for (const fit of fits) assert.ok(fit.manifest.every(t=>!fieldSeeds.includes(t.seed)));
  for (const seed of fieldSeeds) for (const plantForm of forms) {
    let boxes;
    for (const layout of layouts) {
      const t=performance.now();
      const scan=field(tomatoTestRecipe(seed,layout,plantForm,true));
      timingsMs.generationMs+=performance.now()-t;
      assert.equal(scan.sampledRays,60000);
      if (boxes) assert.deepEqual(scan.labels.boxes,boxes); else boxes=scan.labels.boxes;
      const tileId=scan.labels.tile_id, labels={filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
      const record={seed,plantForm,layout,tileId,targets:boxes.length,models:[]};
      for (const fit of fits) {
        const v=performance.now();
        const result=runFieldTest({model:fit.model,xyz:scan.xyz,labels,tileId});
        timingsMs.validationMs+=performance.now()-v;
        const reachable=result.stages15cm.find(s=>s.stage==='proposals').matched;
        if (record.height) {
          assert.equal(result.proposalCount,record.proposals);
          assert.equal(record.proposalMatches15,reachable);
          assert.deepEqual(result.baselineEvaluation.scores,record.height);
        } else {
          record.proposals=result.proposalCount;
          record.proposalMatches15=reachable;
          record.height=result.baselineEvaluation.scores;
        }
        record.models.push({seed:fit.seed,sampling:fit.sampling,sampleLimit:fit.sampleLimit,
          ...(fit.epochs === undefined ? {} : {epochs:fit.epochs}),
          accepted:result.acceptedCount,scores:result.evaluation.scores});
      }
      fields.push(record);
    }
  }
  for (const layout of layouts) for (const plantForm of forms) {
    const scans=fields.filter(f=>f.layout===layout && f.plantForm===plantForm);
    summary.push({layout,plantForm,targets:scans.reduce((s,f)=>s+f.targets,0),
      proposalMatches15:scans.reduce((s,f)=>s+f.proposalMatches15,0),height:pool(scans,s=>s.height),
      models:fits.map(({seed,sampling,sampleLimit,epochs},i)=>({seed,sampling,sampleLimit,
        ...(epochs === undefined ? {} : {epochs}),scores:pool(scans,s=>s.models[i].scores)}))});
  }
  return {fields,summary,timingsMs};
}
