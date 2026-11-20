import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRecipe,buildDataset} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {getSensor} from '../trainer/sensors.js';
import {parseReferences} from '../trainer/references.js';

for (const crop of ['apple','grapevine','bench-lettuce','high-wire-tomato']) {
  test(crop+' preserves planting IDs and targets across ground and fixture treatments', async () => {
    const recipe=makeRecipe(314759,true,getSensor('os1-64'),crop);
    const scan=field(recipe), again=field(recipe), bare=field({...recipe,ground:false});
    assert.deepEqual(scan.xyz,again.xyz);
    assert.deepEqual(scan.labels.boxes,bare.labels.boxes);
    assert.deepEqual(scan.plantReturns,bare.plantReturns);
    assert.equal(scan.counts.reduce((sum,n)=>sum+n),scan.cls.length);
    assert.equal(scan.plantReturns.reduce((sum,n)=>sum+n),scan.counts[1]);
    assert.ok(scan.labels.boxes.length>3 && scan.counts[1]>0);
    const refs=parseReferences(JSON.stringify(scan.labels),'labels.json',{origin:[0,0,0],unit:'m'});
    assert.deepEqual(refs.map(p=>[p.x,p.y]),scan.labels.boxes.map(b=>b.base_xy_m));
    assert.ok(scan.labels.boxes.every(b=>b.base_xy_m.every((v,i)=>v>=b.min[i] && v<=b.max[i])));
    if (recipe.infrastructure) {
      const off=field({...recipe,infrastructure:false});
      assert.deepEqual(off.labels.boxes,scan.labels.boxes);
      assert.notEqual(off.labels.tile_id,scan.labels.tile_id);
      assert.ok(scan.counts[6]>0); assert.equal(off.counts[6],0);
    }
    const set=await buildDataset({crop,seed:32137,sensorMode:'mixed',trainFields:4,valFields:1});
    assert.ok(set.Y.length>=24);
    const heldOut=set.validation[0];
    assert.deepEqual(heldOut.truth,field(heldOut.recipe).labels.boxes.map(b=>b.base_xy_m));
  });
}
