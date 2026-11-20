import test from 'node:test';
import assert from 'node:assert/strict';
import {densitySnapshot, pairDensityScores} from '../benchmark/density.js';

function experiment(points) {
  const recipe = {seed:19, ground:true, sampling:{key:'os1-64'}, points};
  return {
    settings:{crop:'artichoke', minimumHeight:.065, validationRayBudget:points},
    datasets:[{stats:{generator:'v1'}, recipeManifest:[
      {split:'train', tile_id:'train-scan'},
      {split:'validation', tile_id:'val-'+points, recipe}
    ]}],
    rows:[{seed:12, trainingRayBudget:'alternating', epochs:40, threshold:.5, datasetIndex:0,
      meanF1:points === 12000 ? .65 : .79}]
  };
}

test('pair sparse and dense validation in either order', () => {
  const sparse = densitySnapshot(experiment(12000)), dense = densitySnapshot(experiment(60000));
  const paired = [{seed:12, trainingRayBudget:'alternating', sparse:.65, dense:.79, lower:.65}];
  assert.deepEqual(pairDensityScores(sparse, dense), paired);
  assert.deepEqual(pairDensityScores(dense, sparse), paired);
  assert.deepEqual(pairDensityScores(sparse, sparse), []);
  assert.deepEqual(pairDensityScores(sparse, {...dense, scores:[null]}), []);
  assert.equal(densitySnapshot(experiment(0)), null);
});

test('pair only the same training scans, held-out plantings and fit settings', () => {
  const sparse = densitySnapshot(experiment(12000));
  for (const change of [
    r => r.datasets[0].recipeManifest[0].tile_id = 'another-scan',
    r => r.datasets[0].recipeManifest[1].recipe.seed++,
    r => r.datasets[0].recipeManifest[1].recipe.sampling.key = 'reference',
    r => r.rows[0].epochs++,
    r => r.datasets[0].stats.generator = 'v2'
  ]) {
    const other = experiment(60000);
    change(other);
    assert.deepEqual(pairDensityScores(sparse, densitySnapshot(other)), []);
  }
});
