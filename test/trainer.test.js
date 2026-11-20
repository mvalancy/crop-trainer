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

test('changing only the validation scanner preserves training samples and held-out labels', async () => {
  const settings = {crop:'tomato', seed:211, trainFields:2, valFields:1, sensorMode:'mixed'};
  const original = await buildDataset(settings);
  const ring = await buildDataset({...settings, validationSensorMode:'os1-64'});
  assert.equal(original.stats.validationSensorMode, 'mixed');
  assert.equal(ring.stats.validationSensorMode, 'os1-64');
  assert.deepEqual(ring.X, original.X);
  assert.deepEqual(ring.Y, original.Y);
  assert.deepEqual(ring.scaling, original.scaling);
  assert.deepEqual(ring.stats.fieldSeeds, original.stats.fieldSeeds);
  assert.deepEqual(ring.manifest.filter(t => t.split === 'train'), original.manifest.filter(t => t.split === 'train'));
  for (const [i, tile] of ring.validation.entries()) {
    assert.deepEqual(tile.truth, original.validation[i].truth);
    assert.deepEqual(tile.recipe.scanNoise, original.validation[i].recipe.scanNoise);
    assert.equal(tile.recipe.sampling.key, 'os1-64');
    assert.equal(tile.ground, original.validation[i].ground);
    assert.notEqual(tile.tile_id, original.validation[i].tile_id);
    assert.ok(tile.returnCount > 0);
  }
  await assert.rejects(buildDataset({...settings, validationSensorMode:'missing'}), /Unknown scanner/);
});

test('soil groups pool counts at every tolerance and recombine into overall scores', async () => {
  const set = await buildDataset({crop:'lettuce', seed:307, trainFields:2, valFields:2});
  const result = await validateModel(set, [], {predictScores:X => Array(X.length / set.dims).fill(1)});
  for (const group of result.byGround) {
    const tiles = result.tiles.filter(tile => tile.ground === group.ground);
    assert.equal(group.tileCount, 2);
    for (const [i, score] of group.scores.entries()) {
      for (const key of ['tp','fp','fn']) {
        assert.equal(score[key], tiles.reduce((sum, tile) => sum + tile.byTolerance[i][key], 0));
      }
      assert.equal(score.recall, score.tp / (score.tp + score.fn));
      assert.equal(score.precision, score.tp / (score.tp + score.fp || 1));
      assert.equal(score.f1, 2 * score.tp / (2 * score.tp + score.fp + score.fn));
    }
  }
  assert.deepEqual(result.byGround.map(group => group.ground), [true, false]);
  for (const [i, score] of result.scores.entries()) {
    for (const key of ['tp','fp','fn']) {
      assert.equal(score[key], result.byGround.reduce((sum, group) => sum + group.scores[i][key], 0));
    }
  }
});

test('planting scores use both scans even when the validation order changes', async () => {
  const set = await buildDataset({crop:'tomato', seed:421, trainFields:2, valFields:2});
  set.validation.sort((a,b) => Number(a.ground) - Number(b.ground));
  const result = await validateModel(set, [], {predictScores:X => Array(X.length / set.dims).fill(1)});
  assert.equal(result.byField.length, 2);
  for (const field of result.byField) {
    const scans = result.tiles.filter(tile => tile.seed === field.seed);
    assert.deepEqual(new Set(scans.map(tile => tile.ground)), new Set([true, false]));
    assert.deepEqual(field.tileIds, scans.map(tile => tile.tile_id));
    assert.ok(scans.every(tile => tile.sensor === field.sensor));
    for (const score of field.scores) {
      const [a, b] = scans.map(tile => tile.byTolerance.find(t => t.cm === score.cm));
      for (const key of ['tp','fp','fn']) assert.equal(score[key], a[key] + b[key]);
      assert.equal(score.f1, 2 * score.tp / (2 * score.tp + score.fp + score.fn));
    }
    assert.equal(field.meanF1, field.scores.reduce((sum, score) => sum + score.f1, 0) / 3);
  }
});

test('validation ray budgets change scan density while preserving plants and training inputs', async () => {
  const settings = {crop:'tomato', seed:721, trainFields:2, valFields:1, sensorMode:'mixed', validationSensorMode:'os1-32'};
  const sparse = await buildDataset({...settings, validationRayBudget:12000});
  const capped = await buildDataset({...settings, validationRayBudget:60000});
  assert.deepEqual(sparse.X, capped.X);
  assert.deepEqual(sparse.Y, capped.Y);
  assert.deepEqual(sparse.scaling, capped.scaling);
  assert.deepEqual(sparse.manifest.filter(t => t.split === 'train'), capped.manifest.filter(t => t.split === 'train'));
  for (const [i, tile] of capped.validation.entries()) {
    const original = sparse.validation[i];
    assert.deepEqual(tile.truth, original.truth);
    assert.deepEqual(tile.recipe, {...original.recipe, points:60000});
    assert.equal(original.sampledRays, 12000);
    assert.equal(tile.sampledRays, 512 * 32);
    assert.notEqual(tile.tile_id, original.tile_id);
  }
  await assert.rejects(buildDataset({...settings, validationRayBudget:-1}), /ray budget/);
});

test('plant coverage follows final crop returns through occlusion, dropout and clustered copies', async () => {
  const {field} = await import('../trainer/field.js');
  const {makeRecipe} = await import('../trainer/data.js');
  const {getSensor} = await import('../trainer/sensors.js');
  const recipe = makeRecipe(921, true, getSensor('os1-64'), 'tomato');
  const clean = {...recipe, points:12000, boards:false, scanNoise:undefined};
  const clear = field(clean);
  const blocked = field({...clean, boards:true});
  assert.ok(blocked.plantReturns.some((count,i) => count < clear.plantReturns[i]));
  assert.ok(blocked.plantReturns.every((count,i) => count <= clear.plantReturns[i]));
  const noisy = {...clean, boards:true, scanNoise:{seed:27, xy:1, z:1, density:24, gaps:4, stray:.35, cluster:18}};
  const scan = field(noisy);
  const bare = field({...noisy, ground:false});
  assert.deepEqual(scan.plantReturns, bare.plantReturns);
  for (const tile of [clear, blocked, scan, bare]) {
    const counts = tile.plantReturns;
    assert.equal(counts.length, tile.labels.boxes.length);
    assert.equal(counts.reduce((a,b) => a+b, 0), tile.counts[1]);
    assert.deepEqual(tile.coverage, {
      zero:counts.filter(n => n === 0).length,
      oneToFour:counts.filter(n => n > 0 && n < 5).length,
      fiveOrMore:counts.filter(n => n >= 5).length
    });
  }
});
