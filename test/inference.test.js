import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDataset, features, validateModel} from '../trainer/models/data.js';
import {field} from '../trainer/generator/field.js';
import {runFieldTest} from '../trainer/field-test/score-scan.js';
import {detectScan} from '../trainer/field-test/inference.js';
import {predictNetwork, trainNetworkCPU} from '../trainer/models/neural.js';

function weights(overrides = {}) {
  return {
    format:'crop-trainer-weights-v1', featureSchema:'crop-peak-13-v1',
    inputs:13, output:'sigmoid', crop:'lettuce', hiddenLayers:[], activation:'tanh',
    scaling:{means:Array(13).fill(0), std:Array(13).fill(1)},
    weights:Array(14).fill(0), threshold:.5, minimumHeight:.035, pinSeparation:.125,
    ...overrides
  };
}

test('scoring a held-out XYZ scan using exported weights exactly reproduces in-app validation', async () => {
  const set = await buildDataset({seed:18, trainFields:2, valFields:1, minimumHeight:.035});
  const fit = await trainNetworkCPU(set.X, set.Y, {dims:13, epochs:8});
  const result = await validateModel(set,fit.weights,{predictScores:predictNetwork});
  const model = weights({hiddenLayers:[4], weights:Array.from(fit.weights), scaling:set.scaling});
  for (const tile of set.validation) {
    const scan = field(tile.recipe);
    const expected = result.previews.get(tile.tile_id);
    const run = detectScan(scan.xyz, model);
    assert.equal(run.pointCount, scan.xyz.length/3);
    assert.equal(run.proposalCount, expected.stages.proposals.length);
    assert.equal(run.acceptedCount, expected.stages.accepted.length);
    assert.ok(run.pins.length > 0);
    assert.deepEqual(run.pins.map(p => [p.x,p.y]), expected.predictions);
    // Freeze the learned weights, labels and XY. Tilt the original Z values
    // in double precision to isolate the effect of the measured plane.
    const tilted = Float64Array.from(scan.xyz);
    for (let i=0; i<tilted.length; i+=3) tilted[i+2] += .05*tilted[i] - .02*tilted[i+1];
    const corrected = detectScan(tilted,model,{gradePercent:[5,-2]});
    assert.deepEqual(corrected.pins,run.pins);
    assert.deepEqual(corrected.baselinePins,run.baselinePins);
    assert.equal(corrected.proposalCount,run.proposalCount);
    assert.equal(corrected.acceptedCount,run.acceptedCount);
    for (const [i,pin] of run.pins.entries()) {
      const index = expected.stages.proposals.indexOf(expected.predictions[i]);
      assert.equal(pin.score, expected.proposalScores[index]);
    }
  }
});

test('unit conversion preserves georeferenced positions and ground datum', () => {
  const model = weights();
  const xyz = [2,3,.5, 8,7,.25, 10,10,-.04, 0,0,0];
  const local = detectScan(xyz,model);
  assert.equal(local.pins.length,2);
  for (const [unit,unitsPerMeter] of [['m',1],['cm',100],['mm',1000]]) {
    const origin = [620000*unitsPerMeter, 6200000*unitsPerMeter, 125.5*unitsPerMeter];
    const world = Float64Array.from(xyz,(v,i) => origin[i%3]+v*unitsPerMeter);
    const result = detectScan(world,model,{unit,origin});
    assert.deepEqual(result.frame,{unit,origin});
    const gradePercent = [-4,6];
    const tilted = world.slice();
    for (let i=0; i<tilted.length; i+=3) {
      tilted[i+2] += (gradePercent[0]*xyz[i] + gradePercent[1]*xyz[i+1])*unitsPerMeter/100;
    }
    const corrected = detectScan(tilted,model,{unit,origin,gradePercent});
    assert.deepEqual(corrected.frame,{unit,origin,gradePercent});
    assert.deepEqual(corrected.pins,result.pins);
    assert.deepEqual(corrected.baselinePins,result.baselinePins);
    assert.notDeepEqual(detectScan(tilted,model,{unit,origin}).baselinePins,corrected.baselinePins);
    assert.deepEqual(result.pins.map(({score,localX,localY}) => [score,localX,localY]),
      local.pins.map(({score,x,y}) => [score,x,y]));
    for (const [i,pin] of result.pins.entries()) {
      assert.equal(pin.x,origin[0]+local.pins[i].x*unitsPerMeter);
      assert.equal(pin.y,origin[1]+local.pins[i].y*unitsPerMeter);
    }
  }
});

