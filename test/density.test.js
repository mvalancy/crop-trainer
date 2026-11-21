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

test('density comparisons replay an unversioned scan as v1 and keep v2 separate', () => {
  const archived = densitySnapshot(experiment(12000));
  const dense = experiment(60000);
  const recipe = dense.datasets[0].recipeManifest[1].recipe;
  recipe.plantArchitecture = 1;
  assert.equal(pairDensityScores(archived, densitySnapshot(dense)).length, 1);
  recipe.plantArchitecture = 2;
  assert.deepEqual(pairDensityScores(archived, densitySnapshot(dense)), []);
});

test('pair peak heights across ray budgets only for the same fit', () => {
  function heightRun(budget, height) {
    const report = experiment(budget);
    report.comparison = 'heights';
    delete report.settings.minimumHeight;
    Object.assign(report.rows[0], {minimumHeight:height, model:'neural', backend:'CPU', trainingRayBudget:0});
    return report;
  }
  const sparse = densitySnapshot(heightRun(12000, .035));
  const dense = densitySnapshot(heightRun(60000, .035));
  const [result] = pairDensityScores(dense, sparse);
  assert.equal(result.minimumHeight, .035);
  assert.deepEqual([result.sparse, result.dense, result.lower], [.65, .79, .65]);
  assert.deepEqual(pairDensityScores(sparse, densitySnapshot(heightRun(60000, .065))), []);
  assert.deepEqual(pairDensityScores(sparse, densitySnapshot(experiment(60000))), []);
  const otherBackend = heightRun(60000, .035);
  otherBackend.rows[0].backend = 'WebGPU';
  assert.deepEqual(pairDensityScores(sparse, densitySnapshot(otherBackend)), []);
});

test('million-ray training uses the existing independent validation-budget history', () => {
  const experimentAt = (validation, training) => {
    const run=experiment(validation);
    run.rows[0].trainingRayBudget=training;
    run.datasets[0].recipeManifest[0].tile_id='train-'+training;
    return densitySnapshot(run);
  };
  const sparse=experimentAt(12000,1000000);
  assert.equal(pairDensityScores(sparse,experimentAt(60000,1000000))[0].trainingRayBudget,1000000);
  assert.deepEqual(pairDensityScores(sparse,experimentAt(60000,60000)),[]);
  assert.equal(experimentAt(1000000,1000000),null);
});
