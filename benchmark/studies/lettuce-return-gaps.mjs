// Pair equal counts of scattered and neighboring missing returns on each synthetic romaine plant.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {buildDataset, makeRecipe, targetCenters} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {trainerId, weightArtifact} from '../../trainer/models/network.js';
import {runFieldTest} from '../../trainer/field-test/score-scan.js';

const seeds = {
  screen: [196736221, 1821007919, 1303396387, 4125350911, 1679776289, 3869453801],
  confirm: [3374781439, 882515303, 3159306839, 2200363103, 1773186983, 1404650881]
};
const layouts = ['reference', 'os1-64'];
const fraction = .20;
const settings = {
  seed:140011317, crop:'lettuce', plantArchitecture:3, plantForm:'romaine', plantCondition:'healthy',
  sensorMode:'mixed', trainingRayBudget:30000, validationRayBudget:30000, trainFields:6, valFields:1,
  minimumHeight:.035, peakAveraging:'zero-filled', featureMode:'absolute', epochs:40, lr:.25,
  initSeed:12345, hiddenLayers:[4], activation:'tanh', optimizer:'sgd', batchSize:0, threshold:.5
};

function lossRandomizer(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function pairedClouds(scan, seed) {
  const byPlant = new Map();
  for (let i = 0; i < scan.cls.length; i++) {
    if (scan.cls[i] !== 1) continue;
    const id = scan.plantIds[i];
    assert(id > 0);
    if (!byPlant.has(id)) byPlant.set(id, []);
    byPlant.get(id).push(i);
  }

  const scattered = new Uint8Array(scan.cls.length);
  const patch = new Uint8Array(scan.cls.length);
  const {xyz} = scan;
  let lost = 0;
  for (const [id, points] of byPlant) {
    const count = Math.round(points.length * fraction);
    lost += count;
    const draw = lossRandomizer(seed ^ Math.imul(id, 2654435761));
    const pivot = points[Math.floor(draw() * points.length)];
    const distance = i => (xyz[3*i] - xyz[3*pivot])**2 + (xyz[3*i+1] - xyz[3*pivot+1])**2;
    const nearest = [...points].sort((a,b) => distance(a) - distance(b) || a - b);
    for (let i = 0; i < count; i++) {
      patch[nearest[i]] = 1;
      // Sample without replacement from this plant, including each return at most once.
      const j = i + Math.floor(draw() * (points.length-i));
      [points[i], points[j]] = [points[j], points[i]];
      scattered[points[i]] = 1;
    }
  }

  const retain = mask => xyz.filter((_, i) => !mask[Math.floor(i/3)]);
  const clouds = {complete:xyz, scattered:retain(scattered), patch:retain(patch)};
  assert.equal(clouds.scattered.length, xyz.length - lost*3);
  assert.equal(clouds.patch.length, clouds.scattered.length);
  return clouds;
}

function pooled(fields, detector) {
  return fields[0][detector].map(({cm}, i) => {
    const total = key => fields.reduce((sum, f) => sum + f[detector][i][key], 0);
    const tp = total('tp'), fp = total('fp'), fn = total('fn');
    return {cm, tp, fp, fn, precision:tp/(tp+fp), recall:tp/(tp+fn), f1:2*tp/(2*tp+fp+fn)};
  });
}

let start = performance.now();
const set = await buildDataset(settings);
const timingMs = {trainingData:performance.now()-start, fit:0, testData:0, masks:0, scoring:0};
const heldOut = new Set(Object.values(seeds).flat());
assert(set.manifest.every(tile => !heldOut.has(tile.seed)));
start = performance.now();
const fit = await trainNetworkCPU(set.X, set.Y, {...settings, dims:set.dims});
const model = weightArtifact({settings, trainer:trainerId(settings), epochs:fit.epochsCompleted, weights:fit.weights, scaling:set.scaling});
timingMs.fit = performance.now()-start;
const fields = [];
const summary = [];
for (const [split, fieldSeeds] of Object.entries(seeds)) {
  for (const sensor of layouts) {
    for (const seed of fieldSeeds) {
      start = performance.now();
      const recipe = {...makeRecipe(seed, true, getSensor(sensor), 'lettuce', 3, 'romaine', 'healthy'),
        weeds:false, sticks:false, boards:false, scanNoise:null, points:30000};
      const scan = field(recipe, undefined, {includePlantIds:true});
      const labels = {filename:'centers.csv', text:'x,y\n'+targetCenters(scan.labels.boxes).map(xy=>xy.join(',')).join('\n')};
      timingMs.testData += performance.now()-start;
      start = performance.now();
      const clouds = pairedClouds(scan, seed);
      timingMs.masks += performance.now()-start;
      for (const [condition, xyz] of Object.entries(clouds)) {
        start = performance.now();
        const {evaluation, baselineEvaluation} = runFieldTest({model, xyz, labels});
        timingMs.scoring += performance.now()-start;
        fields.push({split, sensor, seed, condition, points:xyz.length/3, tileId:scan.labels.tile_id,
          learned:evaluation.scores, peaks:baselineEvaluation.scores});
      }
    }
    for (const condition of ['complete','scattered','patch']) {
      const paired = fields.filter(f=>f.split === split && f.sensor === sensor && f.condition === condition);
      summary.push({split, sensor, condition, learned:pooled(paired,'learned'), peaks:pooled(paired,'peaks')});
    }
  }
}
console.log(JSON.stringify({source:'synthetic', machine:{cpu:cpus()[0]?.model, node:process.version},
  settings, seeds, layouts, fraction, timingMs,
  modelSha256:createHash('sha256').update(JSON.stringify(model)).digest('hex'), summary, fields}, null, 2));
