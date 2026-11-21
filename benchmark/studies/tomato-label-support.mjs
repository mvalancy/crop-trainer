// Measure whether a distance-labeled tomato peak contains returns from that plant.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {field} from '../../trainer/generator/field.js';
import {buildDataset, features, PEAK_GRID_SIZE, targetCenters} from '../../trainer/models/data.js';
import {settings} from './tomato-soil-controls.mjs';

import {indexReturns} from './tomato-return-cells.mjs';

const seeds = [443731, 687139];

export function measureScan(scan, groups) {
  const index = indexReturns(scan);
  const centers = targetCenters(scan.labels.boxes);
  const peakCells = [];
  const peaks = features(scan,settings.minimumHeight,settings.peakAveraging,settings.featureMode,
    (x,y) => peakCells.push(x + y*PEAK_GRID_SIZE));
  for (const [i,[x,y]] of peaks.pos.entries()) {
    let target = -1, nearest = .095 ** 2;
    for (const [k,[cx,cy]] of centers.entries()) {
      const distance = (x-cx)**2 + (y-cy)**2;
      if (distance < nearest) { target = k; nearest = distance; }
    }
    if (target < 0) continue;
    const plantForm = scan.labels.boxes[target].plant_form;
    const ground = scan.p.ground;
    const key = plantForm + ':' + ground;
    if (!groups.has(key)) {
      groups.set(key,{plantForm,ground,eligible:0,noTargetAnywhere:0,noTargetInPatch:0,
        noCropInPatch:0,tallestFromTarget:0,tallestFromSoil:0});
    }
    const group = groups.get(key);
    group.eligible++;
    if (scan.plantReturns[target] === 0) group.noTargetAnywhere++;

    const owner = target+1;
    let hasTarget = false, hasCrop = false, tallest = -1, height = -Infinity;
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
      const j = peakCells[i] + dx + PEAK_GRID_SIZE*dy;
      const owners = index.ownerSets.get(j);
      if (owners) hasCrop = true;
      if (owners?.has(owner)) hasTarget = true;
      if (index.heights[j] > height) { tallest = j; height = index.heights[j]; }
    }
    if (!hasTarget) group.noTargetInPatch++;
    if (!hasCrop) group.noCropInPatch++;
    assert.ok(tallest >= 0,'A height peak needs at least one measured return in its center patch.');
    if (index.topOwners[tallest] === owner) group.tallestFromTarget++;
    if (index.topClasses[tallest] === 0) group.tallestFromSoil++;
  }
}

async function audit(seed) {
  const start = performance.now();
  const groups = new Map(), scanIds=[];
  const dataset = await buildDataset({...settings,seed,sampleLimit:600,auditPositiveSampling:true,
    generate:(recipe,step) => field(recipe,undefined,{includePlantIds:step.split === 'Training'}),
    onScan(scan,step) {
      if (step.split !== 'Training') return;
      measureScan(scan,groups);
      scanIds.push(scan.labels.tile_id);
    }
  });
  for (const group of dataset.stats.positiveExamplesByFormSoil) {
    assert.equal(groups.get(group.plantForm + ':' + group.ground)?.eligible ?? 0, group.available);
  }
  return {seed,scanIds,elapsedMs:Math.round(performance.now()-start),groups:[...groups.values()]};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cohorts = [];
  for (const seed of seeds) cohorts.push(await audit(seed));
  console.log(JSON.stringify({seeds,settings,cohorts},null,2));
}
