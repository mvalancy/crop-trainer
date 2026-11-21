// Offline replay on the original, locally extracted LFuji-air AllTrees_pcloud directory.
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {detectOrchardBases, DEFAULT_ORCHARD_SPACING, ORCHARD_SPACINGS} from '../trainer/models/orchard.js';

const directory = process.argv[2];
const compareSides = process.argv[3] === '--compare-sides';
const westGround = compareSides && process.argv[4] === '--west-ground';
if (!directory || process.argv.length !== 3 + Number(compareSides) + Number(westGround)) {
  throw Error('Usage: node cli/fuji-repeatability.mjs /path/to/AllTrees_pcloud [--compare-sides [--west-ground]]');
}

// Both protocols use the 1.8 m scanner. The east, fan-off scan always sets the horizontal frame.
const pairedPass = compareSides ? 'n_W' : 'af_E';
const trials = compareSides
  ? ['support', 'low-wood'].map(ranking => ({ranking, spacingMeters: DEFAULT_ORCHARD_SPACING}))
  : ORCHARD_SPACINGS.map(spacingMeters => ({spacingMeters}));
const countA = compareSides ? 'eastPins' : 'fanOffPins';
const countB = compareSides ? 'westPins' : 'fanOnPins';

// This archive uses regular MATLAB v5 tags, each padded to eight bytes within the matrix.
function element(buffer, offset, type) {
  if (offset + 8 > buffer.length || buffer.readUInt32LE(offset) !== type) {
    throw Error('Expected the original LFuji-air MATLAB v5 data layout.');
  }
  const size = buffer.readUInt32LE(offset + 4);
  if (size > buffer.length - offset - 8) throw Error('Incomplete MATLAB data element.');
  return {bytes: buffer.subarray(offset + 8, offset + 8 + size), next: offset + 8 + Math.ceil(size / 8) * 8};
}

async function scan(tree, pass) {
  const filename = 'Tree' + String(tree).padStart(2, '0') + '_H1_' + pass + '.mat';
  const file = await open(join(directory, filename));
  let mat;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw Error('Unexpected MAT file size: ' + filename);
    mat = await file.readFile();
  } finally {
    await file.close();
  }
  if (mat.length < 136 || mat.toString('ascii', 126, 128) !== 'IM' || mat.readUInt16LE(124) !== 256) {
    throw Error('Expected a little-endian MATLAB v5 file: ' + filename);
  }
  const compressed = element(mat, 128, 15);
  const block = inflateSync(compressed.bytes, {maxOutputLength: 32 * 1024 * 1024});
  const matrix = element(block, 0, 14).bytes;
  const flags = element(matrix, 0, 6);
  const dimensions = element(matrix, flags.next, 5);
  const name = element(matrix, dimensions.next, 1);
  const values = element(matrix, name.next, 9).bytes;
  const rows = dimensions.bytes.readInt32LE(0);
  if (flags.bytes.readUInt32LE(0) !== 6 || dimensions.bytes.length !== 8 ||
      dimensions.bytes.readInt32LE(4) !== 4 || name.bytes.toString() !== 'ptCloud_xyz' ||
      rows < 1 || rows > 1_000_000 || values.length !== rows * 32) {
    throw Error('Expected an N × 4 real double matrix named ptCloud_xyz in ' + filename);
  }
  // Read the three world-coordinate columns in double precision. Column four stores reflectance.
  const xyz = new Float64Array(rows * 3);
  for (let axis = 0; axis < 3; axis++) {
    for (let row = 0; row < rows; row++) xyz[3 * row + axis] = values.readDoubleLE(8 * (axis * rows + row));
  }
  return xyz;
}

function quantile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction, lower = Math.floor(index);
  return sorted[lower] + (index - lower) * (sorted[Math.ceil(index)] - sorted[lower]);
}

function referenceFrame(pairs) {
  const reference = westGround ? 1 : 0;
  const heights = new Float64Array(pairs.reduce((sum, pair) => sum + pair[reference].length / 3, 0));
  let x = Infinity, y = Infinity, row = 0;
  for (const pair of pairs) {
    const east = pair[0], ground = pair[reference];
    for (let i = 0; i < east.length; i += 3) {
      x = Math.min(x, east[i]);
      y = Math.min(y, east[i + 1]);
    }
    for (let i = 2; i < ground.length; i += 3) heights[row++] = ground[i];
  }
  return [Math.floor(x) - 3, Math.floor(y) - 3, quantile(heights.sort(), .01)];
}

function compare(trees, pairs) {
  const origin = referenceFrame(pairs);
  const passes = [0, 1].map(side => {
    const local = new Float32Array(pairs.reduce((sum, pair) => sum + pair[side].length, 0));
    let offset = 0;
    for (const pair of pairs) {
      const xyz = pair[side];
      for (let i = 0; i < xyz.length; i++) local[offset++] = xyz[i] - origin[i % 3];
    }
    return trials.map(({ranking, spacingMeters}) =>
      detectOrchardBases(local, {ranking, separationMeters: spacingMeters}).pins);
  });
  const scores = trials.map((trial, index) => {
    const a = passes[0][index], b = passes[1][index];
    const shiftCm = trees.length === 1 && a.length === 1 && b.length === 1
      ? Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y) * 100 : null;
    return {...trial, [countA]: a.length, [countB]: b.length, shiftCm};
  });
  return {trees, origin, scores};
}

const individual = [], adjacent = [];
for (const trees of [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11]]) {
  const pairs = [];
  for (const tree of trees) {
    const pair = [await scan(tree, 'n_E'), await scan(tree, pairedPass)];
    individual.push(compare([tree], [pair]));
    pairs.push(pair);
  }
  adjacent.push(compare(trees, pairs));
}

const summary = trials.map((trial, index) => {
  const shifts = individual.map(item => item.scores[index].shiftCm).filter(n => n !== null).sort((a, b) => a - b);
  const sum = key => adjacent.reduce((total, item) => total + item.scores[index][key], 0);
  const groupCounts = compareSides
    ? {adjacentEastPins: sum(countA), adjacentWestPins: sum(countB)}
    : {adjacentFanOffPins: sum(countA), adjacentFanOnPins: sum(countB)};
  return {...trial, singlePinPairs: shifts.length, pairsWithin15cm: shifts.filter(cm => cm <= 15).length,
    medianShiftCm: shifts.length ? quantile(shifts, .5) : null, ...groupCounts};
});
console.log(JSON.stringify({source: 'https://hdl.handle.net/10459.1/68782',
  ...(compareSides ? {comparison: 'east-west', passes: ['H1_n_E', 'H1_n_W'], groundHeightFrom: westGround ? 'west' : 'east'} : {}), summary, individual, adjacent}, null, 2));
