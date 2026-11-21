import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDataset} from '../trainer/models/data.js';

// Distinct peak heights identify the original planting after the class shuffles.
// The two soil variants are separate scans with the same peak heights.
function fixtureScan(recipe,step,points,referenceCenters) {
  const fieldIndex=Math.floor((step.done-1)/2);
  const xyz=Float32Array.from(points.flatMap(([x,y])=>[x,y,.5+.1*fieldIndex]));
  return {p:recipe,xyz,sampledRays:points.length,labels:{
    tile_id:String(step.done),num_points:points.length,boxes:referenceCenters.map(([x,y])=>({base_xy_m:[x,y]}))
  }};
}

function assertUsedRows(set) {
  const counts=set.stats.trainingExamplesByField;
  assert.deepEqual(counts.map(c=>c.seed),set.stats.fieldSeeds.training);
  const actual=counts.map(()=>[0,0]);
  for (let row=0;row<set.Y.length;row++) {
    const z=set.X[row*set.dims+1]*set.scaling.std[1]+set.scaling.means[1];
    const field=Math.round((z-.5)/.1);
    assert.equal(set.Y[row],1-row%2); // The trainer keeps the two classes interleaved.
    actual[field][set.Y[row]]++;
  }
  assert.deepEqual(counts.map(c=>[c.usedNegative,c.usedPositive]),actual);
}

test('field counts track balanced rows, distance exclusions, empty plantings and both soil variants',async()=>{
  const points=Array.from({length:18},(_,i)=>[1.025+(i%6)*.5,1.025+Math.floor(i/6)*.5]);
  const settings={seed:138,trainFields:3,valFields:1,minimumHeight:.035,generate:(recipe,step)=>{
    const index=Math.floor((step.done-1)/2);
    if (index===2) return fixtureScan(recipe,step,[],[]);
    const positive=index===0?12:2;
    const [x,y]=points[positive];
    return fixtureScan(recipe,step,points,[...points.slice(0,positive),[x+.12,y]]);
  }};
  const set=await buildDataset(settings);
  assert.deepEqual(set.stats.trainingExamplesByField.map(c=>[c.availablePositive,c.availableNegative,c.ambiguous]),
    [[24,10,2],[4,30,2],[0,0,0]]);
  assert.equal(set.stats.samples,56);
  assertUsedRows(set);
  const repeated=await buildDataset(settings);
  assert.deepEqual(repeated.stats.trainingExamplesByField,set.stats.trainingExamplesByField);
  assert.deepEqual(repeated.X,set.X);
  assert.deepEqual(repeated.Y,set.Y);
});

test('fields report the exact selected rows when both class pools exceed the sample limit',async()=>{
  const points=Array.from({length:65*65},(_,i)=>[.125+(i%65)*.15,.125+Math.floor(i/65)*.15]);
  const set=await buildDataset({seed:139,trainFields:6,valFields:1,minimumHeight:.035,generate:(recipe,step)=>{
    if(step.split==='Validation') return fixtureScan(recipe,step,[],[]);
    const fieldIndex=Math.floor((step.done-1)/2);
    return fixtureScan(recipe,step,points,fieldIndex%2===0?points:[]);
  }});
  const counts=set.stats.trainingExamplesByField;
  assert.equal(counts.reduce((n,c)=>n+c.availablePositive,0),25_350);
  assert.equal(counts.reduce((n,c)=>n+c.availableNegative,0),25_350);
  assert.equal(set.stats.samples,48_000);
  assert.equal(set.Y.length,set.stats.sampleLimit);
  assertUsedRows(set);
});
