import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {featureProbe} from '../trainer/field-test/feature-probe.js';
import {runFieldTest} from '../trainer/field-test/score-scan.js';
import {field} from '../trainer/generator/field.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {makeRecipe} from '../trainer/models/data.js';

const weights = file => JSON.parse(readFileSync(new URL('../trainer/field-test/example/'+file,import.meta.url),'utf8'));

test('two saved fits show their actual inputs for the same peak on a weedy ring scan', () => {
  const recipe = {...makeRecipe(51112017,true,getSensor('os1-64'),'tomato',2,'seedling','healthy'),
    points:60000,weeds:true,sticks:false,boards:false,scanNoise:null};
  const {xyz} = field(recipe);
  const samples = [];
  for (const fit of ['random','hard']) {
    const model = weights('tomato-weed-'+fit+'.json');
    let sample;
    const args = {model,xyz,thresholdOverride:.95};
    const result = runFieldTest({...args,onFeatureProbe:item=>{sample=item;}});
    assert.deepEqual(result,runFieldTest(args));
    assert.equal(sample.count,434);
    assert.equal(sample.featureMode,'local-ground');
    assert.deepEqual(sample.means,model.scaling.means);
    assert.deepEqual(sample.divisors,model.scaling.std);
    assert.deepEqual(sample.inputs,sample.raw.map((v,i)=>Math.fround((v-model.scaling.means[i])/model.scaling.std[i])));
    assert.ok(Math.abs(sample.raw[0]-.094971776)<1e-7);
    samples.push(sample);
  }
  assert.deepEqual(samples[0].xy,samples[1].xy);
  assert.deepEqual(samples[0].raw,samples[1].raw);
  assert.ok(Math.abs(samples[0].inputs[0]+.4406357)<1e-6);
  assert.ok(Math.abs(samples[1].inputs[0]+.7627027)<1e-6);
  assert.notEqual(samples[0].score,samples[1].score);
});

test('no proposals clear the sample even with a valid old model and no survey', () => {
  let sample = 'stale';
  const result = runFieldTest({model:weights('weights.json'),xyz:new Float32Array([2,2,0]),
    onFeatureProbe:receipt=>{sample=receipt;}});
  assert.equal(result.proposalCount,0);
  assert.equal(sample,null);
});

test('center selection uses first extracted peak for a distance tie, independent of score', () => {
  const model = {inputs:1,scaling:{means:[0],std:[1]}};
  const X = new Float32Array([1,2,3]);
  const result = featureProbe({pos:[[0,0],[4,5],[6,5]],X},X,[.8,.1,.99],model,'absolute');
  assert.deepEqual(result.xy,[4,5]);
  assert.deepEqual(result.raw,[2]);
  assert.equal(result.score,.1);
});
