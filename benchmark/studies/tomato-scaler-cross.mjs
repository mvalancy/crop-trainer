// Cross training-row selection with the source of normalization; freeze before scoring.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {settings,captures} from './tomato-hard-negative-runner.mjs';
import {withTrainingScale} from '../../trainer/models/data.js';
import {bytesHash,fitScaledRows,prepareScalerCrossTraining} from './tomato-scaler-controls.mjs';
import {hash} from './tomato-cutoff-controls.mjs';
import {scoreFields} from './tomato-soil-controls.mjs';

const armNames=['ordinary','mined'].flatMap(rows=>['ordinary','mined'].map(scaler=>({rows,scaler,sampling:rows+'-rows/'+scaler+'-scale'})));
const study='tomato-training-scaler-cross-v1';
const design={trainingSeeds:[3301907,3413033,3524159],testSeeds:[57131017,57262037,57393053,57524069,57655087,57786103],
  settings,captures,arms:armNames,pilotEpochs:40,hardCount:150,
  mining:'Match the ordinary near/far background quotas at 30 cm. Retain identical 300 shuffled crop examples plus 300 background examples. Compute both scalers on these training rows alone.',
  primary:'At fixed 0.65 and 15 cm, compare each arm with ordinary rows and ordinary scaling. Require fewer extra weedy-seedling pins on grid and rings, with no more than one percentage point lost in seedling recall or branching precision on each layout in either clean or weedy fields.',
  contrasts:'Change one factor at a time. Interaction is (mined/mined − mined/ordinary) − (ordinary/mined − ordinary/ordinary). Each contrast uses the same planting and training seed.'};
const designHash=hash(design);
assert.equal(new Set([...design.trainingSeeds,...design.testSeeds]).size,design.trainingSeeds.length+design.testSeeds.length);

function freeze(training) {
  return hash({designHash,training:training.map(t=>({
    seed:t.seed,manifest:t.manifest,positiveHash:t.positiveHash,pilotHash:t.pilotHash,negativePoolHash:t.negativePoolHash,
    minedIndexHash:t.minedIndexHash,labelsHash:t.labelsHash,rawHashes:t.rawHashes,scalers:t.scalers,
    fits:t.fits.map(({rows,scaler,xHash,weightHash})=>({rows,scaler,xHash,weightHash}))
  }))});
}

function factorial(scores) {
  const [oo,om,mo,mm]=scores;
  const effect=(a,b)=>Object.fromEntries(['tp','fp','fn','precision','recall','f1'].map(k=>[k,a[k]===null || b[k]===null ? null : a[k]-b[k]]));
  const scaleOnOrdinary=effect(om,oo),scaleOnMined=effect(mm,mo);
  return {scaleOnOrdinary,scaleOnMined,rowsOnOrdinaryScale:effect(mo,oo),rowsOnMinedScale:effect(mm,om),
    interaction:effect(scaleOnMined,scaleOnOrdinary)};
}

function summarize(clean,weedy) {
  const contrasts=[],guard=[];
  for (const seed of design.trainingSeeds) {
    const checks=armNames.slice(1).map(arm=>({seed,sampling:arm.sampling,checks:[]}));
    for (const [condition,report] of Object.entries({clean,weedy})) {
      for (const layout of ['reference','os1-64']) {
        const at15={};
        for (const form of ['seedling','branching']) {
          const group=report.summary.find(s=>s.plantForm===form && s.layout===layout);
          const scores=armNames.map(a=>group.models.find(m=>m.seed===seed && m.sampling===a.sampling).scores);
          for (const [i,{cm}] of scores[0].entries()) {
            const operating=scores.map(s=>s[i]);
            contrasts.push({seed,condition,form,layout,cm,...factorial(operating)});
            if (cm===15) at15[form]=operating;
          }
        }
        for (const [i,entry] of checks.entries()) {
          const candidate=i+1,b=at15.branching;
          const seedlingExtras=at15.seedling[candidate].fp-at15.seedling[0].fp;
          const seedlingRecall=at15.seedling[candidate].recall-at15.seedling[0].recall;
          const branchingPrecision=b[candidate].precision===null || b[0].precision===null ? null : b[candidate].precision-b[0].precision;
          entry.checks.push({condition,layout,seedlingExtras,seedlingRecall,branchingPrecision,
            pass:(condition==='clean'||seedlingExtras<0) && seedlingRecall>=-.01 && branchingPrecision!==null && branchingPrecision>=-.01});
        }
      }
    }
    guard.push(...checks.map(g=>({...g,passed:g.checks.every(c=>c.pass)})));
  }
  return {contrasts,guard};
}

const [phase,path]=process.argv.slice(2);
assert.ok((phase==='plan'||phase==='fit') && process.argv.length===3 || phase==='confirm' && process.argv.length===4,'Use plan, fit or confirm fit.json.');
let result={};
if (phase==='fit') {
  const training=[],excluded=new Set([...design.trainingSeeds,...design.testSeeds]);
  for (const seed of design.trainingSeeds) {
    const {sets,receipt}=await prepareScalerCrossTraining(seed);
    for (const tile of receipt.manifest) assert.ok(!excluded.has(tile.seed));
    for (const tile of receipt.manifest) excluded.add(tile.seed);
    const fits=[];
    for (const arm of armNames) {
      const set=withTrainingScale(sets[arm.rows],sets[arm.scaler]),{X,scaling}=set;
      fits.push({...arm,seed,epochs:settings.epochs,sampleLimit:settings.sampleLimit,xHash:bytesHash(X),
        ...await fitScaledRows(set,X,scaling,seed,settings.epochs)});
    }
    training.push({...receipt,fits});
  }
  result={training,freezeHash:freeze(training)};
} else if (phase==='confirm') {
  const frozen=JSON.parse(await readFile(path,'utf8'));
  assert.equal(frozen.study,study);assert.equal(frozen.phase,'fit');
  assert.deepEqual(frozen.design,design);assert.equal(frozen.designHash,designHash);
  assert.deepEqual(frozen.training.map(t=>t.seed),design.trainingSeeds);
  assert.equal(frozen.freezeHash,freeze(frozen.training));
  const fits=frozen.training.flatMap(t=>{
    assert.deepEqual(t.fits.map(f=>f.sampling),armNames.map(a=>a.sampling));
    return t.fits.map(f=>{
      assert.equal(f.weightHash,hash(f.model));assert.equal(f.seed,t.seed);
      assert.deepEqual(f.model.scaling,t.scalers[f.scaler]);assert.equal(f.model.threshold,settings.threshold);
      return {...f,manifest:t.manifest};
    });
  });
  const clean=scoreFields(fits,design.testSeeds,{weeds:false}),weedy=scoreFields(fits,design.testSeeds,{weeds:true});
  for (const [i,a] of clean.fields.entries()) {
    const b=weedy.fields[i];
    assert.deepEqual([a.seed,a.layout,a.plantForm],[b.seed,b.layout,b.plantForm]);
    assert.equal(a.capture.boxHash,b.capture.boxHash);assert.equal(a.capture.rayXYHash,b.capture.rayXYHash);
    assert.equal(a.capture.weedReturns,0);assert.ok(b.capture.weedReturns>0);
  }
  result={freezeHash:frozen.freezeHash,clean,weedy,...summarize(clean,weedy)};
}
console.log(JSON.stringify({study,phase,domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,
  design,designHash,...result},null,2));
