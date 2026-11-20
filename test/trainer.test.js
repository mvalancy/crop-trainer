import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataset,validateModel,matchedCount} from '../trainer/data.js';
import {trainNetworkCPU,predictNetwork} from '../trainer/neural.js';
import {trainCPU} from '../trainer/model.js';

test('a label can match only one pin',()=>{
 assert.equal(matchedCount([[0,0],[.01,0]],[[0,0]],.075),1);
});
test('both CPU models train and each preview follows its scored tile',async()=>{
 const set=await buildDataset({seed:27,trainFields:4,valFields:2,sensorMode:'mixed',minimumHeight:.035});
 assert.ok(set.stats.fieldSeeds.validation.every(s=>!set.stats.fieldSeeds.training.includes(s)));
 for(const neural of [true,false]){
  const run=await (neural?trainNetworkCPU:trainCPU)(set.X,set.Y,{dims:set.dims,epochs:30});
  assert.ok(run.loss.at(-1)<run.loss[0]);
  assert.equal(run.weights.length,neural?61:14);
  const result=await validateModel(set,run.weights,{predictScores:neural?predictNetwork:undefined});
  assert.ok(result.meanF1>0&&result.meanF1<=1);
  for(const tile of result.tiles){
   const view=result.previews.get(tile.tile_id);assert.equal(view.ground,tile.ground);
   for(const stage of tile.stages15cm)assert.equal(view.stages[stage.stage].length,stage.count);
  }
 }
});

test('crop selection controls geometry, labels and duplicate filtering', async () => {
  const {makeRecipe, detectionStages} = await import('../trainer/data.js');
  const {getSensor} = await import('../trainer/sensors.js');
  const {field} = await import('../trainer/field.js');
  const ids = new Set();
  for (const key of ['lettuce', 'artichoke', 'tomato']) {
    const recipe = makeRecipe(27, true, getSensor('os1-64'), key);
    const scan = field(recipe);
    const bare = field({...recipe, ground:false});
    assert.equal(scan.labels.crop, key);
    assert.ok(scan.labels.boxes.length > 10);
    assert.deepEqual(scan.labels.boxes, bare.labels.boxes);
    assert.notEqual(scan.labels.tile_id, bare.labels.tile_id);
    assert.equal(scan.xyz.length, scan.labels.num_points * 3);
    assert.equal(scan.counts.reduce((a,b) => a+b, 0), scan.labels.num_points);
    ids.add(scan.labels.tile_id);
    const stages = detectionStages({recipe, pos:[[0,0],[.17,0]]}, [.8,.7]);
    assert.equal(stages.selected.length, key === 'lettuce' ? 2 : 1);
  }
  assert.equal(ids.size, 3);
  assert.throws(() => makeRecipe(27, true, getSensor('reference'), 'unknown'));
  assert.throws(() => getSensor('unknown'));
});

test('the cutoff includes equal scores and applies before crop spacing', async () => {
  const {detectionStages} = await import('../trainer/data.js');
  const tile = {pos:[[1,1], [1.01,1], [3,3]], recipe:{crop:'lettuce'}};
  const scores = [.75, .50, .35];
  assert.deepEqual(detectionStages(tile,scores), detectionStages(tile,scores,.5));
  assert.deepEqual(detectionStages(tile,scores,.5).accepted, tile.pos.slice(0,2));
  assert.deepEqual(detectionStages(tile,scores,.5).selected, [tile.pos[0]]);
  assert.deepEqual(detectionStages(tile,scores,.35).selected, [tile.pos[0],tile.pos[2]]);
  assert.deepEqual(detectionStages(tile,scores,1).selected, []);
  for (const threshold of [-.1, 1.01, NaN, null, '0.5']) {
    await assert.rejects(validateModel({}, [], {threshold}), /score cutoff/);
  }
});
