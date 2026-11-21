// Hold initial raw-input predictions equal while fitting in two coordinate systems.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {features} from '../../trainer/models/data.js';
import {initializeFit,scoreSavedWeights} from '../../trainer/models/network.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {hash} from './tomato-cutoff-controls.mjs';
import {prepareScalerCrossTraining} from './tomato-scaler-controls.mjs';
import {poolScores} from './tomato-soil-controls.mjs';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';
import {transport,sourceFreeze} from './tomato-scaler-transport.mjs';
import {settings} from './tomato-hard-negative-runner.mjs';

const design={study:'tomato-scaler-start-v1',sourceFreeze,trainingSeeds:[3301907,3413033,3524159],
  testSeeds:[59151017,59282039,59413051,59544077,59675093,59806119],settings,
  question:'With mined rows fixed, compare ordinary scale and seed, mined scale and seed, and mined scale initialized to preserve the ordinary initial raw-input function.',
  pairs:['Coordinates: ordinary to matched start','Initialization: mined to matched start'],
  captures:'Soil, 60000 rays, both tomato stages on grid and rings, with and without weeds.',
  scoreTolerance:2e-5};
const designHash=hash(design);
const methods=['ordinary','mined','matched'];
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const scores=(raw,m)=>scoreSavedWeights(raw,m,m.peakAveraging,m.featureMode);

function initial(model) {
  const dims=model.inputs;
  const {weights}=initializeFit(new Float32Array(dims),new Float32Array(1),{...settings,dims});
  return {...model,epochs:0,weights:Array.from(weights)};
}

function verifyStart(raw,ordinary,matched) {
  const a=scores(raw,ordinary),b=scores(raw,matched);
  let max=0;
  for (let i=0;i<a.length;i++) {
    max=Math.max(max,Math.abs(a[i]-b[i]));
    assert.equal(a[i]>=settings.threshold,b[i]>=settings.threshold);
  }
  assert.ok(max<=design.scoreTolerance);
  return max;
}

const freeze=training=>hash({designHash,training:training.map(t=>({
  seed:t.seed,rows:t.rows,excluded:t.excluded,models:methods.map(name=>hash(t.models[name]))
}))});

async function fit(source) {
  assert.equal(source.study,'tomato-training-scaler-cross-v1'); assert.equal(source.phase,'fit');
  assert.equal(source.freezeHash,sourceFreeze); assert.deepEqual(source.design.settings,settings);
  assert.deepEqual(source.training.map(t=>t.seed),design.trainingSeeds);
  const training=[];
  for (const t of source.training) {
    const {sets,raw,receipt}=await prepareScalerCrossTraining(t.seed);
    assert.deepEqual(receipt.rawHashes,t.rawHashes);
    assert.deepEqual(receipt.scalers,t.scalers);
    const models={};
    for (const name of ['ordinary','mined']) {
      const fit=t.fits.find(f=>f.rows==='mined' && f.scaler===name);
      assert.equal(hash(fit.model),fit.weightHash);
      assert.deepEqual(fit.model.scaling,sets[name].scaling);
      models[name]=fit.model;
    }
    const ordinary=initial(models.ordinary),mined=initial(models.mined),matched=transport(ordinary,mined.scaling);
    const trainingStartMaxError=Math.max(...Object.values(raw).map(matrix=>verifyStart(matrix,ordinary,matched)));
    const set=sets.mined;
    const train=weights=>trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims,initialWeights:Float32Array.from(weights)});
    // The explicit same-numbers start must exactly reproduce the original mined-scale control.
    const control=await train(mined.weights);
    assert.deepEqual(Array.from(control.weights),models.mined.weights);
    const begin=performance.now();
    const changed=await train(matched.weights);
    const fitMs=performance.now()-begin;
    assert.equal(changed.epochsCompleted,settings.epochs);
    models.matched={...models.mined,weights:Array.from(changed.weights)};
    const excluded=[...source.design.trainingSeeds,...source.design.testSeeds,...t.manifest.map(tile=>tile.seed)];
    assert.ok(design.testSeeds.every(seed=>!excluded.includes(seed)));
    training.push({seed:t.seed,rows:t.rawHashes.mined,excluded,models,fitMs,trainingStartMaxError});
  }
  return {training,freezeHash:freeze(training)};
}

