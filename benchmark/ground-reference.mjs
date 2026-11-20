// Run with Node 22+ from the repository root: node benchmark/ground-reference.mjs
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {cropProfile} from '../trainer/crops.js';
import {buildDataset, MATCH_RADII_METERS} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {detectScan} from '../trainer/inference.js';
import {trainNetworkCPU} from '../trainer/neural.js';
import {evaluatePins} from '../trainer/references.js';

function changeElevation(xyz, offset, grade = 0) {
  const shifted = Float64Array.from(xyz);
  for (let i = 0; i < shifted.length; i += 3) {
    shifted[i + 2] += offset + grade * (shifted[i] - 5);
  }
  return shifted;
}

function summarize(scans) {
  const scores = MATCH_RADII_METERS.map((radius, i) => {
    let tp = 0, fp = 0, fn = 0;
    for (const scan of scans) {
      tp += scan.scores[i].tp;
      fp += scan.scores[i].fp;
      fn += scan.scores[i].fn;
    }
    return {cm:radius * 100, tp, fp, fn, f1:2 * tp / (2 * tp + fp + fn)};
  });
  const meanF1 = scores.reduce((sum, s) => sum + s.f1, 0) / scores.length;
  const countMAE = scans.reduce((sum, s) => sum + Math.abs(s.signedCountError), 0) / scans.length;
  return {meanF1, countMAE, scores};
}

for (const crop of ['lettuce', 'artichoke', 'tomato']) {
  const {peakHeight, pinSeparation} = cropProfile(crop);
  for (const seed of [7819, 18493]) {
    const start = performance.now();
    const settings = {seed, crop, trainFields:6, valFields:3, sensorMode:'mixed', minimumHeight:peakHeight};
    const set = await buildDataset(settings);
    const trainSeeds = new Set(set.stats.fieldSeeds.training);
    assert.ok(set.stats.fieldSeeds.validation.every(s => !trainSeeds.has(s)));
    const generated = performance.now();
    const fit = await trainNetworkCPU(set.X, set.Y, {dims:set.dims, epochs:40});
    const model = {
      format:'crop-trainer-weights-v1', featureSchema:'crop-peak-13-v1', inputs:set.dims, output:'sigmoid',
      crop, hiddenLayers:[4], activation:'tanh', weights:Array.from(fit.weights), scaling:set.scaling,
      minimumHeight:peakHeight, threshold:.5, pinSeparation
    };
    const fitted = performance.now();
    const results = {original:[], raised:[], corrected:[], grade:[], leveled:[]};
    let exactLeveledScans = 0;
    for (const tile of set.validation) {
      const {xyz} = field(tile.recipe);
      const references = tile.truth.map(([localX, localY]) => ({localX, localY}));
      const raised = changeElevation(xyz, .15);
      const original = detectScan(xyz, model);
      const corrected = detectScan(raised, model, {unit:'m', origin:[0, 0, .15]});
      // A constant datum correction must recover individual pins and scores on this control.
      assert.deepEqual(corrected.pins, original.pins);
      const ramp = changeElevation(xyz, 0, .05);
      // The added plane is 0.05 * (x - 5), so its elevation at x = 0 is -0.25 m.
      const leveled = detectScan(ramp, model, {unit:'m', origin:[0, 0, -.25], gradePercent:[5, 0]});
      if (isDeepStrictEqual(leveled.pins, original.pins)) exactLeveledScans++;
      const scans = {
        original, raised:detectScan(raised, model), corrected,
        grade:detectScan(ramp, model), leveled
      };
      for (const [name, scan] of Object.entries(scans)) results[name].push(evaluatePins(scan.pins, references));
    }
    console.log(JSON.stringify({
      ...settings, backend:'Node CPU', epochs:40, scans:set.validation.length,
      fieldSeeds:set.stats.fieldSeeds.validation, exactLeveledScans,
      results:Object.fromEntries(Object.entries(results).map(([name, scans]) => [name, summarize(scans)])),
      timingsMs:{generation:generated-start, training:fitted-generated, validation:performance.now()-fitted}
    }));
  }
}
