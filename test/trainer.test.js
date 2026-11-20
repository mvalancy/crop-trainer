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
