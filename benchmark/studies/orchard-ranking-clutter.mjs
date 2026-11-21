// Are low returns from weeds or boards enough to change an apple pin?
import assert from 'node:assert/strict';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {makeRecipe, targetCenters, features, detectionStages} from '../../trainer/models/data.js';
import {detectOrchardBases, isLowOrchardReturn} from '../../trainer/models/orchard.js';
import {evaluatePins} from '../../trainer/field-test/references.js';

const seeds = [20107139, 20218251, 20329363, 20440475];
const layouts = ['reference', 'os1-64'];
const conditions = ['clear', 'weeds', 'boards'];
const classNames = ['other', 'crop', 'weeds', 'other', 'boards'];
const local = ([localX, localY]) => ({localX, localY});
const timingsMs = {generation:0, height:0, support:0, lowReturns:0, attribution:0, scoring:0};
function timed(stage, action) {
  const start = performance.now();
  const result = action();
  timingsMs[stage] += performance.now() - start;
  return result;
}
function orchardPins(xyz, ranking) {
  return detectOrchardBases(xyz, {ranking}).pins.map(p => local([p.x, p.y]));
}
function heightPins(xyz) {
  const peaks = features({xyz}, .065);
  const heights = peaks.pos.map((_, i) => peaks.X[13*i]);
  return detectionStages(peaks, heights, 0, 1.05).selected.map(local);
}

function measure(scan, condition, references) {
  const {xyz, cls} = scan;
  // Finish all blind predictions before consulting the simulator's point classes.
  const pins = {
    height: timed('height', () => heightPins(xyz)),
    support: timed('support', () => orchardPins(xyz, 'support')),
    lowReturns: timed('lowReturns', () => orchardPins(xyz, 'low-wood'))
  };
  const lowReturnCounts = {crop:0, weeds:0, boards:0, other:0};
  const masked = xyz.slice();
  for (let i=0; i<cls.length; i++) {
    if (!isLowOrchardReturn(xyz[3*i+2])) continue;
    const origin = classNames[cls[i]] ?? 'other';
    lowReturnCounts[origin]++;
    // Offline attribution only. These two classes are unavailable to a field detector.
    if (origin==='weeds' || origin==='boards') masked[3*i+2] = 0;
  }
  pins.maskedClutter = condition==='clear' ? pins.lowReturns : timed('attribution', () => {
    assert.deepEqual(orchardPins(masked, 'support'), pins.support, 'Mask changed original support');
    return orchardPins(masked, 'low-wood');
  });
  const scores = timed('scoring', () => Object.fromEntries(Object.entries(pins)
    .map(([name, points]) => [name, evaluatePins(points, references)])));
  return {tile:scan.labels.tile_id, trees:references.length, lowReturnCounts, scores};
}

function pool(scans, method) {
  return [7.5, 10, 15].map((cm, i) => {
    let tp=0, fp=0, fn=0;
    for (const scan of scans) {
      const row=scan.scores[method].scores[i];
      assert.equal(row.cm, cm);
      tp+=row.tp; fp+=row.fp; fn+=row.fn;
    }
    return {cm,tp,fp,fn,f1:2*tp+fp+fn ? 2*tp/(2*tp+fp+fn) : null,
      precision:tp+fp ? tp/(tp+fp) : null,recall:tp+fn ? tp/(tp+fn) : null};
  });
}
const scans = [];
for (const seed of seeds) {
  let seedTruth;
  for (const layout of layouts) {
    let clear;
    for (const condition of conditions) {
      const recipe={...makeRecipe(seed,true,getSensor(layout),'apple',4,'central-leader','healthy'),
        appleCanopy:'leafy', points:60000, scanNoise:null, sticks:false,
        weeds:condition==='weeds', boards:condition==='boards'};
      const scan=timed('generation', () => field(recipe));
      assert.equal(scan.sampledRays, 60000);
      const truth=targetCenters(scan.labels.boxes);
      if (seedTruth) assert.deepEqual(truth, seedTruth);
      else seedTruth = truth;
      if (!clear) clear=scan.xyz;
      else {
        assert.equal(scan.xyz.length,clear.length);
        for (let i=0; i<clear.length; i+=3) {
          assert.equal(scan.xyz[i],clear[i]);
          assert.equal(scan.xyz[i+1],clear[i+1]);
        }
      }
      scans.push({seed,layout,condition,...measure(scan,condition,truth.map(local))});
    }
  }
}
const summary=Object.fromEntries(conditions.map(condition => {
  const subset=scans.filter(scan => scan.condition===condition);
  return [condition,Object.fromEntries(['height','support','lowReturns','maskedClutter'].map(method=>[method,pool(subset,method)]))];
}));
console.log(JSON.stringify({domain:'synthetic',seeds,layouts,conditions,timingsMs,summary,scans}, null, 2));
