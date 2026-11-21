import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {field} from '../trainer/generator/field.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {buildDataset, features, makeRecipe, rescanValidation} from '../trainer/models/data.js';

const dims = 13;
function centeredRow(xyz, x = 5.025, y = 5.025) {
  const {X, pos} = features({xyz}, .035, 'occupied', 'local-ground');
  const i = pos.findIndex(([px, py]) => Math.hypot(px - x, py - y) < .04);
  assert.notEqual(i, -1, 'test field produced a candidate at the intended center');
  return X.slice(i * dims, (i + 1) * dims);
}
function near(observed, expected) {
  assert.ok(Math.abs(observed - expected) < 1e-6, `expected ${observed} to be near ${expected}`);
}

test('relative slots use occupied-cell minima, nearest-rank quantiles and a signed height difference', () => {
  const scan = [5.025, 5.025, .5];
  const ring = [[3,0,-.3], [-3,0,-.02], [0,3,.01], [0,-3,.02], [6,0,.03],
    [-6,0,.04], [0,6,.05], [0,-6,.06], [3,3,.08], [-3,-3,.24]];
  for (const [dx,dy,z] of ring) scan.push(5.025 + dx * .05, 5.025 + dy * .05, z);
  // Duplicate observations of a high surface in a measured cell do not vote as separate sites.
  for (let i = 0; i < 25; i++) scan.push(5.025 - .15, 5.025, .34);
  // Inner and far cells do not change the local reference.
  scan.push(5.125, 5.025, -.9, 5.375, 5.025, -.8);

  const row = centeredRow(scan);
  near(row[1], .52);
  near(row[12], .08);
  const shifted = centeredRow(scan.map((v, i) => i % 3 === 2 ? v + .125 : v));
  near(shifted[1], row[1]);
  near(shifted[12], row[12]);
  near(shifted[0] - row[0], .125);
  // Both sides still produce candidates when the low neighboring surface sits above this peak.
  const hollow = centeredRow([5.025,5.025,.5, 5.225,5.025,.6, 4.825,5.025,.6, 5.025,5.225,.6]);
  near(hollow[1], -.1);
});

test('unvisited annular cells stay missing and an annulus cannot wrap around a plot edge', () => {
  const xyz = [.075, 5.025, .4, .275, 5.025, .10, .075, 5.225, .25,
    9.975, 4.975, .03, 9.925, 5.025, .07];
  const row = centeredRow(xyz, .075, 5.025);
  assert.equal(row[1], 0);
  assert.equal(row[12], 0);
  const withZeroGround = centeredRow([...xyz, .075, 4.825, 0], .075, 5.025);
  near(withZeroGround[1], .4);
  near(withZeroGround[12], .25);
});

test('legacy bytes, peak coordinates and eleven shared features survive either averaging rule', () => {
  const recipe = {...makeRecipe(33127, true, getSensor('os1-64'), 'tomato', 3, 'seedling'), points:12000};
  const scan = field(recipe);
  assert.equal(scan.labels.tile_id, '955712e41adf6a35');
  const before = {
    'zero-filled':'41d3bb797e4661928de3ccd9c6d2158ade12de0d8e6444b70fc6509f60ea6cee',
    occupied:'b93828110354bfafc9c2f1a6260a650605788a55cbeed8ca95bdc7eccbaab019'
  };
  for (const [averaging, digest] of Object.entries(before)) {
    const stock = features(scan, .035, averaging);
    assert.equal(createHash('sha256').update(new Uint8Array(stock.X.buffer))
      .update(JSON.stringify(stock.pos)).digest('hex'), digest);
    assert.deepEqual(features(scan, .035, averaging, 'absolute'), stock);
    const trial = features({xyz:scan.xyz}, .035, averaging, 'local-ground');
    assert.deepEqual(trial.pos, stock.pos);
    assert.equal(trial.X.length, stock.X.length);
    for (let i = 0; i < trial.X.length; i++) {
      if (i % dims !== 1 && i % dims !== 12) assert.equal(trial.X[i], stock.X[i]);
    }
  }
});

test('fitted scaling and replay keep the chosen features on the same fields and selected rows', async () => {
  const settings = {seed:321781, trainFields:2, valFields:1, sampleLimit:24,
    peakAveraging:'occupied', trainingRayBudget:12000, validationRayBudget:12000};
  for (const featureMode of ['guess', null]) {
    assert.throws(() => features({xyz:[]}, .035, 'occupied', featureMode), /feature mode/);
    await assert.rejects(buildDataset({...settings,featureMode,generate:() => assert.fail('unexpected scan')}), /feature mode/);
  }
  const original = await buildDataset(settings);
  assert.ok(!Object.hasOwn(original.stats, 'featureMode'));
  assert.deepEqual(await buildDataset({...settings,featureMode:'absolute'}), original);
  const fitted = await buildDataset({...settings,featureMode:'local-ground'});
  assert.deepEqual(fitted.manifest, original.manifest);
  assert.deepEqual(fitted.stats.trainingExamplesByField, original.stats.trainingExamplesByField);
  assert.deepEqual(fitted.Y, original.Y);
  assert.deepEqual(fitted.validation.map(t => t.pos), original.validation.map(t => t.pos));
  assert.notDeepEqual(fitted.scaling.means, original.scaling.means);

  const rescanned = await rescanValidation(fitted,'os1-64');
  for (const dataset of [fitted, rescanned]) {
    assert.equal(dataset.stats.featureMode,'local-ground');
    for (const tile of dataset.validation) {
      const {X,pos} = features(field(tile.recipe), settings.minimumHeight, settings.peakAveraging, 'local-ground');
      const expected = Float32Array.from(X,(v,i) => (v - fitted.scaling.means[i % dims]) / fitted.scaling.std[i % dims]);
      assert.deepEqual(tile.X, expected);
      assert.deepEqual(tile.pos, pos);
    }
  }
});
