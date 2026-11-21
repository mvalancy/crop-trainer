import assert from 'node:assert/strict';
import test from 'node:test';
import {selectDistanceMatched} from '../benchmark/studies/tomato-distance-bands.mjs';

test('matching distances keeps the shuffled near/far counts even when all high scores are near',()=>{
  const d=Float64Array.from([.2,.3,.4,.6,.17,.18,.19,.7,.38],x=>x*x);
  const scores=Float32Array.of(.4,.02,.1,.1,.85,.95,.8,.6,.72),count=4;
  const select=sampling=>selectDistanceMatched(scores,count,{sampling,hardCount:2},d);
  assert.deepEqual(select('half-hard').indices,[0,1,4,5]);
  const trial=select('distance-matched');
  assert.deepEqual(trial.indices,[1,2,5,8]);
  // Half a near hard slot rounds up. The 30 cm row belongs to far and fills an unused slot.
  assert.equal(trial.bands.hardNear,1);
  assert.equal(trial.bands.selectedNear,1);
  assert.equal(trial.bands.selectedFar,3);
});

test('a band absent from the ordinary sample contributes zero rows',()=>{
  const scores=Float32Array.of(.3,.2,.9,.9,.4);
  const distances=Float64Array.from([.5,.6,.2,.45,.9],x=>x*x);
  const trial=selectDistanceMatched(scores,2,{sampling:'distance-matched',hardCount:1},distances);
  assert.deepEqual(trial.indices,[0,3]);
  assert.equal(trial.bands.hardNear,0);
});

test('optional center distances follow the shuffled XYZ feature rows in the training split',async()=>{
  const {buildDataset,features,targetCenters}=await import('../trainer/models/data.js');
  const {field}=await import('../trainer/generator/field.js');
  const expected=new Map(),cache=new Map();
  const config={seed:82173,crop:'tomato',plantArchitecture:2,trainFields:2,valFields:1,sampleLimit:24,generate(recipe) {
    const key=JSON.stringify(recipe);
    if (!cache.has(key)) cache.set(key,field(recipe));
    return cache.get(key);
  }};
  const ordinary=await buildDataset({...config,selectNegativeRows(raw,n,dims,distances) {
    assert.equal(distances,undefined);
    return Array.from({length:n},(_,i)=>i);
  }});
  const audited=await buildDataset({...config,includeNegativeDistances:true,onScan(scan,step) {
    if (step.split!=='Training') return;
    const truth=targetCenters(scan.labels.boxes),{pos,X}=features(scan);
    for (const [i,[x,y]] of pos.entries()) {
      const d2=Math.min(...truth.map(([tx,ty])=>(x-tx)**2+(y-ty)**2));
      if (d2<=.15**2) continue;
      const key=X.subarray(i*ordinary.dims,(i+1)*ordinary.dims).join(',');
      if (!expected.has(key)) expected.set(key,new Set());
      expected.get(key).add(d2);
    }
  },selectNegativeRows(raw,n,dims,distances) {
    assert.ok(distances instanceof Float64Array);
    assert.equal(distances.length,raw.length/dims);
    distances.forEach((d2,i)=>assert.ok(expected.get(raw.subarray(i*dims,(i+1)*dims).join(',')).has(d2)));
    return Array.from({length:n},(_,i)=>i);
  }});
  assert.deepEqual(audited,ordinary);
});

test('crossing scales keeps the original rows, the donor scale and identically prepared validation inputs', async () => {
  const {buildDataset,withTrainingScale}=await import('../trainer/models/data.js');
  const options={seed:198317,trainFields:2,valFields:1,minimumHeight:.035,sampleLimit:36,keepRawFeatures:true};
  const ordinary=await buildDataset(options);
  const alternate=await buildDataset({...options,selectNegativeRows:(raw,n,dims)=>Array.from({length:n},(_,i)=>raw.length/dims-1-i)});
  const snapshot=ordinary.X.slice();
  assert.notDeepEqual(ordinary.scaling,alternate.scaling);
  const cross=withTrainingScale(ordinary,alternate);
  const expected=ordinary.rawX.map((x,i)=>(x-alternate.scaling.means[i%ordinary.dims])/alternate.scaling.std[i%ordinary.dims]);
  assert.deepEqual(cross.X,expected);
  assert.equal(cross.Y,ordinary.Y);
  assert.equal(cross.scaling,alternate.scaling);
  assert.equal(cross.validation,alternate.validation);
  assert.deepEqual(ordinary.X,snapshot);
  assert.throws(()=>withTrainingScale(ordinary,{...alternate,manifest:[]}),/matching scans/);
});
