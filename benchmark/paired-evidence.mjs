// Reproduce the synthetic evidence in docs/evidence.md with Node.js 22+.
import assert from 'node:assert/strict';
import {buildDataset, validateModel} from '../trainer/data.js';
import {cropProfile} from '../trainer/crops.js';
import {trainCPU, predict} from '../trainer/model.js';
import {trainNetworkCPU, predictNetwork} from '../trainer/neural.js';

const seeds = [40217, 41371, 49727];
const layouts = ['reference', 'os1-64'];
const fits = {epochs: 40, lr: .25};
const names = ['peaks', 'height', 'logistic', 'neural'];
const elapsedMs = {generation: 0, fitting: 0, validation: 0};

async function timed(phase, operation) {
  const start = performance.now();
  const value = await operation();
  elapsedMs[phase] += performance.now() - start;
  return value;
}

function generate(settings) {
  return timed('generation', () => buildDataset(settings));
}

function evaluate(set, options) {
  return timed('validation', () => validateModel(set, null, options));
}

function geometricControl(set) {
  // Standardization preserves order. Rank by height and keep every proposed peak
  // above the generator’s minimum height, then apply the ordinary spacing rule.
  return {threshold: 0, predictScores: rows => {
    const heights = heightColumn(rows, set.dims);
    return heights.map(z => z * set.scaling.std[0] + set.scaling.means[0]);
  }};
}

async function fitNeural(set) {
  const {weights} = await timed('fitting', () => trainNetworkCPU(set.X, set.Y, {...fits, dims: set.dims}));
  return {predictScores: rows => predictNetwork(rows, weights, set.dims)};
}

function heightColumn(rows, dims) {
  return Float32Array.from({length: rows.length / dims}, (_, i) => rows[i * dims]);
}

async function fitContenders(set) {
  const heightFit = await timed('fitting', () => trainCPU(heightColumn(set.X, set.dims), set.Y, {...fits, dims: 1}));
  const linear = await timed('fitting', () => trainCPU(set.X, set.Y, {...fits, dims: set.dims}));
  return {
    peaks: geometricControl(set),
    height: {predictScores: x => predict(heightColumn(x, set.dims), heightFit.weights, 1)},
    logistic: {predictScores: x => predict(x, linear.weights, set.dims)},
    neural: await fitNeural(set)
  };
}

function summarize(tiles) {
  const scores = [0, 1, 2].map(i => {
    const totals = {tp: 0, fp: 0, fn: 0};
    for (const tile of tiles) {
      for (const key of Object.keys(totals)) totals[key] += tile.byTolerance[i][key];
    }
    const {tp, fp, fn} = totals;
    return {
      cm: tiles[0].byTolerance[i].cm, ...totals,
      f1: 2 * tp / (2 * tp + fp + fn || 1),
      recall: tp / (tp + fn || 1), precision: tp / (tp + fp || 1)
    };
  });
  const countMAE = tiles.reduce((sum, t) => sum + Math.abs(t.byTolerance[0].fp - t.byTolerance[0].fn), 0) / tiles.length;
  const reachable = tiles.reduce((sum, t) => sum + t.stages15cm[0].matched, 0);
  return {meanF1: scores.reduce((sum, s) => sum + s.f1, 0) / scores.length, scores, countMAE,
    proposalRecall15: reachable / (scores[2].tp + scores[2].fn)};
}

for (const crop of ['lettuce', 'artichoke', 'tomato']) {
  const cells = Object.fromEntries(layouts.map(layout => [layout,
    Object.fromEntries(names.map(name => [name, []]))]));
  for (const seed of seeds) {
    const settings = {
      seed, crop, trainFields: 8, valFields: 8, sensorMode: 'reference',
      trainingRayBudget: 30000, validationRayBudget: 30000, minimumHeight: cropProfile(crop).peakHeight
    };
    const reference = await generate(settings);
    const ring = await generate({...settings, validationSensorMode: 'os1-64'});
    assert.deepEqual(reference.X, ring.X);
    assert.deepEqual(reference.Y, ring.Y);
    assert.deepEqual(reference.scaling, ring.scaling);
    const fieldLabels = tile => [tile.seed, tile.ground, tile.truth];
    assert.deepEqual(reference.validation.map(fieldLabels), ring.validation.map(fieldLabels));
    const trainingSeeds = new Set(reference.stats.fieldSeeds.training);
    assert.ok(reference.stats.fieldSeeds.validation.every(s => !trainingSeeds.has(s)));
    const contenders = await fitContenders(reference);
    for (const [layout, set] of [['reference', reference], ['os1-64', ring]]) {
      for (const [name, options] of Object.entries(contenders)) {
        const result = await evaluate(set, options);
        cells[layout][name].push(...result.tiles);
      }
    }
  }
  for (const layout of layouts) {
    const rows = cells[layout];
    const byPlanting = new Map();
    for (const name of names) {
      const groups = Map.groupBy(rows[name], t => t.seed);
      assert.equal(groups.size, seeds.length * 8);
      assert.ok([...groups.values()].every(pair => pair.length === 2 && pair[0].ground !== pair[1].ground));
      byPlanting.set(name, new Map([...groups].map(([seed, tiles]) => [seed, summarize(tiles).meanF1])));
    }
    const pairedDelta = [...byPlanting.get('neural')].map(([seed, f1]) => f1 - byPlanting.get('peaks').get(seed));
    console.log(JSON.stringify({
      crop, layout, plantings: pairedDelta.length, neuralBeatsPeaks: pairedDelta.filter(delta => delta > 0).length,
      methods: Object.fromEntries(names.map(name => [name, summarize(rows[name])]))
    }));
  }
}

// Follow up on the shifted tomato result using entirely new dataset seeds.
// Select a score cutoff on four target-layout plantings, then freeze it.
const tomatoRows = {peaks: [], default: [], calibrated: []};
const selected = [];
for (const seed of [70271, 71549, 73403]) {
  const set = await generate({
    crop: 'tomato', seed, trainFields: 8, valFields: 12, sensorMode: 'reference', validationSensorMode: 'os1-64',
    trainingRayBudget: 30000, validationRayBudget: 30000, minimumHeight: cropProfile('tomato').peakHeight
  });
  const calibration = {...set, validation: set.validation.slice(0, 8)};
  const heldOut = {...set, validation: set.validation.slice(8)};
  const reserved = new Set([...set.stats.fieldSeeds.training, ...calibration.validation.map(t => t.seed)]);
  assert.ok(heldOut.validation.every(t => !reserved.has(t.seed)));
  const peaks = geometricControl(set);
  const neural = await fitNeural(set);
  let chosen = .5, best = -1;
  // Prefer the value nearest the default when calibration scores tie.
  for (const threshold of [.5, .4, .6, .3, .7, .2, .8, .1, .9]) {
    const result = await evaluate(calibration, {...neural, threshold});
    if (result.meanF1 > best) {
      best = result.meanF1;
      chosen = threshold;
    }
  }
  selected.push({seed, cutoff: chosen});
  const contenders = {peaks, default: neural, calibrated: {...neural, threshold: chosen}};
  for (const [name, options] of Object.entries(contenders)) {
    const result = await evaluate(heldOut, options);
    tomatoRows[name].push(...result.tiles);
  }
}
console.log(JSON.stringify({
  crop: 'tomato', layout: 'os1-64', experiment: 'calibration', selected,
  methods: Object.fromEntries(Object.entries(tomatoRows).map(([name, tiles]) => [name, summarize(tiles)]))
}));
console.log(JSON.stringify({backend: 'Node CPU', node: process.version, elapsedMs}));
