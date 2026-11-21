// Does a fit find better locations if a grower visits the same number of pins?
// Reserve four new planting seeds and use the ordinary fit to set the visit count.
// A weed/crop label never enters the ordering or decides how many pins to keep.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {field} from '../../trainer/generator/field.js';
import {features,detectionStages,matchCenters,targetCenters,MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {scoreSavedWeights} from '../../trainer/models/network.js';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';
import {hash} from './tomato-cutoff-controls.mjs';

const seeds=[53114003,53238037,53362051,53486083];
const fitsFile=process.argv[2];
if (process.argv.length!==3) throw Error('Supply the frozen fit report from tomato-hard-negatives.mjs fit.');
const frozen=JSON.parse(await readFile(fitsFile,'utf8'));
assert.equal(frozen.study,'tomato-hard-negative-v1');
assert.equal(frozen.phase,'fit');
assert.equal(frozen.designHash,hash(frozen.design));
const excluded=new Set([...frozen.design.testSeeds,...frozen.design.trainingSeeds]);
for (const training of frozen.training) {
  for (const tile of training.manifest) excluded.add(tile.seed);
  for (const fit of training.fits) assert.equal(hash(fit.model),fit.weightHash);
  assert.deepEqual(training.fits.map(f=>f.sampling),['ordinary','half-hard','quarter-hard']);
}
assert.ok(seeds.every(seed=>!excluded.has(seed)));

const fields=[], totals=new Map();
const timingMs={generation:0,scoring:0};
const {minimumHeight,peakAveraging,featureMode}=frozen.design.settings;
function scorePins(method,ordered,budget,truth) {
  const pins=ordered.slice(0,budget);
  return {method,scores:MATCH_RADII_METERS.map(radius=>{
    const tp=matchCenters(pins,truth,radius).count;
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp};
  })};
}

for (const seed of seeds) for (const stage of ['seedling','branching']) {
  let truth;
  for (const layout of ['reference','os1-64']) for (const weeds of [false,true]) {
    const start=performance.now();
    const scan=field({...tomatoTestRecipe(seed,layout,stage,true),weeds});
    const centers=targetCenters(scan.labels.boxes);
    if (truth) assert.deepEqual(centers,truth);
    truth=centers;
    timingMs.generation+=performance.now()-start;
    const scoring=performance.now();
    const tile=features(scan,minimumHeight,peakAveraging,featureMode);
    const fits=[];
    for (const training of frozen.training) {
      const ordinary=training.fits[0].model;
      const heights=tile.pos.map((_,i)=>tile.X[ordinary.inputs*i]);
      const byHeight=detectionStages(tile,heights,0,ordinary.pinSeparation).selected;
      let requested;
      const lists=training.fits.map(({sampling,model})=>{
        const scores=scoreSavedWeights(tile.X,model,peakAveraging,featureMode);
        const all=detectionStages(tile,scores,0,model.pinSeparation).selected;
        if (sampling==='ordinary') {
          const atCutoff=detectionStages(tile,scores,model.threshold,model.pinSeparation).selected;
          requested=atCutoff.length;
          assert.deepEqual(all.slice(0,requested),atCutoff);
        }
        return {method:sampling,all};
      });
      lists.push({method:'height',all:byHeight});
      // Spacing can leave different numbers of viable final pins in each ranking.
      const budget=Math.min(requested,...lists.map(x=>x.all.length));
      const methods=lists.map(({method,all})=>scorePins(method,all,budget,truth));
      fits.push({trainingSeed:training.seed,requested,budget,methods});
      for (const {method,scores} of methods) {
        const key=[training.seed,stage,layout,weeds,method].join('/');
        if (!totals.has(key)) totals.set(key,{trainingSeed:training.seed,stage,layout,weeds,method,
          scores:scores.map(({cm})=>({cm,tp:0,fp:0,fn:0}))});
        scores.forEach(({tp,fp,fn},i)=>{
          const pooled=totals.get(key).scores[i];
          pooled.tp+=tp; pooled.fp+=fp; pooled.fn+=fn;
        });
      }
    }
    timingMs.scoring+=performance.now()-scoring;
    fields.push({seed,stage,layout,weeds,tileId:scan.labels.tile_id,plants:truth.length,fits});
  }
}
console.log(JSON.stringify({study:'tomato-hard-negative-ranking-v1',freezeHash:frozen.freezeHash,
  domain:'synthetic',backend:'CPU',seeds,timingMs,summary:[...totals.values()],fields},null,2));