test('the height baseline retains tall proposals when the trained cutoff rejects them', () => {
  const xyz = [1,1,.25, 1.25,1,.5, 4,6,.75];
  const model = weights({threshold:.9, pinSeparation:.5});
  const result = detectScan(xyz,model);
  assert.equal(result.proposalCount,3);
  assert.equal(result.acceptedCount,0);
  assert.deepEqual(result.pins,[]);
  assert.deepEqual(result.baselinePins.map(p => p.heightMeters),[.75/4,.5/4]);
  assert.ok(result.baselinePins[1].localX > 1.25);
  const inclusive = detectScan(xyz,weights({pinSeparation:.5}));
  assert.equal(inclusive.acceptedCount,3);
  assert.equal(inclusive.pins.length,2);
  for (const p of inclusive.pins) assert.equal(p.score,.5);
});

test('rejects unsupported models, invalid frames or out-of-plot returns before reporting pins', () => {
  const xyz = [1,1,.3], model = weights();
  assert.throws(() => detectScan(xyz,{}), /model|weight/i);
  assert.throws(() => detectScan(xyz,weights({crop:'other'})), /lettuce/i);
  assert.throws(() => detectScan(xyz,weights({hiddenLayers:[8]})), /weights/i);
  assert.throws(() => detectScan(xyz,weights({minimumHeight:0})), /height/i);
  assert.throws(() => detectScan(xyz,weights({pinSeparation:-1})), /separation/i);
  assert.throws(() => detectScan(xyz,weights({threshold:1.2})), /cutoff/i);
  assert.throws(() => detectScan(xyz,model,{unit:'feet'}), /units/i);
  assert.throws(() => detectScan(xyz,model,{origin:[0,0,NaN]}), /origin/i);
  for (const invalid of [null, [], [5], [0,0,1], ['0',0], [Infinity,0], [0,NaN], Array(2)]) {
    assert.throws(() => detectScan(xyz,model,{gradePercent:invalid}), /grade/);
  }
  assert.deepEqual(detectScan(xyz,model,{gradePercent:[0,0]}),detectScan(xyz,model));
  assert.throws(() => detectScan([],model), /XYZ/);
  assert.throws(() => detectScan([0,1],model), /XYZ/);
  assert.throws(() => detectScan([-.01,8,.9],model), /plot/);
  assert.throws(() => detectScan([8,10.1,.9],model), /plot/);
  assert.throws(() => detectScan([8,3,Infinity],model), /nonfinite/);
  assert.deepEqual(detectScan([5,5,-.1],model).pins,[]);
});

test('field test trials change only the model cutoff and restore the saved scores',()=>{
  const model=Object.freeze(weights({threshold:.5}));
  const xyz=[1,1,.5,4,6,.25],labels={filename:'centers.csv',text:'x,y\n1.025,1.025\n4.025,6.025'};
  const run=thresholdOverride=>runFieldTest({model,xyz,labels,thresholdOverride});
  const saved=run();
  assert.equal(saved.pins.length,2);
  assert.ok(!Object.hasOwn(saved.detector,'savedThreshold'));
  assert.ok(!Object.hasOwn(saved,'savedCutoff'));
  for (const [cutoff,count] of [[.55,0],[.20,2],[0,2],[1,0],[.5,2]]) {
    const result=run(cutoff);
    assert.equal(result.detector.threshold,cutoff);
    assert.equal(result.detector.savedThreshold,.5);
    assert.equal(result.pins.length,count);
    assert.equal(result.evaluation.scores.at(-1).tp,count);
    assert.equal(result.stages15cm[1].count,count);
    assert.equal(result.proposalCount,saved.proposalCount);
    assert.deepEqual(result.baselinePins,saved.baselinePins);
    assert.deepEqual(result.baselineEvaluation,saved.baselineEvaluation);
    assert.deepEqual(result.savedCutoff,{pins:saved.pins,evaluation:saved.evaluation});
  }
  const noSurvey=runFieldTest({model,xyz,thresholdOverride:1});
  assert.equal(noSurvey.pins.length,0);
  assert.deepEqual(noSurvey.savedCutoff,{pins:saved.pins,evaluation:null});
  const emptySurvey=runFieldTest({model,xyz,labels:{...labels,text:'x,y'},thresholdOverride:1});
  assert.equal(emptySurvey.savedCutoff.evaluation.scores.at(-1).fp,2);
  assert.deepEqual(run(),saved);
  for (const invalid of [-.1,1.1,'0.20',null,NaN]) assert.throws(()=>run(invalid),/cutoff/);
  assert.throws(()=>runFieldTest({model:{...model,threshold:2},xyz,thresholdOverride:.2}),/cutoff/);
});

