// Compare capped and full training sets on plantings reserved for this follow-up.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {fitPair, scoreFields, settings} from './tomato-soil-controls.mjs';

const trainSeed = 883711;
const plantingSeeds = [38105053, 38235047, 38365091, 38495087];
const fits = [];
for (const cap of [600, 1200, 48000]) {
  const pair = await fitPair(trainSeed, cap);
  assert.equal(pair[0].samples, pair[1].samples);
  for (const fit of pair) {
    if (fits.length) assert.deepEqual(fit.manifest, fits[0].manifest, 'The candidate scans must match across caps.');
    fits.push(fit);
  }
}
// When all eligible positive rows fit, changing their sampling policy should have no effect.
const [ordinary, balanced] = fits.slice(-2);
assert.equal(ordinary.samples / 2, ordinary.strata.reduce((sum, g) => sum + g.available, 0));
assert.deepEqual(ordinary.model.weights, balanced.model.weights);
assert.deepEqual(ordinary.model.scaling, balanced.model.scaling);
const result = scoreFields(fits, plantingSeeds);
console.log(JSON.stringify({
  domain:'synthetic', backend:'CPU', node:process.version, cpu:cpus()[0]?.model, settings, trainSeed, plantingSeeds,
  fits:fits.map(({model, ...metadata}) => metadata), ...result
}, null, 2));
