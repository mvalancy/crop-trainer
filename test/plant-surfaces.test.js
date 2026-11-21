import test from 'node:test';
import assert from 'node:assert/strict';
import {plantSurfaces} from '../trainer/plants/surfaces.js';

function intersection(x,y,draw) {
  let top=-Infinity,part=0;
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},skeleton=[];
  const surfaces=plantSurfaces((cx,cy,span,visit)=>{
    if(Math.abs(x-cx)<=span && Math.abs(y-cy)<=span) visit(0,x-cx,y-cy);
  },(_,z,p)=>{if(z>top){top=z;part=p}},skeleton,bounds);
  draw(surfaces);
  if(Number.isFinite(top)) for(const [axis,v] of [x,y,top].entries()) {
    assert.ok(bounds.min[axis]-1e-10<=v && v<=bounds.max[axis]+1e-10);
  }
  return {top,part,skeleton};
}

test('a vertical sample can reach branch caps, sloping sides, and see past a taper',()=>{
  const trunk=s=>s.stem(0,0,0,0,0,1,.2,.1);
  assert.equal(intersection(0,0,trunk).top,1);
  assert.ok(Math.abs(intersection(.15,0,trunk).top-.5)<1e-8);
  assert.equal(intersection(.21,0,trunk).top,-Infinity);
  const horizontal=s=>s.stem(0,0,.5,1,0,.5,.1,.05);
  assert.ok(Math.abs(intersection(.5,0,horizontal).top-.575)<1e-8);
  const slant=s=>s.stem(0,0,0,1,0,1,.1,.1);
  assert.ok(Math.abs(intersection(.5,0,slant).top-(.5+.1*Math.SQRT2))<1e-8);
});

test('visible surface chooses the highest organ while hidden wood keeps its geometry',()=>{
  const scene=s=>{s.stem(0,0,0,0,0,1,.1,.06);s.leaf(-1,0,1,1,0,1,.2,.25);
    s.ellipsoid(0,0,1.3,.1,.2,.2,Math.PI/4)};
  const {top,part,skeleton}=intersection(0,0,scene);
  assert.equal(top,1.5);assert.equal(part,3);assert.deepEqual(skeleton,[0,0,0,0,0,1]);
  assert.equal(intersection(.4,0,scene).part,2);
});
