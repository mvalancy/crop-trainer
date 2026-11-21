// Compares two fixed ways to flatten one physical vineyard strip. See docs/field-datasets.md.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {detectScan} from '../../trainer/field-test/inference.js';
import {parsePly} from '../../trainer/field-test/ply.js';
import {evaluatePins, parseReferences} from '../../trainer/field-test/references.js';
import {matchCenters} from '../../trainer/models/data.js';
import {readPlotColumns} from './vineyard-las.mjs';

const [root, strip, weights] = process.argv.slice(2);
if (!weights) throw Error('Usage: node benchmark/studies/vineyard-low-band.mjs extracted-dataset prepared-strip vine-weights.json');
const info = JSON.parse(await readFile(join(strip,'frame.json'),'utf8'));
assert.equal(info.source,'https://doi.org/10.5281/zenodo.18259014');
assert.equal(info.frame.unit,'m');
const {origin,gradePercent} = info.frame;
const overhead = parsePly(await readFile(join(strip,'plot.ply')));
const refs = parseReferences(await readFile(join(strip,'trunks.csv'),'utf8'),'trunks.csv',info.frame);
const model = JSON.parse(await readFile(weights,'utf8'));
assert.equal(model.crop,'grapevine');
const modelSha256 = createHash('sha256').update(JSON.stringify(model)).digest('hex');

const radius = .15, minHeight = .15, maxHeight = .50, bins = 200;
const rawCells = refs.map(()=>new Set());
const topCells = refs.map(()=>new Set());
const neighbors = new Map();
for (const [i,ref] of refs.entries()) {
  const x0 = Math.max(0,Math.floor((ref.localX-radius)*20)), x1 = Math.min(bins-1,Math.floor((ref.localX+radius)*20));
  const y0 = Math.max(0,Math.floor((ref.localY-radius)*20)), y1 = Math.min(bins-1,Math.floor((ref.localY+radius)*20));
  for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) {
    const cell = bins*y+x;
    if (!neighbors.has(cell)) neighbors.set(cell,[]);
    neighbors.get(cell).push(i);
  }
}

function recordNearReference(cell, x, y, groups) {
  const candidates = neighbors.get(cell);
  if (!candidates) return;
  for (const i of candidates) {
    if ((x-refs[i].x)**2 + (y-refs[i].y)**2 <= radius**2) groups[i].add(cell);
  }
}

function inBand(x,y,z) {
  const height = z-origin[2] - ((x-origin[0])*gradePercent[0]+(y-origin[1])*gradePercent[1])/100;
  return height >= minHeight && height <= maxHeight;
}

const topByCell = new Int32Array(bins*bins).fill(-1);
for (let i=0; i<overhead.length; i+=3) {
  const x=overhead[i], y=overhead[i+1], z=overhead[i+2];
  const cell = bins*Math.floor((y-origin[1])*20)+Math.floor((x-origin[0])*20);
  topByCell[cell] = i;
  if (inBand(x,y,z)) recordNearReference(cell,x,y,topCells);
}

const start = performance.now();
const high = new Float64Array(bins*bins).fill(-Infinity);
const xAt = new Float64Array(high.length), yAt = new Float64Array(high.length);
const {sourcePoints,inPlot} = await readPlotColumns(join(root,info.scanPath),origin,(x,y,z,cell) => {
  if (!inBand(x,y,z)) return;
  recordNearReference(cell,x,y,rawCells);
  if (z > high[cell]) { high[cell]=z; xAt[cell]=x; yAt[cell]=y; }
});
assert.equal(sourcePoints,info.sourcePoints);
assert.equal(inPlot,info.pointsInPlot);
assert.equal(overhead.length/3,info.occupiedCells);
const band = [], twoLayers = Array.from(overhead);
for (let i=0; i<high.length; i++) {
  if (!Number.isFinite(high[i])) continue;
  band.push(xAt[i],yAt[i],high[i]);
  const top = topByCell[i];
  assert(top >= 0);
  if (xAt[i] !== overhead[top] || yAt[i] !== overhead[top+1] || high[i] !== overhead[top+2]) {
    twoLayers.push(xAt[i],yAt[i],high[i]);
  }
}
const preparationMs = performance.now()-start;

const coverage = refs.map((_,i) => {
  assert([...topCells[i]].every(bin=>rawCells[i].has(bin)));
  return {reference:i+1, rawBandColumns:rawCells[i].size, retainedBandColumns:topCells[i].size};
});
const truth = refs.map(ref=>[ref.localX,ref.localY]);
function evaluate(xyz) {
  const begin = performance.now();
  let proposed;
  const result = detectScan(xyz,model,info.frame,stages=>{proposed=stages.proposals;});
  const learned = evaluatePins(result.pins,refs), peaks = evaluatePins(result.baselinePins,refs);
  const {pinByBox} = matchCenters(proposed,truth,radius);
  const strata = {};
  for (const supported of [false,true]) {
    const indices = coverage.flatMap((row,i)=>(row.retainedBandColumns>0)===supported ? [i] : []);
    const matched = assignment=>indices.filter(i=>assignment[i]>=0).length;
    strata[supported?'retainedBandColumn':'noRetainedBandColumn'] = {
      references:indices.length, proposed:matched(pinByBox),
      learned:matched(learned.pinByReference15), peaks:matched(peaks.pinByReference15)
    };
  }
  return {points:xyz.length/3,proposals:proposed.length,strata15cm:strata,
    learned:learned.scores, peaks:peaks.scores, scoringMs:performance.now()-begin};
}

console.log(JSON.stringify({source:info.source, license:info.license, bandM:[minHeight,maxHeight],
  radiusM:radius, modelSha256, sourcePoints, inPlot, preparationMs, coverage,
  highest:evaluate(overhead), highestInBand:evaluate(Float64Array.from(band)),
  highestPlusBand:evaluate(Float64Array.from(twoLayers))},null,2));
