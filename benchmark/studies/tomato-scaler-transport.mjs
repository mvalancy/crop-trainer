// Freeze the scaler intervention before evaluating any of its separate plantings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {fileURLToPath} from 'node:url';
import {field} from '../../trainer/generator/field.js';
import {features,detectionStages,targetCenters} from '../../trainer/models/data.js';
import {initializeFit,scoreSavedWeights} from '../../trainer/models/network.js';
import {evaluatePins} from '../../trainer/field-test/references.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {hash} from './tomato-cutoff-controls.mjs';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';
import {poolScores} from './tomato-soil-controls.mjs';
import {prepareScalerCrossTraining} from './tomato-scaler-controls.mjs';

const design = {
  study:'tomato-scaler-transport-v1', trainingSeeds:[3301907,3413033,3524159],
  testSeeds:[58141019,58272013,58403041,58534057,58665079,58796093],
  rows:'mined', threshold:.65, scoreTolerance:2e-5,
  comparison:'Use native fit, unchanged coefficients with the other scaler, and transformed first-layer coefficients with the other scaler in both directions. Verify the same transformation before training.',
  capture:'Soil present; clean and weedy; seedlings and branching; grid and 64-ring; 60000 rays.',
  question:'With mined rows fixed, which cutoff crossings and final pins change from swapping a fitted scaler alone, and how do those agree with a full refit under that scale?'
};
export const sourceFreeze='896cd41880301f12a17903a70e11285628d1686d184f647814ac37c5593ef0fb';
const methods=['ordinary','ordinaryWeightsMinedScale','mined','minedWeightsOrdinaryScale'];

export function transport(model, scaling) {
  const {inputs,weights}=model;
  const next=Float32Array.from(weights);
  const firstWidth=model.hiddenLayers[0] ?? 1;
  for (let j=0; j<firstWidth; j++) {
    const offset=j*(inputs+1);
    let bias=weights[offset+inputs];
    for (let k=0; k<inputs; k++) {
      const slope=weights[offset+k]/model.scaling.std[k];
      next[offset+k]=slope*scaling.std[k];
      bias+=slope*(scaling.means[k]-model.scaling.means[k]);
    }
    next[offset+inputs]=bias;
  }
  return {...model,scaling,weights:Array.from(next)};
}

function pair(ordinary,mined) {
  return {
    ordinary, ordinaryWeightsMinedScale:{...ordinary,scaling:mined.scaling},
    mined, minedWeightsOrdinaryScale:{...mined,scaling:ordinary.scaling},
    equivalentOrdinary:transport(ordinary,mined.scaling), equivalentMined:transport(mined,ordinary.scaling)
  };
}

const emptyChange=()=>({count:0,totalAbs:0,max:0,up:0,down:0});
function recordChange(total,before,after) {
  assert.equal(before.length,after.length);
  for (let i=0;i<before.length;i++) {
    const a=before[i],b=after[i],abs=Math.abs(a-b);
    assert.ok(Number.isFinite(abs));
    total.count++;
    total.totalAbs+=abs;
    total.max=Math.max(total.max,abs);
    if (a<design.threshold && b>=design.threshold) total.up++;
    if (a>=design.threshold && b<design.threshold) total.down++;
  }
}

function readScores(raw,models,audit) {
  const outputs={};
  for (const [key,model] of Object.entries(models)) {
    outputs[key]=scoreSavedWeights(raw,model,model.peakAveraging,model.featureMode);
  }
  const comparisons={
    ordinaryToNaive:['ordinary','ordinaryWeightsMinedScale'],minedToNaive:['mined','minedWeightsOrdinaryScale'],
    ordinaryToRefit:['ordinary','mined'],ordinaryToEquivalent:['ordinary','equivalentOrdinary'],
    minedToEquivalent:['mined','equivalentMined']
  };
  for (const [key,[before,after]] of Object.entries(comparisons)) {
    audit[key] ??= emptyChange();
    recordChange(audit[key],outputs[before],outputs[after]);
  }
  // From one original above/below decision, did the swap and the refit cross on the same peaks?
  for (const [name,original,swapped,refit] of [
    ['ordinaryAgreement',outputs.ordinary,outputs.ordinaryWeightsMinedScale,outputs.mined],
    ['minedAgreement',outputs.mined,outputs.minedWeightsOrdinaryScale,outputs.ordinary]
  ]) {
    const agreement=audit[name] ??= {both:0,swapOnly:0,refitOnly:0,neither:0};
    for (let i=0;i<original.length;i++) {
      const wasKept=original[i]>=design.threshold;
      const swapChanged=(swapped[i]>=design.threshold)!==wasKept;
      const fitChanged=(refit[i]>=design.threshold)!==wasKept;
      if (swapChanged && fitChanged) agreement.both++;
      else if (swapChanged) agreement.swapOnly++;
      else if (fitChanged) agreement.refitOnly++;
      else agreement.neither++;
    }
  }
  for (const key of ['ordinaryToEquivalent','minedToEquivalent']) {
    assert.ok(audit[key].max<=design.scoreTolerance,'First-layer transport changed the raw predictor beyond tolerance');
  }
  return outputs;
}

function pinSet(tile,scores,model) {
  return detectionStages(tile,scores,model.threshold,model.pinSeparation).selected;
}
const toLocal=xy=>xy.map(([localX,localY])=>({localX,localY}));
const keyOf=([x,y])=>x+','+y;

