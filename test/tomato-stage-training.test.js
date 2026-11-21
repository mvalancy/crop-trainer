import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDataset} from '../trainer/models/data.js';
import {field} from '../trainer/generator/field.js';

test('a smaller balanced row budget selects repeatable rows and fits a new feature scale',async()=>{
  const cache=new Map();
  const config={seed:82173,crop:'tomato',plantArchitecture:2,plantForm:'mixed',trainFields:2,valFields:1,
    trainingRayBudget:30000,validationRayBudget:30000,generate(recipe) {
      const key=JSON.stringify(recipe);
      if (!cache.has(key)) cache.set(key,field(recipe));
      return cache.get(key);
    }};
  const complete=await buildDataset(config);
  assert.deepEqual(await buildDataset({...config,sampleLimit:48000}),complete);
  const limited=await buildDataset({...config,sampleLimit:24});
  assert.deepEqual(await buildDataset({...config,sampleLimit:24}),limited);
  const control=await buildDataset({...config,sampleLimit:24,
    selectPositiveRows:(rows,n)=>rows.slice(0,n).map((_,i)=>i)});
  assert.deepEqual(control,limited);
  const alternate=await buildDataset({...config,sampleLimit:24,selectPositiveRows:(rows,n)=>{
    assert.ok(rows.every(row=>typeof row.tileId==='string' && row.xy.length===2));
    return Array.from({length:n},(_,i)=>rows.length-1-i);
  }});
  assert.notDeepEqual(alternate.scaling,limited.scaling);
  // Changing positives must preserve the exact negative examples in raw units.
  for (let row=1;row<limited.Y.length;row+=2) {
    for(let k=0;k<limited.dims;k++) {
      const unscale=set=>set.X[row*set.dims+k]*set.scaling.std[k]+set.scaling.means[k];
      assert.ok(Math.abs(unscale(limited)-unscale(alternate))<1e-5);
    }
  }
  for (const selectPositiveRows of [(_,n)=>Array(n).fill(0),(_,n)=>[, ...Array.from({length:n-1},(_,i)=>i)],
    (rows,n)=>Array.from({length:n},(_,i)=>rows.length+i)]) {
    await assert.rejects(buildDataset({...config,sampleLimit:24,selectPositiveRows}),/distinct positive training row indices/);
  }
  assert.deepEqual(limited.manifest,complete.manifest);
  assert.equal(limited.stats.sampleLimit,24);
  assert.equal(limited.Y.length,24);
  assert.equal(limited.Y.reduce((n,y)=>n+y,0),12);
  assert.ok(complete.Y.length>limited.Y.length);
  assert.notDeepEqual(limited.scaling,complete.scaling);
  for (let i=0;i<limited.X.length;i++) {
    const k=i%limited.dims;
    const unscale=(set)=>set.X[i]*set.scaling.std[k]+set.scaling.means[k];
    // The class shuffles put the same raw training rows first in both sets.
    assert.ok(Math.abs(unscale(limited)-unscale(complete))<1e-5);
  }
});

test('invalid balanced row limits fail before generating a scan',async()=>{
  for (const sampleLimit of [22,25,48002,48.5,NaN]) {
    await assert.rejects(buildDataset({sampleLimit,generate:()=>assert.fail('unexpected scan')}),/sample limit/i);
  }
});
