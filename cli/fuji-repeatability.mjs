// Offline replay on the original, locally extracted LFuji-air AllTrees_pcloud directory.
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {detectOrchardBases, ORCHARD_SPACINGS} from '../trainer/models/orchard.js';

const directory = process.argv[2];
if (!directory || process.argv.length !== 3) {
  throw Error('Usage: node cli/fuji-repeatability.mjs /path/to/AllTrees_pcloud');
}

// This archive uses regular MATLAB v5 tags, each padded to eight bytes within the matrix.
function element(buffer, offset, type) {
  if (offset + 8 > buffer.length || buffer.readUInt32LE(offset) !== type) {
    throw Error('Expected the original LFuji-air MATLAB v5 data layout.');
  }
  const size = buffer.readUInt32LE(offset + 4);
  if (size > buffer.length - offset - 8) throw Error('Incomplete MATLAB data element.');
  return {bytes: buffer.subarray(offset + 8, offset + 8 + size), next: offset + 8 + Math.ceil(size / 8) * 8};
}

async function scan(tree, airflow) {
  const filename = 'Tree' + String(tree).padStart(2, '0') + '_H1_' + airflow + '_E.mat';
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

function referenceFrame(scans) {
  const heights = new Float64Array(scans.reduce((sum, xyz) => sum + xyz.length / 3, 0));
  let x = Infinity, y = Infinity, row = 0;
  for (const xyz of scans) {
    for (let i = 0; i < xyz.length; i += 3) {
      x = Math.min(x, xyz[i]);
      y = Math.min(y, xyz[i + 1]);
      heights[row++] = xyz[i + 2];
    }
  }
  return [Math.floor(x) - 3, Math.floor(y) - 3, quantile(heights.sort(), .01)];
}

function compare(trees, pairs) {
  const origin = referenceFrame(pairs.map(pair => pair.off));
  const passes = {};
  for (const side of ['off', 'on']) {
    const local = new Float32Array(pairs.reduce((sum, pair) => sum + pair[side].length, 0));
    let offset = 0;
    for (const pair of pairs) {
      const xyz = pair[side];
      for (let i = 0; i < xyz.length; i++) local[offset++] = xyz[i] - origin[i % 3];
    }
    passes[side] = ORCHARD_SPACINGS.map(separationMeters => detectOrchardBases(local, {separationMeters}).pins);
  }
  const scores = ORCHARD_SPACINGS.map((spacingMeters, index) => {
    const off = passes.off[index], on = passes.on[index];
    const shiftCm = trees.length === 1 && off.length === 1 && on.length === 1
      ? Math.hypot(off[0].x - on[0].x, off[0].y - on[0].y) * 100 : null;
    return {spacingMeters, fanOffPins: off.length, fanOnPins: on.length, shiftCm};
  });
  return {trees, origin, scores};
}

const individual = [], adjacent = [];
for (const trees of [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11]]) {
  const pairs = [];
  for (const tree of trees) {
    const pair = {off: await scan(tree, 'n'), on: await scan(tree, 'af')};
    individual.push(compare([tree], [pair]));
    pairs.push(pair);
  }
  adjacent.push(compare(trees, pairs));
}

const summary = ORCHARD_SPACINGS.map((spacingMeters, index) => {
  const shifts = individual.map(item => item.scores[index].shiftCm).filter(n => n !== null).sort((a, b) => a - b);
  const sum = key => adjacent.reduce((total, item) => total + item.scores[index][key], 0);
  return {spacingMeters, singlePinPairs: shifts.length, pairsWithin15cm: shifts.filter(cm => cm <= 15).length,
    medianShiftCm: shifts.length ? quantile(shifts, .5) : null, adjacentFanOffPins: sum('fanOffPins'),
    adjacentFanOnPins: sum('fanOnPins')};
});
console.log(JSON.stringify({source: 'https://hdl.handle.net/10459.1/68782', summary, individual, adjacent}, null, 2));
