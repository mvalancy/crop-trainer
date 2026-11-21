import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../trainer/generator/field.js';
import {boardLayout} from '../trainer/generator/boards.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {makeRecipe} from '../trainer/models/data.js';
import {seededRandom} from '../trainer/plants/traits.js';

function recipe(seed, crop, architecture, form) {
  return {...makeRecipe(seed,true,getSensor('reference'),crop,architecture,form,'healthy'),
    points:60000,scanNoise:null,weeds:false,sticks:false,boards:true};
}

test('historical board scans replay and an inactive placement cannot change the field ID',()=>{
  const source=recipe(20107139,'apple',4,'central-leader');
  const old=field(source);
  assert.equal(old.labels.tile_id,'03293fc80ba61552');
  const digest=createHash('sha256').update(Buffer.from(old.xyz.buffer)).update(old.cls).digest('hex');
  assert.equal(digest,'b6078ef1833206aca4e403ea3572777796dbb872f59a0f8d7a456abc84ed1b6b');
  const explicit=field({...source,boardPlacement:'plant'});
  assert.deepEqual(explicit.xyz,old.xyz);
  assert.deepEqual(explicit.cls,old.cls);
  assert.deepEqual(explicit.labels,old.labels);
  const trial=field({...source,boardPlacement:'independent'});
  assert.notEqual(trial.labels.tile_id,old.labels.tile_id);
  assert.deepEqual(trial.labels.boxes,old.labels.boxes);
  const replay=field(JSON.parse(JSON.stringify(trial.p)));
  assert.deepEqual(replay.labels,trial.labels);
  assert.deepEqual(replay.xyz,trial.xyz);
  assert.deepEqual(replay.cls,trial.cls);
  const off=field({...source,boards:false});
  const ignored=field({...source,boards:false,boardPlacement:'independent'});
  assert.deepEqual(ignored.labels,off.labels);
  assert.deepEqual(ignored.xyz,off.xyz);
  assert.throws(()=>field({...source,boardPlacement:'elsewhere'}),/board placement/);
});

test('independent boards keep the historical shapes and ignore plant positions',()=>{
  const seed=27, anchors=[[1,1],[6,4],[9,2]];
  const shapeRandom=()=>seededRandom(seed^54321);
  function layout(placement,plantCenters,random=shapeRandom()) {
    return boardLayout({seed,placement,plantCenters,obstacleRandom:random,plotSize:10});
  }
  const oldRandom=shapeRandom(),newRandom=shapeRandom();
  const old=layout('plant',anchors,oldRandom),trial=layout('independent',anchors,newRandom);
  assert.equal(oldRandom(),newRandom());
  assert.equal(trial.length,9);
  assert.deepEqual(trial,layout('independent',[]));
  assert.deepEqual(trial,layout('independent',[[3,8]]));
  assert.deepEqual(old.map(({angle,halfLength,halfWidth})=>[angle,halfLength,halfWidth]),
    trial.map(({angle,halfLength,halfWidth})=>[angle,halfLength,halfWidth]));
  assert.ok(old.every(board=>anchors.some(([x,y])=>board.x===x && board.y===y)));
  assert.ok(trial.every(({x,y})=>x>=0 && x<10 && y>=0 && y<10));
  assert.equal(new Set(trial.map(b=>b.x+','+b.y)).size,9);
  // The center is inside this seeded plot; the board's north end extends beyond it.
  const edge=trial[6], halfExtentY=Math.abs(Math.sin(edge.angle))*edge.halfLength+Math.abs(Math.cos(edge.angle))*edge.halfWidth;
  assert.ok(edge.y+halfExtentY>10);

  for (const [crop,version,form] of [['apple',4,'open-vase'],['apple',4,'central-leader'],['lettuce',1,'mixed']]) {
    const source=recipe(seed,crop,version,form);
    const scan=field({...source,boardPlacement:'independent'}),clear=field({...source,boards:false});
    assert.deepEqual(scan.labels.boxes,clear.labels.boxes);
    let boardPoints=0, nearNorthEdge=0;
    for(let i=0; i<scan.cls.length; i++){
      const offset=3*i, x=scan.xyz[offset], y=scan.xyz[offset+1];
      assert.equal(x,clear.xyz[offset]);
      assert.equal(y,clear.xyz[offset+1]);
      if(scan.cls[i]!==4){
        assert.equal(scan.cls[i],clear.cls[i]);
        assert.equal(scan.xyz[offset+2],clear.xyz[offset+2]);
        continue;
      }
      boardPoints++;
      assert.ok(trial.some(({x:cx,y:cy,angle,halfLength,halfWidth})=>{
        const dx=x-cx,dy=y-cy,c=Math.cos(angle),s=Math.sin(angle);
        return Math.abs(c*dx+s*dy)<halfLength && Math.abs(-s*dx+c*dy)<halfWidth;
      }));
      if(y>9.95 && Math.abs(x-edge.x)<.2)nearNorthEdge++;
    }
    assert.equal(scan.counts[4],boardPoints);
    assert.ok(nearNorthEdge>0);
  }
});