async function run(frozen) {
  assert.equal(frozen.study,'tomato-training-scaler-cross-v1');
  assert.equal(frozen.phase,'fit');
  assert.equal(frozen.freezeHash,sourceFreeze,'Supply the published scaler-cross fit receipt.');
  assert.equal(frozen.designHash,hash(frozen.design));
  assert.deepEqual(frozen.training.map(t=>t.seed),design.trainingSeeds);
  assert.equal(frozen.design.settings.threshold,design.threshold);
  const training=[],fits=[],fields=[];
  const timingsMs={trainingRowRebuild:0,generation:0,scoring:0};
  const excluded=new Set([...frozen.design.trainingSeeds,...frozen.design.testSeeds]);
  for (const t of frozen.training) {
    for (const tile of t.manifest) excluded.add(tile.seed);
    const [ordinary,mined]=['ordinary','mined'].map(scaler=>{
      const fit=t.fits.find(f=>f.rows===design.rows && f.scaler===scaler);
      assert.equal(hash(fit.model),fit.weightHash);
      assert.deepEqual(fit.model.scaling,t.scalers[scaler]);
      return fit;
    });
    const rebuild=performance.now();
    const {raw,receipt}=await prepareScalerCrossTraining(t.seed);
    assert.deepEqual(receipt.rawHashes,t.rawHashes);
    assert.deepEqual(receipt.scalers,t.scalers);
    timingsMs.trainingRowRebuild+=performance.now()-rebuild;
    const dims=ordinary.model.inputs;
    const init=initializeFit(new Float32Array(dims),new Float32Array(1),{...frozen.design.settings,dims});
    const fromInit=fit=>({...fit.model,epochs:0,weights:Array.from(init.weights)});
    const start=pair(fromInit(ordinary),fromInit(mined)),end=pair(ordinary.model,mined.model);
    const audit={trainingInitial:{},trainingFitted:{},fieldInitial:{},fieldFitted:{}};
    for (const matrix of [raw.ordinary,raw.mined]) {
      readScores(matrix,start,audit.trainingInitial);
      readScores(matrix,end,audit.trainingFitted);
    }
    const entry={seed:t.seed,ordinaryModelHash:ordinary.weightHash,minedModelHash:mined.weightHash,
      sourceFitMs:{ordinary:ordinary.fitMs,mined:mined.fitMs},audit};
    training.push(entry);
    fits.push({entry,start,end});
  }
  assert.ok(design.testSeeds.every(seed=>!excluded.has(seed)));
  const {minimumHeight,peakAveraging,featureMode}=frozen.design.settings;
  for (const seed of design.testSeeds) for (const stage of ['seedling','branching']) {
    let planting;
    for (const layout of ['reference','os1-64']) for (const weeds of [false,true]) {
      const start=performance.now();
      const scan=field({...tomatoTestRecipe(seed,layout,stage,true),weeds});
      if (planting) assert.deepEqual(scan.labels.boxes,planting); else planting=scan.labels.boxes;
      timingsMs.generation+=performance.now()-start;
      const scoring=performance.now();
      const tile=features(scan,minimumHeight,peakAveraging,featureMode);
      const truth=toLocal(targetCenters(scan.labels.boxes)),tileId=scan.labels.tile_id;
      // Anchor shared candidate extraction, pin spacing, baseline and scoring to the actual Field Test.
      const anchor=runFieldTest({xyz:scan.xyz,model:fits[0].end.ordinary,tileId,
        labels:{text:JSON.stringify(scan.labels),filename:tileId+'.labels.json'}});
      const byFit=[];
      for (const {entry,start,end} of fits) {
        readScores(tile.X,start,entry.audit.fieldInitial);
        const outputs=readScores(tile.X,end,entry.audit.fieldFitted);
        const pins=Object.fromEntries(Object.keys(outputs).map(name=>[name,pinSet(tile,outputs[name],end[name])]));
        const scores=Object.fromEntries(methods.map(name=>[name,evaluatePins(toLocal(pins[name]),truth).scores]));
        for (const [source,equivalent] of [['ordinary','equivalentOrdinary'],['mined','equivalentMined']]) {
          assert.deepEqual(new Set(pins[source].map(keyOf)),new Set(pins[equivalent].map(keyOf)),
            'Transport changed selected coordinates after spacing');
        }
        if (!byFit.length) assert.deepEqual(scores.ordinary,anchor.evaluation.scores);
        byFit.push({trainingSeed:entry.seed,scores});
      }
      fields.push({seed,stage,layout,weeds,tileId,plants:truth.length,proposals:tile.pos.length,
        height:anchor.baselineEvaluation.scores,byFit});
      timingsMs.scoring+=performance.now()-scoring;
    }
  }
  const summary=[];
  for (const stage of ['seedling','branching']) for (const layout of ['reference','os1-64']) for (const weeds of [false,true]) {
    const group=fields.filter(f=>f.stage===stage && f.layout===layout && f.weeds===weeds);
    summary.push({stage,layout,weeds,height:poolScores(group,f=>f.height),byFit:design.trainingSeeds.map((seed,i)=>({
      trainingSeed:seed,scores:Object.fromEntries(methods.map(name=>[name,poolScores(group,f=>f.byFit[i].scores[name])]))}))});
  }
  return {sourceFreeze:frozen.freezeHash,training,timingsMs,summary,fields};
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const [phase,path]=process.argv.slice(2);
  assert.ok(phase==='plan' && !path || phase==='confirm' && path,'Use plan or confirm <scaler-cross-fit.json>');
  const output=phase==='plan' ? {} : await run(JSON.parse(await readFile(path,'utf8')));
  console.log(JSON.stringify({phase,domain:'synthetic',backend:'CPU',cpu:cpus()[0]?.model,node:process.version,
    design,designHash:hash(design),...output},null,2));
}
