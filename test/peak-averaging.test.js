import assert from 'node:assert/strict';
import test from 'node:test';
import {features} from '../trainer/data.js';

test('an unsampled neighbour and a measured soil return contribute different weights in the occupied filter',()=>{
  const isolated={xyz:[2.025,3.025,.125]};
  // The stock kernel sees one occupied center bin out of 16 weighted slots.
  assert.deepEqual(features(isolated,.035).pos,[]);
  assert.deepEqual(features(isolated,.035,'zero-filled'),features(isolated,.035));
  const one=features(isolated,.035,'occupied');
  assert.equal(one.pos.length,1);
  assert.equal(one.X[0],.125);
  assert.ok(Math.hypot(one.pos[0][0]-2.025,one.pos[0][1]-3.025)<1e-6);

  const neighbour={xyz:[...isolated.xyz,2.075,3.025,0]};
  const two=features(neighbour,.035,'occupied');
  assert.equal(two.pos.length,1);
  // A soil return at zero height still occupies the adjacent bin (weight 2).
  assert.equal(two.X[0],Math.fround(.125*4/(4+2)));
  assert.throws(()=>features(isolated,.035,'unknown'),/averaging/);
});

test('fully observed support gives the same single-peak features with either filter',()=>{
  const xyz=[];
  for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
    xyz.push(5.025+x*.05,5.025+y*.05,x===0 && y===0?.6:0);
  }
  const stock=features({xyz},.065);
  assert.equal(stock.pos.length,1);
  assert.deepEqual(features({xyz},.065,'occupied'),stock);
});
