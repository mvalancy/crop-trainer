// End-to-end check of the two public CPU commands and the generator's PLY format.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {field} from './trainer/field.js';
import {encodePly} from './trainer/ply.js';

const execute = promisify(execFile);
const trainEntry = fileURLToPath(new URL('./run.mjs', import.meta.url));
const scoreEntry = fileURLToPath(new URL('./score-scan.mjs', import.meta.url));

export async function preflight() {
  const cwd = await mkdtemp(join(tmpdir(), 'crop-trainer-preflight-'));
  try {
    const start = performance.now();
    await execute(process.execPath, [trainEntry, 'train', 'training.json', '--weights', 'weights.json'], {cwd});
    const train = JSON.parse(await readFile(join(cwd, 'training.json'), 'utf8'));
    const validation = train.recipeManifest.filter(tile => tile.split === 'validation');
    assert.equal(validation.length, train.stats.valTiles);
    assert.ok(validation.length > 0, 'The training report must contain held-out scans.');
    const replayStart = performance.now();
    const rows = [];

    for (const tile of validation) {
      const scan = field(tile.recipe);
      assert.equal(scan.labels.tile_id, tile.tile_id, 'The recipe must regenerate the recorded scan ID.');
      const id = tile.tile_id;
      const expected = train.tiles.find(t => t.tile_id === id);
      const labels = {...scan.labels, crop_returns_per_box: scan.plantReturns};
      await writeFile(join(cwd, id+'.ply'), encodePly(scan.xyz));
      await writeFile(join(cwd, id+'.labels.json'), JSON.stringify(labels));
      await execute(process.execPath, [scoreEntry, 'weights.json', id+'.ply', id+'.report.json',
        '--labels', id+'.labels.json'], {cwd});
      const result = JSON.parse(await readFile(join(cwd, id+'.report.json'), 'utf8'));
      assert.equal(result.pointCount, scan.xyz.length/3);
      assert.equal(result.references.length, scan.labels.boxes.length);
      const counts = result.evaluation.scores.map(({cm, tp, fp, fn}) => ({cm, tp, fp, fn}));
      assert.deepEqual(counts, expected.byTolerance, 'Field CLI and training validation disagree for '+id);
      const stages = result.stages15cm.map(({stage, count, matched}) => ({stage, count, matched}));
      assert.deepEqual(stages, expected.stages15cm, 'Detector stages disagree for '+id);
      const missed15 = [];
      for (const [index, pin] of result.evaluation.pinByReference15.entries()) {
        if (pin === -1) missed15.push(index);
      }
      assert.deepEqual(missed15, expected.missesByTolerance.find(row => row.cm === 15).boxIndices,
        'The two commands missed different plants at 15 cm for '+id);
      rows.push({
        tile: id, seed: tile.seed, ground: tile.recipe.ground, points: result.pointCount, plants: result.references.length,
        pins: result.pins.length, baselinePins: result.baselinePins.length, scores: result.evaluation.scores,
        baselineScores: result.baselineEvaluation.scores
      });
    }

    return {
      task: 'synthetic-field-preflight', passed: true, backend: train.backend, node: process.version,
      platform: process.platform, architecture: process.arch,
      crop: train.crop, seed: train.seed, epochs: train.epochs, meanF1: train.meanF1,
      trainingTimings: train.timings, replayMs: Math.round(performance.now()-replayStart),
      totalMs: Math.round(performance.now()-start), tiles: rows
    };
  } finally {
    await rm(cwd, {recursive:true, force:true});
  }
}
