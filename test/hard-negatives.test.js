import assert from 'node:assert/strict';
import test from 'node:test';
import {selectHardNegatives} from '../trainer/models/hard-negatives.js';

test('hard negatives keep shuffled order, break ties deterministically and fill from unused backgrounds',()=>{
  const scores=Float32Array.of(.6,.1,.1,.9,.9,.6,.2);
  assert.deepEqual(selectHardNegatives(scores,4,0),[0,1,2,3]);
  assert.deepEqual(selectHardNegatives(scores,4,1),[0,1,2,3]);
  assert.deepEqual(selectHardNegatives(scores,4,2),[0,1,3,4]);
  assert.deepEqual(selectHardNegatives(scores,4,4),[0,3,4,5]);
  assert.throws(()=>selectHardNegatives(scores,8,4),RangeError);
  assert.throws(()=>selectHardNegatives(scores,4,5),RangeError);
  assert.throws(()=>selectHardNegatives([0,NaN,1],2,1),RangeError);
});
