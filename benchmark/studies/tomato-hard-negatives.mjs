// Freeze the pilot, final weights and sampling receipts before looking at the test fields.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {buildDataset} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {selectHardNegatives} from '../../trainer/models/hard-negatives.js';
import {scoreSavedWeights,weightArtifact,trainerId} from '../../trainer/models/network.js';
import {scoreFields} from './tomato-soil-controls.mjs';
import {auditTrainingSurfaces} from './tomato-hard-negative-surfaces.mjs';
import {settings as priorSettings,hash} from './tomato-cutoff-controls.mjs';

const study='tomato-hard-negative-v1';
const settings={...priorSettings,threshold:.65,epochs:640};
const trainingSeeds=[2103181,2204207,2305237];
const testSeeds=[51112017,51224031,51336047,51448061,51560079,51672091];
const doses=[{sampling:'ordinary',hardCount:0},{sampling:'half-hard',hardCount:150},{sampling:'quarter-hard',hardCount:75}];
const captures={weeds:true,sticks:false,boards:false,scanNoise:null};
const design={trainingSeeds,testSeeds,settings,captures,doses,pilotEpochs:40,
  selection:'Score every eligible shuffled background row from training using the ordinary 40-epoch pilot. Take the declared number of highest scores (shuffled index breaks ties). Fill remaining places from the shuffled pool without duplicates. Retrain from the fixed initialization with new training-set scaling.',
  primary:'15 cm. Relative to ordinary 640 epochs, reduce extra seedling pins on weedy fields on each layout. Seedling recall and branching precision must each remain within one percentage point of ordinary on both layouts under both clean and weedy conditions. Test the half-hard and quarter-hard rules separately without choosing a dose on confirmation.'};
const designHash=hash(design);

function bytesHash(values) {
  return createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex');
}

async function fitModel(set,seed,epochs) {
  const start=performance.now();
  const trained=await trainNetworkCPU(set.X,set.Y,{...settings,seed,epochs,dims:set.dims});
  assert.equal(trained.epochsCompleted,epochs);
  const model=weightArtifact({settings,scaling:set.scaling,weights:trained.weights,stats:set.stats,trainer:trainerId(settings),epochs});
  return {model,weightHash:hash(model),fitMs:performance.now()-start};
}

async function fitPlantings(seed,excluded) {
  const scans=new Map(),fits=[];
  let generationMs=0,negativeFeatures,positiveHash,rankingMs=0;
  const generate=recipe=>{
    const key=JSON.stringify(recipe);
    if (!scans.has(key)) {
      const start=performance.now();
      scans.set(key,field({...recipe,...captures}));
      generationMs+=performance.now()-start;
    }
    return scans.get(key);
  };
  const options={...settings,seed,generate,selectPositiveRows(rows,count) {
    const ids=rows.slice(0,count).map(({tileId,xy})=>[tileId,...xy]);
    const digest=hash(ids);
    if (positiveHash) assert.equal(digest,positiveHash); else positiveHash=digest;
    return ids.map((_,i)=>i);
  }};
  const begin=performance.now();
  const ordinary=await buildDataset({...options,selectNegativeRows(raw,count) {
    negativeFeatures=raw;
    return Array.from({length:count},(_,i)=>i);
  }});
  const ordinaryPreparationMs=performance.now()-begin;
  assert.equal(ordinary.Y.length,600);
  assert.equal(ordinary.Y.reduce((sum,y)=>sum+y,0),300);
  assert.ok(ordinary.manifest.every(t=>!excluded.has(t.seed)));
  for (const item of ordinary.manifest) excluded.add(item.seed);

  const negativePoolHash=bytesHash(negativeFeatures);
  const pilot=await fitModel(ordinary,seed,design.pilotEpochs);
  const scoringStart=performance.now();
  const scores=scoreSavedWeights(negativeFeatures,pilot.model,settings.peakAveraging,settings.featureMode);
  assert.ok(scores.every(Number.isFinite));
  const pilotScoringMs=performance.now()-scoringStart;
  const count=ordinary.Y.length/2;
  assert.ok(scores.length>count);
  for (const {sampling,hardCount} of doses) {
    const rankingStart=performance.now();
    const indices=selectHardNegatives(scores,count,hardCount);
    rankingMs+=performance.now()-rankingStart;
    const prepare=performance.now();
    const set=hardCount===0 ? ordinary : await buildDataset({...options,selectNegativeRows(raw,n) {
      assert.equal(bytesHash(raw),negativePoolHash);
      assert.equal(n,indices.length);
      return indices;
    }});
    const rebuildMs=performance.now()-prepare;
    assert.deepEqual(set.manifest,ordinary.manifest);
    assert.deepEqual(set.Y,ordinary.Y);
    const selected=indices.map(i=>scores[i]).sort((a,b)=>a-b);
    fits.push({sampling,seed,epochs:settings.epochs,sampleLimit:settings.sampleLimit,hardCount,
      negativeIndexHash:hash(indices),ordinaryRowsRetained:indices.filter(i=>i<count).length,
      pilotScores:{mean:selected.reduce((sum,x)=>sum+x,0)/count,min:selected[0],median:(selected[count/2-1]+selected[count/2])/2,max:selected.at(-1)},
      rowsHash:bytesHash(set.X),labelsHash:bytesHash(set.Y),rebuildMs,...await fitModel(set,seed,settings.epochs)});
  }
  const {manifest}=ordinary;
  return {seed,manifest,samples:ordinary.Y.length,positives:count,positiveHash,negativeCandidates:scores.length,
    negativePoolHash,pilotScoresHash:bytesHash(scores),generationMs,ordinaryPreparationMs,pilotScoringMs,rankingMs,pilot,fits};
}

