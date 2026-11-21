import {DENSITY_BUDGETS} from '../trainer/generator/sensors.js?v=dense1';

export const CLASSIC_TRAINING_PAIR = '12k-60k';
export const TRAINING_RAY_PAIRS = new Map([
  [CLASSIC_TRAINING_PAIR, DENSITY_BUDGETS],
  ['30k-1m', [30000, 1000000]]
]);

// Version the tab-local snapshot key when the fitter, features or scorer change.
export const DENSITY_HISTORY_KEY = 'crop-trainer-density-f1-v1';
export const HEIGHT_HISTORY_KEY = 'crop-trainer-peak-height-f1-v1';

export function densitySnapshot(report) {
  const {settings, datasets, rows} = report;
  if (![12000, 60000].includes(settings.validationRayBudget)) return null;
  const experiment = [settings.crop, settings.minimumHeight];
  if (settings.featureMode === 'local-ground') experiment.push(['featureMode','local-ground']);
  if (settings.peakAveraging === 'occupied') experiment.push(['peakAveraging','occupied']);
  const scores = rows.map(row => {
    const {recipeManifest, stats} = datasets[row.datasetIndex];
    const scans = recipeManifest.map(tile => {
      if (tile.split === 'train') return tile.tile_id;
      const {points, plantArchitecture = 1, ...planting} = tile.recipe;
      if (plantArchitecture !== 1) planting.plantArchitecture = plantArchitecture;
      return planting;
    });
    experiment.push([row.seed, row.trainingRayBudget, row.epochs, row.threshold, stats.generator, scans]);
    const score = {seed:row.seed, trainingRayBudget:row.trainingRayBudget, f1:row.meanF1};
    if (report.comparison === 'heights') {
      experiment.push(['heights', row.minimumHeight, row.model, row.backend]);
      score.minimumHeight = row.minimumHeight;
    }
    return score;
  });
  return {signature:JSON.stringify(experiment), budget:settings.validationRayBudget, scores};
}

export function pairDensityScores(current, previous) {
  if (!current || !previous || previous.signature !== current.signature ||
      previous.budget !== (current.budget === 12000 ? 60000 : 12000) ||
      !Array.isArray(previous.scores) || previous.scores.length !== current.scores.length) return [];
  const paired = [];
  for (const [i, row] of current.scores.entries()) {
    const other = previous.scores[i];
    if (!other || other.seed !== row.seed || other.trainingRayBudget !== row.trainingRayBudget || other.minimumHeight !== row.minimumHeight ||
        !Number.isFinite(other.f1) || other.f1 < 0 || other.f1 > 1) return [];
    const [sparse, dense] = current.budget === 12000 ? [row.f1, other.f1] : [other.f1, row.f1];
    const result = {seed:row.seed, trainingRayBudget:row.trainingRayBudget, sparse, dense, lower:Math.min(sparse,dense)};
    if (row.minimumHeight !== undefined) result.minimumHeight = row.minimumHeight;
    paired.push(result);
  }
  return paired;
}
