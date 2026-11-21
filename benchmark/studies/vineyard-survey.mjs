// Apply the original Portuguese vine model and column rules using metric
// survey grid squares. Local-frame captures supply a separate XY translation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {matchCenters, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {locateVinePlot, columnSettings} from './vineyard-columns.mjs';
import {fitVineGround, readPlotColumns} from './vineyard-las.mjs';

export function readSurveyedTrunks(shape, expectedType) {
  assert.equal(shape.readInt32LE(32), expectedType);
  const references = [];
  for (let offset = 100; offset < shape.length;) {
    const bytes = 2*shape.readInt32BE(offset + 4);
    assert.ok(bytes >= 20 && offset + 8 + bytes <= shape.length);
    assert.equal(shape.readInt32LE(offset + 8), expectedType);
    references.push([shape.readDoubleLE(offset + 12), shape.readDoubleLE(offset + 20)]);
    offset += 8 + bytes;
  }
  return references;
}

export async function compareVineSurvey(las, weightsPath, references, {translation = [0, 0], equalPinCheck = false} = {}) {
  const weights = JSON.parse(await readFile(weightsPath, 'utf8'));
  const modelSha256 = createHash('sha256').update(JSON.stringify(weights)).digest('hex');
  // Historical exports lack some descriptive fields. Compare only the model
  // fields used for inference and retain the complete file fingerprint for audit.
  const modelFields = ['format','crop','inputs','featureSchema','peakAveraging','featureMode',
    'hiddenLayers','activation','output','minimumHeight','threshold','pinSeparation','scaling','weights'];
  const inferenceSha256 = createHash('sha256').update(JSON.stringify(
    Object.fromEntries(modelFields.map(key => [key, weights[key]])),
  )).digest('hex');
  assert.equal(inferenceSha256, '763ff22003275d890ec1692aea67bd2642b3ba87055bfc5631b26c3e38842082',
    'Use the frozen CPU model from the vineyard low-return replay.');

  const tiles = new Map();
  const tileForReference = [];
  for (const [x,y] of references) {
    const origin = [x, y].map(value => Math.floor(value / 10) * 10);
    const key = origin.join(',');
    if (!tiles.has(key)) tiles.set(key, {origin, referenceCount: 0});
    tiles.get(key).referenceCount++;
    tileForReference.push(key);
  }

  const bandMasks = new Map();
  const returnMasks = new Map();
  const predictions = {nativeModel: [], groundFootprint: [], vertical: []};
  const equalPredictions = {nativeModel: [], groundFootprint: [], vertical: []};
  const plots = [];
  const started = performance.now();
  let scorableReferences = 0;
  for (const {origin, referenceCount} of tiles.values()) {
    const sourceOrigin = origin.map((value, i) => value - translation[i]);
    const low = new Float64Array(200 * 200).fill(Infinity);
    const counts = await readPlotColumns(las, sourceOrigin, (_x, _y, z, cell) => {
      low[cell] = Math.min(low[cell], z);
    });
    returnMasks.set(origin.join(','), Uint8Array.from(low, Number.isFinite));
    const plane = fitVineGround(low);
    const plot = {origin, referenceCount, points: counts.inPlot};
    plots.push(plot);
    if (!plane) {
      plot.reason = 'Insufficient ground-plane support';
      continue;
    }
    const {z0, b, c, groundSamples} = plane;
    const frame = {unit: 'm', origin: [...sourceOrigin, z0], gradePercent: [100*b, 100*c]};
    const located = await locateVinePlot(las, frame, weights);
    bandMasks.set(origin.join(','), located.bandMask);
    scorableReferences += referenceCount;
    Object.assign(plot, {groundSamples, frame, occupiedXY: located.occupiedXY,
      bandColumns: located.bandColumns, pinsByMethod: {}});
    const limit = Math.min(...Object.keys(predictions).map(name => located.predictions[name].length));
    for (const [name, combined] of Object.entries(predictions)) {
      const pins = located.predictions[name];
      plot.pinsByMethod[name] = pins.length;
      for (const [index, {localX, localY}] of pins.entries()) {
        const pin = [localX + origin[0], localY + origin[1]];
        combined.push(pin);
        if (equalPinCheck && index < limit) equalPredictions[name].push(pin);
      }
    }
  }

  // The complete annotated records are the denominator, including any plot
  // where a ground estimate failed. A pin may match across a plot boundary.
  function compare(dx, dy, methods = predictions) {
    const shifted = references.map(([x, y]) => [x + dx, y + dy]);
    return Object.fromEntries(Object.entries(methods).map(([name, pins]) => [
      name, {pins: pins.length, matches: MATCH_RADII_METERS.map(
        radius => matchCenters(pins, shifted, radius).count,
      )},
    ]));
  }
  // Availability at a survey record is computed after prediction. Footprint
  // and model placement never see the records or select candidates from them.
  function nearColumn([x, y], masks) {
    const size = columnSettings.cellWidth;
    const cellsPerTile = 200;
    const ix = Math.floor(x / size), iy = Math.floor(y / size);
    for (let row = iy - 3; row <= iy + 3; row++) {
      for (let col = ix - 3; col <= ix + 3; col++) {
        if (Math.hypot((col + .5)*size - x, (row + .5)*size - y) > .15) continue;
        const key = [Math.floor(col / cellsPerTile)*10, Math.floor(row / cellsPerTile)*10].join(',');
        const mask = masks.get(key);
        if (mask?.[(row % cellsPerTile)*cellsPerTile + col % cellsPerTile]) return true;
      }
    }
    return false;
  }
  const recordsWithBandColumn15cm = references.filter(p => nearColumn(p, bandMasks)).length;

  const tileByKey = new Map(plots.map(plot => [plot.origin.join(','), plot]));
  for (const plot of plots) plot.recordMatches15cm = {};
  for (const [name, pins] of Object.entries(predictions)) {
    for (const plot of plots) plot.recordMatches15cm[name] = 0;
    const {pinByBox} = matchCenters(pins, references, .15);
    for (let i = 0; i < pinByBox.length; i++) {
      if (pinByBox[i] >= 0) tileByKey.get(tileForReference[i]).recordMatches15cm[name]++;
    }
  }

  const shifts = [[0, 0], [.25, 0], [-.25, 0], [0, .25], [0, -.25]];
  return {
    modelSha256, inferenceSha256, settings: columnSettings,
    recordsWithAnyColumn15cm: references.filter(p => nearColumn(p, returnMasks)).length,
    referenceRecords: references.length, tiles: tiles.size, scorableReferences, recordsWithBandColumn15cm, plots,
    toleranceCm: MATCH_RADII_METERS.map(r => 100 * r),
    ...(equalPinCheck ? {equalPerTilePinCounts: compare(0, 0, equalPredictions)} : {}),
    shifts: shifts.map(([dx, dy]) => ({surveyShiftM: [dx, dy], methods: compare(dx, dy)})),
    elapsedSeconds: (performance.now()-started)/1000,
  };
}
