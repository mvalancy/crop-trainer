// Interpret the frozen training selection using simulator labels in a separate pass.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildDataset,features,targetCenters,PEAK_GRID_SIZE} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {scoreSavedWeights} from '../../trainer/models/network.js';
import {selectHardNegatives} from '../../trainer/models/hard-negatives.js';
import {indexReturns} from './tomato-return-cells.mjs';
import {hash} from './tomato-cutoff-controls.mjs';

const floatBytes = (values,from=0,count=values.length) =>
  Buffer.from(values.buffer,values.byteOffset+4*from,4*count);
const bytesHash = values => createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex');
const rowKey = (features,idx,dims) => floatBytes(features,idx*dims,dims).toString('base64');

function addTrainingPeaks(lookup,scan,config,dims) {
  const cells=[], returns=indexReturns(scan), truth=targetCenters(scan.labels.boxes);
  const {pos,X}=features(scan,config.minimumHeight,config.peakAveraging,config.featureMode,
    (x,y)=>cells.push(y*PEAK_GRID_SIZE+x));
  for (const [i,[x,y]] of pos.entries()) {
    let distanceSquared=Infinity;
    for (const [tx,ty] of truth) distanceSquared=Math.min(distanceSquared,(tx-x)**2+(ty-y)**2);
    if (distanceSquared<=.15**2) continue;
    const key=rowKey(X,i,dims);
    // Each of the frozen pools has unique 13-float rows. Refuse an ambiguous assignment.
    assert.ok(!lookup.has(key),'Two eligible training candidates have identical feature bytes.');
    const cell=cells[i];
    let surface=['soil','crop','weed'][returns.topClasses[cell]] ?? 'other';
    if (returns.heights[cell]===-Infinity) surface='empty';
    else if (returns.mixedTopClasses[cell]) surface='mixed';
    lookup.set(key,{surface,within30cm:distanceSquared<.30**2});
  }
}

function describe(peaks,indices) {
  const surface={soil:0,crop:0,weed:0,other:0,empty:0,mixed:0};
  let within30cm=0,cropHighWithin30cm=0;
  for (const i of indices) {
    const peak=peaks[i];
    surface[peak.surface]++;
    if (peak.within30cm) {
      within30cm++;
      if (peak.surface==='crop') cropHighWithin30cm++;
    }
  }
  return {count:indices.length,surface,within30cm,cropHighWithin30cm};
}

export async function auditTrainingSurfaces(training,design,selectExamples) {
  const records=[];
  for (const t of training) {
    const start=performance.now(),lookup=new Map(),dims=t.pilot.model.inputs;
    let raw,count,distancesSquared;
    const set=await buildDataset({...design.settings,seed:t.seed,includeNegativeDistances:!!selectExamples,
      generate:recipe=>field({...recipe,...design.captures}),
      onScan(scan,step) {
        if (step.split==='Training') addTrainingPeaks(lookup,scan,design.settings,dims);
      },
      selectNegativeRows(values,n,dims,distances) {
        raw=values; count=n; distancesSquared=distances;
        return Array.from({length:n},(_,i)=>i);
      }});
    assert.equal(hash(set.manifest),hash(t.manifest));
    assert.equal(bytesHash(raw),t.negativePoolHash);
    if (distancesSquared) assert.equal(bytesHash(distancesSquared),t.distanceHash);
    const scores=scoreSavedWeights(raw,t.pilot.model,design.settings.peakAveraging,design.settings.featureMode);
    assert.equal(bytesHash(scores),t.pilotScoresHash);
    assert.equal(lookup.size,scores.length);
    const peaks=Array.from(scores.keys(),i=>{
      const key=rowKey(raw,i,dims),peak=lookup.get(key);
      assert.ok(peak,'Missing surface for a frozen background candidate.');
      lookup.delete(key);
      return peak;
    });
    assert.equal(lookup.size,0);
    const arms=t.fits.map(({sampling,hardCount,negativeIndexHash})=>{
      const {indices,hardIndices}=selectExamples
        ? selectExamples(scores,count,{sampling,hardCount},distancesSquared,true)
        : {indices:selectHardNegatives(scores,count,hardCount),
          hardIndices:hardCount ? selectHardNegatives(scores,hardCount,hardCount) : []};
      assert.equal(hash(indices),negativeIndexHash);
      return {sampling,selected:describe(peaks,indices),
        ...(hardCount ? {hardOnly:describe(peaks,hardIndices)} : {})};
    });
    records.push({seed:t.seed,eligible:describe(peaks,Array.from(scores.keys())),arms,elapsedMs:performance.now()-start});
  }
  return records;
}
