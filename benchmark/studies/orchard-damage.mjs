// From the repository root: node benchmark/studies/orchard-damage.mjs > orchard-damage.json
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {makeRecipe, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {scoreOrchardScan} from './orchard-measurements.mjs';
import {getSensor} from '../../trainer/generator/sensors.js';

const design = {
  seeds:[7301063,7412177,7523089,7634213,7745399,7856483,7967597,8078621],
  forms:['central-leader','open-vase'], canopies:['leafy','dormant'], layouts:['reference','os1-64'],
  plantArchitecture:2, rays:60000, ground:true, weeds:false, sticks:false, boards:false, scanNoise:null,
  scoreRadiiM:MATCH_RADII_METERS, diagnosticRadiusM:.40
};
const methods = ['orchard','height'];
const timingsMs = {generation:0, orchard:0, height:0, matching:0};
function timed(stage, operation) {
  const start = performance.now();
  const result = operation();
  timingsMs[stage] += performance.now() - start;
  return result;
}

function damageOutcomes(intact, damaged) {
  const counts = {retained:0, gained:0, missedBoth:0, lostNear:0, lostFar:0};
  for (const [i,matched] of intact.matched15.entries()) {
    if (damaged.matched15[i]) {
      if (matched) counts.retained++;
      else counts.gained++;
    } else if (!matched) counts.missedBoth++;
    else if (damaged.nearestM[i] !== null && damaged.nearestM[i] <= design.diagnosticRadiusM) counts.lostNear++;
    else counts.lostFar++;
  }
  return counts;
}

function summarize(pairs) {
  return Object.fromEntries(methods.map(method => {
    const summary = {};
    for (const condition of ['healthy','damaged']) {
      const scans = pairs.map(pair => pair[condition].scores[method]);
      const scores = MATCH_RADII_METERS.map((radius,i) => {
        const tp = scans.reduce((sum,scan) => sum + scan[i].tp,0);
        const fp = scans.reduce((sum,scan) => sum + scan[i].fp,0);
        const fn = scans.reduce((sum,scan) => sum + scan[i].fn,0);
        return {cm:radius*100, tp, fp, fn, f1:2*tp/(2*tp+fp+fn)};
      });
      const countMae = scans.reduce((sum,[{fp,fn}]) => sum + Math.abs(fp-fn),0) / scans.length;
      summary[condition] = {scores,countMae};
    }
    const totals = {};
    for (const pair of pairs) {
      for (const [key,count] of Object.entries(pair.transitions15[method])) totals[key] = (totals[key] ?? 0)+count;
    }
    summary.transitions15 = totals;
    return [method, summary];
  }));
}

const pairs = [];
for (const seed of design.seeds) {
  let planting;
  for (const form of design.forms) for (const canopy of design.canopies) for (const layout of design.layouts) {
    const arms = {};
    let intactScan;
    for (const condition of ['healthy','damaged']) {
      const recipe = makeRecipe(seed,design.ground,getSensor(layout),'apple',design.plantArchitecture,form,condition);
      const scan = timed('generation',() => field({...recipe, points:design.rays, appleCanopy:canopy,
        weeds:design.weeds, sticks:design.sticks, boards:design.boards, scanNoise:design.scanNoise}));
      const truth = scan.labels.boxes.map(box => box.base_xy_m);
      if (!planting) {
        planting = truth;
        // Nonoverlapping diagnostic circles prevent a pin from being counted near two trunks.
        for (const [i,[x,y]] of truth.entries()) for (const [px,py] of truth.slice(i+1)) {
          assert.ok(Math.hypot(px-x,py-y) > 2*design.diagnosticRadiusM);
        }
      }
      assert.deepEqual(truth,planting);
      assert.equal(scan.sampledRays,design.rays);
      assert.equal(scan.cls.length,design.rays);
      if (!intactScan) intactScan = scan;
      else {
        for (let i=0;i<scan.cls.length;i++) {
          assert.equal(scan.xyz[3*i],intactScan.xyz[3*i]);
          assert.equal(scan.xyz[3*i+1],intactScan.xyz[3*i+1]);
          if (!scan.cls[i] && !intactScan.cls[i]) assert.equal(scan.xyz[3*i+2],intactScan.xyz[3*i+2]);
        }
      }
      arms[condition] = {tileId:scan.labels.tile_id, byMethod:scoreOrchardScan(scan,truth,timed)};
    }
    const pair = {seed,form,canopy,layout,trees:planting.length,transitions15:{}};
    for (const method of methods) {
      pair.transitions15[method] = damageOutcomes(arms.healthy.byMethod[method],arms.damaged.byMethod[method]);
      assert.equal(Object.values(pair.transitions15[method]).reduce((s,n) => s+n,0),planting.length);
    }
    for (const [condition,arm] of Object.entries(arms)) {
      pair[condition]={tileId:arm.tileId,scores:Object.fromEntries(methods.map(method => [method,arm.byMethod[method].scores])),
        nearestPinMByTree:Object.fromEntries(methods.map(method => [method,arm.byMethod[method].nearestM]))};
    }
    pairs.push(pair);
  }
}

const grouped = key => Object.fromEntries([...new Set(pairs.map(pair => pair[key]))].map(value =>
  [value,summarize(pairs.filter(pair => pair[key] === value))]));
console.log(JSON.stringify({domain:'synthetic', backend:'Node CPU',host:{node:process.version,cpu:cpus()[0]?.model},
  design,timingsMs,overall:summarize(pairs),byForm:grouped('form'),byCanopy:grouped('canopy'),
  byLayout:grouped('layout'),bySeed:grouped('seed'),pairs},null,2));
