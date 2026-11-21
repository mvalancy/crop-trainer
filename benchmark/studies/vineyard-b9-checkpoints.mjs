// Estimate B9 translation from the repeated checkerboard pattern on a 2021
// flight. The calculation never reads a trunk file or detector predictions.
import {createHash} from 'node:crypto';
import {mkdir, open, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [lasPath, dbfPath, previewDir] = process.argv.slice(2);
if (!dbfPath || process.argv.length > 5) {
  throw Error('Usage: node benchmark/studies/vineyard-b9-checkpoints.mjs original-30m-flight.las GCPs.dbf [new-preview-directory]');
}
const dbf = await readFile(dbfPath);
if (createHash('sha256').update(dbf).digest('hex') !== '13972bf73287b1f344feb69921094e8cba073142cff76b4e6984e192552367e1') {
  throw Error('Use the GCPs.dbf from Zenodo 7383601.');
}
const start = dbf.readUInt16LE(8), rowBytes = dbf.readUInt16LE(10);
const targets = [];
for (let pos = start; targets.length < dbf.readUInt32LE(4); pos += rowBytes) {
  const [x, y, _z, id] = dbf.toString('ascii', pos, pos + rowBytes).trim().split(/\s+/).map(Number);
  targets.push({id, x, y});
}

const pointFile = await open(lasPath);
const header = Buffer.alloc(375);
await pointFile.read(header, 0, header.length, 0);
const count = Number(header.readBigUInt64LE(247));
const stride = header.readUInt16LE(105), first = header.readUInt32LE(96);
if (header.toString('ascii', 0, 4) !== 'LASF' || header[25] !== 4 || header[104] !== 7 ||
    count !== 15166707 || first + count * stride > (await pointFile.stat()).size) {
  throw Error('Expected the original September 16 B9 30 m capture, decompressed as LAS 1.4 point format 7.');
}
const scaleX = header.readDoubleLE(131), scaleY = header.readDoubleLE(139);
const offsetX = header.readDoubleLE(155), offsetY = header.readDoubleLE(163);
async function scan(action) {
  const block = Buffer.alloc(65536 * stride);
  for (let index = 0; index < count; index += 65536) {
    const bytes = Math.min(65536, count-index) * stride;
    const {bytesRead} = await pointFile.read(block, 0, bytes, first + index * stride);
    if (bytesRead !== bytes) throw Error('Incomplete LAS point data.');
    for (let p = 0; p < bytes; p += stride) {
      action(block.readInt32LE(p)*scaleX + offsetX, block.readInt32LE(p+4)*scaleY + offsetY, block, p);
    }
  }
}

const cell = .04, side = 200;
let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
await scan((x, y) => {
  left = Math.min(left, x); right = Math.max(right, x);
  bottom = Math.min(bottom, y); top = Math.max(top, y);
});
// Both survey and scan extent midpoints only nominate coarse 8 m windows.
// They supply no final checkpoint centers or fitted displacement.
function midpoint(values) { return (Math.min(...values) + Math.max(...values))/2; }
const roughX = midpoint(targets.map(t => t.x)) - (left + right)/2;
const roughY = midpoint(targets.map(t => t.y)) - (bottom + top)/2;
const windows = targets.map(({id, x, y}) => ({
  id, x0: x - roughX - 4, y0: y - roughY - 4,
  counts: new Uint32Array(side**2),
  channels: Array.from({length: 3}, () => new Float64Array(side**2)),
}));
await scan((x, y, buffer, offset) => {
  for (const w of windows) {
    const col = Math.floor((x-w.x0)/cell), row = Math.floor((y-w.y0)/cell);
    if (col < 0 || col >= side || row < 0 || row >= side) continue;
    const i = row*side + col;
    w.counts[i]++;
    for (let ch = 0; ch < 3; ch++) w.channels[ch][i] += buffer.readUInt16LE(offset+30+2*ch);
  }
});
await pointFile.close();
if (previewDir) await mkdir(previewDir);

const candidates = [];
for (const w of windows) {
  const density = new Uint16Array(side**2);
  const bright = [];
  const preview = Buffer.alloc(side**2 * 3);
  for (let i = 0; i < side**2; i++) {
    if (!w.counts[i]) continue;
    const [r, g, b] = w.channels.map(channel => channel[i]/w.counts[i]);
    const row = Math.floor(i/side), col = i%side;
    const pixel = 3*((side-1-row)*side + col);
    [r, g, b].forEach((v, ch) => { preview[pixel+ch] = Math.round(v/257); });
    if (b < .65*65535 || b < .99*g || b < .99*r) continue;
    bright.push([col, row]);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx*dx + dy*dy > 16) continue;
      const y = row+dy, x = col+dx;
      if (x>=0 && x<side && y>=0 && y<side) density[y*side+x]++;
    }
  }
  if (previewDir) {
    const ppm = Buffer.from('P6\n'+side+' '+side+'\n255\n');
    await writeFile(join(previewDir, 'target-'+w.id+'.ppm'), Buffer.concat([ppm, preview]));
  }
  const strongest = density.indexOf(Math.max(...density));
  const peakRow = Math.floor(strongest/side), peakCol = strongest%side;
  let runnerUp = -1;
  for (let i = 0; i < density.length; i++) {
    const separated = (Math.floor(i/side)-peakRow)**2 + (i%side-peakCol)**2 >= 13**2;
    if (separated && (runnerUp < 0 || density[i] > density[runnerUp])) runnerUp = i;
  }

  // Reviewed against the four-quadrant checker in the acquisition paper.
  // All seven windows were inspected. ID 1 has no resolved checker. At ID 4
  // the strongest patch is an elongated blue object, and the second is the tile.
  const reviewedRank = w.id === 1 ? null : w.id === 4 ? 2 : 1;
  const result = {id: w.id, reviewedRank,
    brightestCells: density[strongest], runnerUpCells: density[runnerUp]};
  if (reviewedRank !== null) {
    const chosen = reviewedRank === 1 ? strongest : runnerUp;
    if (density[chosen] < 12) throw Error('Insufficient bright cells at reviewed marker '+w.id);
    const row = Math.floor(chosen/side), col = chosen%side;
    const cluster = bright.filter(([x, y]) => (x-col)**2+(y-row)**2 <= 25);
    const mean = axis => cluster.reduce((sum, p) => sum+p[axis], 0)/cluster.length;
    result.center = [w.x0 + cell*(mean(0)+.5), w.y0 + cell*(mean(1)+.5)];
  }
  candidates.push(result);
}
const fitIds = new Set([2, 3, 4]);
const fit = candidates.filter(c => fitIds.has(c.id));
if (fit.some(c => !c.center)) throw Error('A calibration marker failed the contrast gate.');
const translation = ['x','y'].map((axis, j) => fit.reduce((sum, c) =>
  sum + targets.find(t => t.id === c.id)[axis] - c.center[j], 0)/fit.length);
for (const c of candidates) {
  c.usedForTranslation = fitIds.has(c.id);
  if (c.center) {
    const t = targets.find(t => t.id === c.id);
    c.offsetCm = c.center.map((value, j) => 100*(value+translation[j]-[t.x,t.y][j]));
    c.distanceCm = Math.hypot(...c.offsetCm);
  }
}
const checks = candidates.filter(c => !c.usedForTranslation && c.center);
const checkRmsCm = Math.sqrt(checks.reduce((sum, c) => sum+c.distanceCm**2, 0)/checks.length);
console.log(JSON.stringify({pointCount: count, localBounds: [left,bottom,right,top], checkRmsCm,
  translation, candidates}, null, 2));