function frozen(training) {
  return hash({designHash,training:training.map(t=>({seed:t.seed,manifest:t.manifest,
    positiveHash:t.positiveHash,negativePoolHash:t.negativePoolHash,pilotScoresHash:t.pilotScoresHash,pilot:t.pilot.weightHash,
    fits:t.fits.map(({sampling,negativeIndexHash,rowsHash,labelsHash,weightHash})=>({sampling,negativeIndexHash,rowsHash,labelsHash,weightHash}))}))});
}

function comparisons(clean,weedy) {
  return trainingSeeds.flatMap(seed=>doses.slice(1).map(({sampling})=>{
    const checks=[];
    for (const [condition,result] of Object.entries({clean,weedy})) {
      for (const layout of ['reference','os1-64']) {
        const group=form=>result.summary.find(g=>g.layout===layout && g.plantForm===form);
        function metrics(form,method) {
          return group(form).models.find(m=>m.seed===seed && m.sampling===method).scores.find(s=>s.cm===15);
        }
        const ordinary=metrics('seedling','ordinary'),trial=metrics('seedling',sampling);
        const basePrecision=metrics('branching','ordinary').precision,precision=metrics('branching',sampling).precision;
        const recallChange=trial.recall-ordinary.recall;
        const branchingPrecisionChange=precision===null || basePrecision===null ? null : precision-basePrecision;
        const extraPinChange=trial.fp-ordinary.fp;
        checks.push({condition,layout,extraPinChange,seedlingMatchChange:trial.tp-ordinary.tp,recallChange,branchingPrecisionChange,
          passed:(condition==='clean' || extraPinChange<0) && recallChange>=-.01 && branchingPrecisionChange!==null && branchingPrecisionChange>=-.01});
      }
    }
    return {seed,sampling,passed:checks.every(c=>c.passed),checks};
  }));
}

const [phase,source]=process.argv.slice(2);
assert.ok((['plan','fit'].includes(phase) && !source || ['confirm','surfaces'].includes(phase) && source) && process.argv.length===(source?4:3),
  'Use plan, fit, confirm fit.json, or surfaces fit.json.');
let output={};
if (phase==='fit') {
  const training=[],excluded=new Set([...testSeeds,...trainingSeeds]);
  for (const seed of trainingSeeds) training.push(await fitPlantings(seed,excluded));
  output={training,freezeHash:frozen(training)};
} else if (phase==='confirm' || phase==='surfaces') {
  const prior=JSON.parse(await readFile(source,'utf8'));
  assert.equal(prior.study,study);
  assert.equal(prior.phase,'fit');
  assert.deepEqual(prior.design,design);
  assert.equal(prior.designHash,designHash);
  assert.equal(prior.freezeHash,frozen(prior.training));
  assert.deepEqual(prior.training.map(t=>t.seed),trainingSeeds);
  const fits=prior.training.flatMap(t=>{
    assert.equal(hash(t.pilot.model),t.pilot.weightHash);
    assert.deepEqual(t.fits.map(f=>f.sampling),doses.map(d=>d.sampling));
    for (const f of t.fits) {
      assert.equal(hash(f.model),f.weightHash);
      assert.equal(f.seed,t.seed);
      assert.equal(f.model.threshold,settings.threshold);
    }
    return t.fits.map(f=>({...f,manifest:t.manifest}));
  });
  if (phase==='surfaces') {
    output={freezeHash:prior.freezeHash,rows:await auditTrainingSurfaces(prior.training,design)};
  } else {
    const clean=scoreFields(fits,testSeeds,{weeds:false});
    const weedy=scoreFields(fits,testSeeds,{weeds:true});
    for (const [i,field] of clean.fields.entries()) {
      const paired=weedy.fields[i];
      assert.deepEqual([field.seed,field.layout,field.plantForm],[paired.seed,paired.layout,paired.plantForm]);
      assert.equal(field.capture.boxHash,paired.capture.boxHash);
      assert.equal(field.capture.rayXYHash,paired.capture.rayXYHash);
      assert.equal(field.capture.weedReturns,0);
      assert.ok(paired.capture.weedReturns>0);
    }
    output={freezeHash:prior.freezeHash,clean,weedy,comparisons:comparisons(clean,weedy)};
  }
}
console.log(JSON.stringify({study,phase,domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,
  design,designHash,...output},null,2));