test('dense scans preserve the full candidate return count beyond 16-bit capacity', () => {
  const n = 65_536;
  const xyz = new Float32Array(3*n);
  for (let i=0; i<xyz.length; i+=3) xyz.set([3,4,.5],i);
  const {X,pos} = features({xyz},.035);
  assert.equal(pos.length,1);
  assert.equal(X[10],Math.fround(Math.log1p(n)));
});

test('survey stage coverage isolates the candidate, cutoff and spacing losses', () => {
  const params = Array(14).fill(0);
  params[0] = 16;
  params[13] = -1.4;
  const model = weights({weights:params,pinSeparation:.5});
  const xyz = [1,1,.5, 1.25,1,.75, 4,6,.25];
  const survey = 'x,y\n1.025,1.025\n1.275,1.025\n4.025,6.025\n8,8';
  const run = runFieldTest({model,xyz,labels:{filename:'plants.csv',text:survey}});
  assert.deepEqual(run.stages15cm,[
    {stage:'proposals',count:3,matched:3,recall:.75},
    {stage:'accepted',count:2,matched:2,recall:.5},
    {stage:'selected',count:1,matched:1,recall:.25}
  ]);
  assert.equal(run.stages15cm[2].matched,run.evaluation.scores.find(s => s.cm===15).tp);
  assert.equal(run.stages,undefined);
  assert.deepEqual(run.stages15cm,run.stagesAtCm[15]);

  const offsetSurvey = 'x,y\n1.025,1.105\n1.275,1.145\n4.025,6.025\n8,8';
  const offsets = runFieldTest({model,xyz,labels:{filename:'plants.csv',text:offsetSurvey}});
  const expectedMatches = {7.5:[1,0,0],10:[2,1,0],15:[3,2,1]};
  for (const {cm,tp} of offsets.evaluation.scores) {
    const stages = offsets.stagesAtCm[cm];
    assert.deepEqual(stages.map(row=>row.matched),expectedMatches[cm]);
    assert.deepEqual(stages.map(row=>row.count),[3,2,1]);
    assert.deepEqual(stages.map(row=>row.recall),expectedMatches[cm].map(n=>n/4));
    assert.equal(stages.at(-1).matched,tp);
  }
});

test('each peak covers at most one overlapping survey reference', () => {
  const run = runFieldTest({model:weights(),xyz:[5,5,.8],
    labels:{filename:'plot.csv',text:'x,y\n5.01,5\n5.05,5'}});
  assert.ok(run.stages15cm.every(row => row.matched===1 && row.recall===.5));
});

test('unlabeled and surveyed-empty stage coverage remain distinguishable', () => {
  const scan = {model:weights(),xyz:[2,2,.25]};
  const unlabeled = runFieldTest(scan);
  assert.equal(unlabeled.stages15cm,null);
  assert.equal(unlabeled.stagesAtCm,null);
  const empty = runFieldTest({...scan,labels:{filename:'survey.csv',text:'x,y'}});
  for (const cm of [7.5,10,15]) {
    assert.ok(empty.stagesAtCm[cm].every(row => row.count===1 && row.matched===0 && row.recall===null));
  }
  assert.deepEqual(empty.stages15cm,empty.stagesAtCm[15]);
});
