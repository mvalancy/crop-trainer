// Frozen transfer check on RTK-surveyed vines in northern Spain.
// Supply the original B7 red LAS, or the B7 30 m L1 LAZ decompressed to LAS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {open, readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {matchCenters, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {locateVinePlot, columnSettings} from './vineyard-columns.mjs';
import {fitVineGround, readPlotColumns} from './vineyard-las.mjs';

const [las, shapePath, weightsPath] = process.argv.slice(2);
if (!las || !shapePath || !weightsPath || process.argv.length !== 5) {
  throw Error('Usage: node benchmark/studies/vineyard-b7.mjs B7-scan.las trunk_locations_VineyardB7.shp vineyard-weights.json');
}
const shape = await readFile(shapePath);
assert.equal(createHash('sha256').update(shape).digest('hex'), '5969e2065b3dfe8a829e088698d3e18ceaa6b08d6cc746ed2c40f27edc9d1e63',
  'Use the B7 trunk shapefile from Zenodo 10362568.');
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

const handle = await open(las, 'r');
const header = Buffer.alloc(227);
try {
  await handle.read(header, 0, header.length, 0);
} finally {
  await handle.close();
}
const sources = new Map([
  [6479816, {sensor: 'Red-band photogrammetry', deposit: 'https://doi.org/10.5281/zenodo.10362568'}],
  [47893588, {sensor: 'DJI Zenmuse L1', deposit: 'https://doi.org/10.5281/zenodo.8113105'}],
]);
const sourcePoints = header.readUInt32LE(107);
const capture = sources.get(sourcePoints);
if (header.toString('ascii', 0, 4) !== 'LASF' || header[104] > 5 || !capture) {
  throw Error('Expected the July 14 B7 red LAS or the original 30 m L1 flight decompressed to legacy LAS.');
}

const tiles = new Map();
const references = [];
const tileForReference = [];
for (let offset = 100; offset < shape.length; offset += 28) {
  assert.equal(shape.readInt32BE(offset + 4), 10);
  assert.equal(shape.readInt32LE(offset + 8), 1);
  const x = shape.readDoubleLE(offset + 12), y = shape.readDoubleLE(offset + 20);
  references.push([x, y]);
  const origin = [x, y].map(value => Math.floor(value / 10) * 10);
  const key = origin.join(',');
  if (!tiles.has(key)) tiles.set(key, {origin, referenceCount: 0});
  tiles.get(key).referenceCount++;
  tileForReference.push(key);
}

const bandMasks = new Map();
const predictions = {nativeModel: [], groundFootprint: [], vertical: []};
const plots = [];
const started = performance.now();
let scorableReferences = 0;
for (const {origin, referenceCount} of tiles.values()) {
  const low = new Float64Array(200 * 200).fill(Infinity);
  const counts = await readPlotColumns(las, origin, (_x, _y, z, cell) => {
    low[cell] = Math.min(low[cell], z);
  });
  const plane = fitVineGround(low);
  const plot = {origin, referenceCount, points: counts.inPlot};
  plots.push(plot);
  if (!plane) {
    plot.reason = 'Insufficient ground-plane support';
    continue;
  }
  const {z0, b, c, groundSamples} = plane;
  const frame = {unit: 'm', origin: [...origin, z0], gradePercent: [100*b, 100*c]};
  const located = await locateVinePlot(las, frame, weights);
  bandMasks.set(origin.join(','), located.bandMask);
  scorableReferences += referenceCount;
  Object.assign(plot, {groundSamples, frame, occupiedXY: located.occupiedXY,
    bandColumns: located.bandColumns, pinsByMethod: {}});
  for (const [name, combined] of Object.entries(predictions)) {
    const pins = located.predictions[name];
    plot.pinsByMethod[name] = pins.length;
    for (const {localX, localY} of pins) combined.push([localX + origin[0], localY + origin[1]]);
  }
}

// The complete annotated records are the denominator, including any plot
// where a ground estimate failed. A pin may match across a plot boundary.
function compare(dx, dy) {
  const shifted = references.map(([x, y]) => [x + dx, y + dy]);
  return Object.fromEntries(Object.entries(predictions).map(([name, pins]) => [
    name, {pins: pins.length, matches: MATCH_RADII_METERS.map(
      radius => matchCenters(pins, shifted, radius).count,
    )},
  ]));
}
// Availability at a survey record is computed after prediction. Footprint
// and model placement never see the records or select candidates from them.
function nearBandColumn([x, y]) {
  const size = columnSettings.cellWidth;
  const cellsPerTile = 200;
  const ix = Math.floor(x / size), iy = Math.floor(y / size);
  for (let row = iy - 3; row <= iy + 3; row++) {
    for (let col = ix - 3; col <= ix + 3; col++) {
      if (Math.hypot((col + .5)*size - x, (row + .5)*size - y) > .15) continue;
      const key = [Math.floor(col / cellsPerTile)*10, Math.floor(row / cellsPerTile)*10].join(',');
      const mask = bandMasks.get(key);
      if (mask?.[(row % cellsPerTile)*cellsPerTile + col % cellsPerTile]) return true;
    }
  }
  return false;
}
const recordsWithBandColumn15cm = references.filter(nearBandColumn).length;

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
console.log(JSON.stringify({
  site: 'B7, Tomiño, Spain', survey: 'https://doi.org/10.5281/zenodo.10362568',
  file: basename(las), ...capture, sourcePoints, modelSha256, inferenceSha256, settings: columnSettings,
  referenceRecords: references.length, tiles: tiles.size, scorableReferences, recordsWithBandColumn15cm, plots,
  toleranceCm: MATCH_RADII_METERS.map(r => 100 * r),
  shifts: shifts.map(([dx, dy]) => ({surveyShiftM: [dx, dy], methods: compare(dx, dy)})),
  elapsedSeconds: (performance.now()-started)/1000,
}, null, 2));
