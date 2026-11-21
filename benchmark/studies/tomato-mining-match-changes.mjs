// Which reference centers change when a grower switches between the two frozen fits?
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {field} from '../../trainer/generator/field.js';
import {MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';
import {hash} from './tomato-cutoff-controls.mjs';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';

assert.equal(process.argv.length,4,'Supply the original hard-negative fit.json and confirm.json.');
const [fit,confirm]=await Promise.all(process.argv.slice(2).map(async path=>JSON.parse(await readFile(path,'utf8'))));
assert.equal(fit.study,'tomato-hard-negative-v1');
assert.equal(fit.phase,'fit');
assert.equal(confirm.study,fit.study);
assert.equal(confirm.phase,'confirm');
assert.equal(confirm.freezeHash,fit.freezeHash);
assert.deepEqual(confirm.design,fit.design);
assert.equal(hash(fit.design),fit.designHash);
assert.equal(confirm.designHash,fit.designHash);
assert.deepEqual(fit.training.map(t=>t.seed),fit.design.trainingSeeds);

const fields=[],pooled=new Map(),timingsMs={generation:0,scoring:0};
for (const condition of ['clean','weedy']) {
  const weeds=condition==='weedy';
  const expected=confirm[condition].fields;
  assert.equal(expected.length,fit.design.testSeeds.length*4);
  for (const seed of fit.design.testSeeds) for (const plantForm of ['seedling','branching']) {
    for (const layout of ['reference','os1-64']) {
      const original=expected.find(f=>f.seed===seed && f.plantForm===plantForm && f.layout===layout);
      const generateStart=performance.now();
      const scan=field({...tomatoTestRecipe(seed,layout,plantForm,true),weeds});
      timingsMs.generation+=performance.now()-generateStart;
      const tileId=scan.labels.tile_id;
      assert.equal(tileId,original.tileId);
      assert.equal(hash(scan.labels.boxes),original.capture.boxHash);
      const labels={filename:tileId+'.labels.json',text:JSON.stringify(scan.labels)};
      const comparisons=[];
      for (const training of fit.training) {
        const [ordinary,hard]=['ordinary','half-hard'].map(sampling=>{
          const fitted=training.fits.find(f=>f.sampling===sampling);
          assert.equal(hash(fitted.model),fitted.weightHash);
          assert.equal(fitted.model.threshold,.65);
          const start=performance.now();
          const result=runFieldTest({model:fitted.model,xyz:scan.xyz,labels,tileId});
          timingsMs.scoring+=performance.now()-start;
          const published=original.models.find(m=>m.seed===training.seed && m.sampling===sampling);
          assert.deepEqual(result.evaluation.scores,published.scores);
          return result;
        });
        assert.deepEqual(ordinary.references,hard.references);
        const byTolerance=MATCH_RADII_METERS.map(radius=>{
          const cm=100*radius,first=ordinary.evaluation.pinByReferenceAtCm[cm],second=hard.evaluation.pinByReferenceAtCm[cm];
          const lostIndices=[],gainedIndices=[];
          let both=0,neither=0;
          for (let i=0;i<ordinary.references.length;i++) {
            if (first[i]>=0 && second[i]>=0) both++;
            else if (first[i]>=0) lostIndices.push(i);
            else if (second[i]>=0) gainedIndices.push(i);
            else neither++;
          }
          const gained=gainedIndices.length,lost=lostIndices.length;
          assert.equal(both+lost,ordinary.evaluation.scores.find(s=>s.cm===cm).tp);
          assert.equal(both+gained,hard.evaluation.scores.find(s=>s.cm===cm).tp);
          assert.equal(both+gained+lost+neither,original.targets);
          const key=[condition,plantForm,layout,training.seed,cm].join('/');
          if (!pooled.has(key)) pooled.set(key,{condition,plantForm,layout,trainingSeed:training.seed,cm,targets:0,both:0,gained:0,lost:0,neither:0});
          const totals=pooled.get(key);
          totals.targets+=original.targets;
          totals.both+=both; totals.gained+=gained; totals.lost+=lost; totals.neither+=neither;
          return {cm,both,gained,lost,neither,gainedIndices,lostIndices};
        });
        comparisons.push({trainingSeed:training.seed,byTolerance});
      }
      fields.push({condition,seed,plantForm,layout,tileId,targets:original.targets,comparisons});
    }
  }
}
console.log(JSON.stringify({study:'tomato-mining-match-changes-v1',domain:'synthetic',freezeHash:fit.freezeHash,
  comparison:'Ordinary to half-hard, both at 0.65. Zero-based reference indices follow the ordered boxes for each tile ID.',
  timingsMs,pooled:[...pooled.values()],fields},null,2));