function compare(a,b,cm) {
  const before=a.pinByReferenceAtCm[cm],after=b.pinByReferenceAtCm[cm];
  assert.equal(before.length,after.length);
  const result={cm,retained:0,lost:0,gained:0,missedBoth:0};
  for (let i=0;i<before.length;i++) {
    if (before[i]>=0 && after[i]>=0) result.retained++;
    else if (before[i]>=0) result.lost++;
    else if (after[i]>=0) result.gained++;
    else result.missedBoth++;
  }
  return result;
}

function confirm(frozen) {
  assert.equal(frozen.phase,'fit'); assert.deepEqual(frozen.design,design);
  assert.equal(frozen.designHash,designHash); assert.equal(freeze(frozen.training),frozen.freezeHash);
  assert.deepEqual(frozen.training.map(t=>t.seed),design.trainingSeeds);
  const fits=frozen.training.map(t=>{
    const ordinary=initial(t.models.ordinary);
    return {...t,ordinary,start:transport(ordinary,t.models.mined.scaling)};
  });
  const fields=[],summary=[],maxStartError=fits.map(()=>0);
  const timingsMs={generation:0,scoring:0};
  for (const seed of design.testSeeds) for (const stage of ['seedling','branching']) {
    let boxes;
    for (const layout of ['reference','os1-64']) for (const weeds of [false,true]) {
      const begin=performance.now();
      const scan=field({...tomatoTestRecipe(seed,layout,stage,true),weeds});
      if (boxes) assert.deepEqual(scan.labels.boxes,boxes); else boxes=scan.labels.boxes;
      timingsMs.generation+=performance.now()-begin;
      const start=performance.now(),tileId=scan.labels.tile_id;
      const input={xyz:scan.xyz,tileId,labels:{filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)}};
      const raw=features(scan,settings.minimumHeight,settings.peakAveraging,settings.featureMode).X;
      let height;
      const trials=fits.map((t,i)=>{
        maxStartError[i]=Math.max(maxStartError[i],verifyStart(raw,t.ordinary,t.start));
        const evaluation={},scores={};
        for (const key of methods) {
          const result=runFieldTest({...input,model:t.models[key]});
          height ??= result.baselineEvaluation.scores;
          evaluation[key]=result.evaluation;
          scores[key]=result.evaluation.scores;
        }
        const comparisons=Object.fromEntries(['ordinary','mined'].map(key=>[key,scores.matched.map(({cm})=>
          compare(evaluation[key],evaluation.matched,cm))]));
        return {seed:t.seed,scores,comparisons};
      });
      fields.push({seed,stage,layout,weeds,tileId,plants:boxes.length,proposals:raw.length/13,height,trials});
      timingsMs.scoring+=performance.now()-start;
    }
  }
  for (const stage of ['seedling','branching']) for (const layout of ['reference','os1-64']) for (const weeds of [false,true]) {
    const group=fields.filter(f=>f.stage===stage && f.layout===layout && f.weeds===weeds);
    summary.push({stage,layout,weeds,height:poolScores(group,f=>f.height),trials:fits.map((fit,i)=>{
      const scores=Object.fromEntries(methods.map(key=>[key,poolScores(group,f=>f.trials[i].scores[key])]));
      const comparisons=Object.fromEntries(['ordinary','mined'].map(key=>[key,scores.matched.map(({cm},j)=>{
        const rows=group.map(f=>f.trials[i].comparisons[key][j]);
        const counts=Object.fromEntries(['retained','gained','lost','missedBoth'].map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
        assert.equal(counts.retained+counts.gained,scores.matched[j].tp);
        assert.equal(counts.retained+counts.lost,scores[key][j].tp);
        return {cm,...counts};
      })]));
      return {seed:fit.seed,scores,comparisons};
    })});
  }
  return {freezeHash:frozen.freezeHash,maxStartError,timingsMs,summary,fields};
}

const [phase,path]=process.argv.slice(2);
assert.ok(phase==='plan' && !path || ['fit','confirm'].includes(phase) && path,'Use plan, fit <source-fit.json>, or confirm <start-fit.json>');
const result=phase==='fit' ? await fit(await read(path)) : phase==='confirm' ? confirm(await read(path)) : {};
console.log(JSON.stringify({phase,domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,design,designHash,...result},null,2));
