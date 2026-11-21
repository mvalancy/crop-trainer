// Select cutoffs on development fields, freeze them, then evaluate once on separate fields.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {buildDataset,detectionStages,features,matchCenters,targetCenters} from '../../trainer/models/data.js';
import {trainNetworkCPU} from '../../trainer/models/neural.js';
import {scoreSavedWeights,trainerId,weightArtifact} from '../../trainer/models/network.js';
import {tomatoTerrainTraining as settings,tomatoTestRecipe} from './tomato-terrain-controls.mjs';

const trainSeed = 181381;
const development = [31077211,31211833,31422659,31566107];
const confirmation = [31800121,32077547,32511809,32721439,32988457,33120931];
const layouts = ['reference','os1-64'], stages = ['seedling','branching'], modes = ['absolute','local-ground'];
const allThresholds = modes.flatMap(mode => Array.from({length:19}, (_,i) => ({mode,percent:5*(i+1)})));
const control = {mode:'absolute',percent:50};
const id = arm => arm.mode + '-' + arm.percent;
const devOnly = process.argv[2] === 'development';
if (process.argv.length > (devOnly ? 3 : 2)) throw Error('Use no argument for the full replay, or development to stop after cutoff selection.');
assert.equal(new Set([...development,...confirmation]).size, development.length + confirmation.length);

const models = new Map(), fitting = [];
let trainingControl;
for (const mode of modes) {
  const config = {...settings,seed:trainSeed,featureMode:mode};
  const t = performance.now(), set = await buildDataset(config), ready = performance.now();
  if (trainingControl) {
    assert.deepEqual(set.manifest,trainingControl.manifest);
    assert.deepEqual(set.Y,trainingControl.Y);
  } else trainingControl = set;
  assert.ok(set.manifest.every(tile => !development.includes(tile.seed) && !confirmation.includes(tile.seed)));
  const fit = await trainNetworkCPU(set.X,set.Y,{...config,dims:set.dims});
  const model = weightArtifact({settings:config,scaling:set.scaling,weights:fit.weights,
    trainer:trainerId(config),epochs:fit.epochsCompleted,stats:set.stats});
  assert.equal(fit.epochsCompleted,settings.epochs);
  fitting.push({mode,samples:set.Y.length,trainingFields:set.stats.fieldSeeds.training,
    dataMs:ready-t,fitMs:performance.now()-ready});
  models.set(mode,model);
}

function run(seeds, arms, distances) {
  const timings = {generationMs:0,featuresAndInferenceMs:0,spacingAndMatchingMs:0};
  const scans = [];
  for (const seed of seeds) for (const stage of stages) {
    let paired;
    for (const layout of layouts) {
      const t = performance.now(), scan = field(tomatoTestRecipe(seed,layout,stage,true)), truth = targetCenters(scan.labels.boxes);
      assert.equal(scan.sampledRays,60000);
      if (paired) assert.deepEqual(truth,paired); else paired = truth;
      timings.generationMs += performance.now() - t;
      let positions;
      const counts = {};
      for (const mode of new Set(arms.map(arm => arm.mode))) {
        const start = performance.now(), model = models.get(mode);
        const rows = features({xyz:scan.xyz},settings.minimumHeight,settings.peakAveraging,mode);
        if (positions) assert.deepEqual(rows.pos,positions); else positions = rows.pos;
        const probabilities = scoreSavedWeights(rows.X,model,settings.peakAveraging,mode);
        timings.featuresAndInferenceMs += performance.now() - start;
        const scoring = performance.now();
        for (const arm of arms.filter(a => a.mode === mode)) {
          const pins = detectionStages(rows,probabilities,arm.percent/100,model.pinSeparation).selected;
          counts[id(arm)] = distances.map(cm => {
            const tp = matchCenters(pins,truth,cm/100).count;
            return {cm,tp,fp:pins.length-tp,fn:truth.length-tp};
          });
        }
        timings.spacingAndMatchingMs += performance.now() - scoring;
      }
      scans.push({seed,stage,layout,tileId:scan.labels.tile_id,targets:truth.length,proposals:positions.length,counts});
    }
  }
  return {timings,scans};
}

function pool(scans,arm,cm) {
  let tp=0, fp=0, fn=0;
  for (const scan of scans) {
    const row = scan.counts[id(arm)].find(row => row.cm === cm);
    tp += row.tp; fp += row.fp; fn += row.fn;
  }
  return {cm,tp,fp,fn,precision:tp+fp ? tp/(tp+fp) : null,recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};
}
function summaries(scans,arms,distances) {
  return arms.map(arm => ({
    ...arm,
    seedling:distances.map(cm => pool(scans.filter(s => s.stage==='seedling'),arm,cm)),
    byStageAndLayout:stages.flatMap(stage => layouts.map(layout => ({
      stage,layout,scores:distances.map(cm => pool(scans.filter(s => s.stage===stage && s.layout===layout),arm,cm))
    })))
  }));
}
function branchPrecision(summary, layout) {
  return summary.byStageAndLayout.find(s => s.stage === 'branching' && s.layout === layout)
    .scores.find(s => s.cm === 15).precision;
}
function meetsLimits(summary,controlSummary) {
  return layouts.every(layout => {
    const p = branchPrecision(summary,layout), base = branchPrecision(controlSummary,layout);
    return p !== null && base !== null && p >= base - .01;
  });
}
function ordered(a,b) {
  return b.seedling[0].f1 - a.seedling[0].f1 ||
    Math.abs(a.percent-50) - Math.abs(b.percent-50) ||
    b.percent - a.percent ||
    modes.indexOf(a.mode) - modes.indexOf(b.mode);
}
function armOnly(row) {
  return row ? {mode:row.mode,percent:row.percent} : null;
}

const dev = run(development,allThresholds,[15]);
const grid = summaries(dev.scans,allThresholds,[15]).sort(ordered);
const baseline = grid.find(arm => id(arm) === id(control));
const decisions = ['overall',...modes].map(mode => {
  const eligible = grid.filter(arm => mode === 'overall' || arm.mode === mode);
  return {mode,constrained:armOnly(eligible.find(arm => meetsLimits(arm,baseline))),
    unconstrained:armOnly(eligible[0])};
});
// Selection is entirely determined before any confirmation scan is generated.
const frozen = [control,...decisions.flatMap(d => [d.constrained,d.unconstrained])].filter(Boolean);
const unique = [...new Map(frozen.map(arm => [id(arm),arm])).values()];
const output = {domain:'synthetic',backend:'CPU',node:process.version,cpu:cpus()[0]?.model,
  settings,trainSeed,fitting,layouts,development,confirmation,decisions,
  developmentResults:{timings:dev.timings,scans:dev.scans,grid}};
if (!devOnly) {
  const distances = [7.5,10,15], check = run(confirmation,unique,distances);
  const results = summaries(check.scans,unique,distances);
  const reference = results.find(arm => id(arm) === id(control));
  output.confirmationResults = {timings:check.timings,scans:check.scans,
    summary:results.map(s => ({...s,meetsBranchingLimits:meetsLimits(s,reference)}))};
}
console.log(JSON.stringify(output));
