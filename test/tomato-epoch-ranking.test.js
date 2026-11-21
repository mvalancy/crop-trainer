import assert from 'node:assert/strict';
import test from 'node:test';
import {rankSummary} from '../benchmark/studies/tomato-epoch-ranking.mjs';

test('candidate AP handles ties as one threshold, even when the top fifth splits a tie',()=>{
  const scores=[.9,.5,.5,.5,.2,.1], labels=[1,0,1,0,0,0];
  const expected={ap:.75,k:2,precisionAtK:(1+1/3)/2,acceptedPositive:2,acceptedNegative:2};
  assert.deepEqual(rankSummary(scores,labels,.5),expected);
  assert.deepEqual(rankSummary(scores,[1,1,0,0,0,0],.5),expected);
  assert.deepEqual(rankSummary([.8,.8,.8,.8],[0,1,0,0]),{ap:.25,k:1,precisionAtK:.25});
  assert.deepEqual(rankSummary([.2],[0]),{ap:null,k:1,precisionAtK:0});
  assert.deepEqual(rankSummary([],[]),{ap:null,k:0,precisionAtK:null});
});
