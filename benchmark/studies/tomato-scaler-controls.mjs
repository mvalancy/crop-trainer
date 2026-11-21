// Construct exact raw feature matrices once. Scaling is the second independent factor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../../trainer/generator/field.js';
import {buildDataset} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {scoreSavedWeights,weightArtifact,trainerId} from '../../trainer/models/network.js';
import {settings,captures} from './tomato-hard-negative-runner.mjs';
import {selectDistanceMatched} from './tomato-distance-bands.mjs';
import {hash} from './tomato-cutoff-controls.mjs';

export const bytesHash=values=>createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex');
export const scaleRows=(raw,{means,std})=>Float32Array.from(raw,(v,i)=>(v-means[i%means.length])/std[i%means.length]);

export async function fitScaledRows(set,X,scaling,seed,epochs) {
  const start=performance.now();
  const fit=await trainNetworkCPU(X,set.Y,{...settings,epochs,seed,dims:set.dims});
  assert.equal(fit.epochsCompleted,epochs);
  const model=weightArtifact({settings,scaling,weights:fit.weights,trainer:trainerId(settings),epochs,stats:set.stats});
  return {model,weightHash:hash(model),fitMs:performance.now()-start};
}

export async function prepareScalerCrossTraining(seed) {
  const scenes=new Map();
  let generationMs=0,negativeFeatures,distances,positiveHash;
  const config={...settings,seed,keepRawFeatures:true,generate(recipe) {
    const key=JSON.stringify(recipe);
    if (!scenes.has(key)) {
      const start=performance.now();
      const scan=field({...recipe,...captures});
      generationMs+=performance.now()-start;
      scenes.set(key,scan);
    }
    return scenes.get(key);
  },selectPositiveRows(rows,n) {
    const selected=rows.slice(0,n);
    const digest=hash(selected.map(row=>[row.tileId,...row.xy]));
    if (positiveHash) assert.equal(digest,positiveHash);
    else positiveHash=digest;
    return selected.map((_,i)=>i);
  }};
  const start=performance.now();
  const ordinary=await buildDataset({...config,includeNegativeDistances:true,selectNegativeRows(raw,n,dims,distanceSquared) {
    negativeFeatures=raw; distances=distanceSquared;
    return Array.from({length:n},(_,i)=>i);
  }});
  const ordinaryPreparationMs=performance.now()-start;
  const count=ordinary.Y.length/2;
  assert.equal(count,300);
  const pilot=await fitScaledRows(ordinary,ordinary.X,ordinary.scaling,seed,40);
  const miningStart=performance.now();
  const scores=scoreSavedWeights(negativeFeatures,pilot.model,settings.peakAveraging,settings.featureMode);
  const {indices,bands}=selectDistanceMatched(scores,count,{sampling:'distance-matched',hardCount:150},distances);
  const miningMs=performance.now()-miningStart;
  const rebuild=performance.now(),poolHash=bytesHash(negativeFeatures);
  const mined=await buildDataset({...config,selectNegativeRows(raw,n) {
    assert.equal(n,count);
    assert.equal(bytesHash(raw),poolHash);
    return indices;
  }});
  const minedPreparationMs=performance.now()-rebuild;
  assert.deepEqual(mined.manifest,ordinary.manifest);
  assert.deepEqual(mined.Y,ordinary.Y);
  const assemble=performance.now(),sets={ordinary,mined},dims=ordinary.dims;
  const raw={ordinary:ordinary.rawX,mined:mined.rawX},positive=new Float32Array(count*dims);
  for (let row=0;row<count;row++) {
    const from=2*row*dims,to=from+dims;
    const crop=raw.ordinary.subarray(from,to);
    assert.deepEqual(raw.mined.subarray(from,to),crop);
    positive.set(crop,row*dims);
    const negative=indices[row]*dims;
    assert.deepEqual(raw.mined.subarray(to,to+dims),negativeFeatures.subarray(negative,negative+dims));
  }
  for (const [name,set] of Object.entries(sets)) assert.deepEqual(scaleRows(raw[name],set.scaling),set.X);
  const receipt={seed,manifest:ordinary.manifest,positiveHash,positiveRawHash:bytesHash(positive),negativePoolHash:poolHash,
    eligible:scores.length,bands,minedIndexHash:hash(indices),ordinaryRowsRetained:indices.filter(i=>i<count).length,
    pilotHash:pilot.weightHash,labelsHash:bytesHash(ordinary.Y),rawHashes:{ordinary:bytesHash(raw.ordinary),mined:bytesHash(raw.mined)},
    scalers:{ordinary:ordinary.scaling,mined:mined.scaling},timingsMs:{generation:generationMs,ordinaryPreparation:ordinaryPreparationMs,
      pilot:pilot.fitMs,mining:miningMs,minedPreparation:minedPreparationMs,rawAssembly:performance.now()-assemble}};
  return {sets,raw,receipt};
}
