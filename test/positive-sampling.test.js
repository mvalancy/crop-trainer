import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDataset} from '../trainer/models/data.js';

const settings = {seed:92323,trainFields:2,valFields:1,minimumHeight:.035,sampleLimit:26,generate:trainingFixture};

function trainingFixture(recipe, step) {
  const xyz = [], boxes = [];
  for (let sample = 0; sample < 42; sample++) {
    const x = 1.025 + .5*(sample%7), y = 1.025 + .5*Math.floor(sample/7);
    // This peak height identifies both the scan and its row after feature normalization.
    xyz.push(x,y,.5 + (step.done*100+sample)/1000);
    if (sample >= 20) continue;
    const form = sample === 0 ? 'seedling' : 'branching';
    if (step.split === 'Validation') {
      boxes.push({base_xy_m:[x,y],plant_form:'validation-only'});
      continue;
    }
    boxes.push({base_xy_m:[x+.08,y],plant_form:'farther-neighbor'}, {base_xy_m:[x,y],plant_form:form},
      {base_xy_m:[x,y],plant_form:'tied-second'});
  }
  return {p:recipe,xyz:Float32Array.from(xyz),sampledRays:42,
    labels:{tile_id:String(step.done),num_points:42,boxes}};
}

function rowIds(dataset, classValue) {
  const ids = [];
  for (let i=0; i<dataset.Y.length; i++) {
    if (dataset.Y[i] !== classValue) continue;
    const originalHeight = dataset.X[i*dataset.dims+1]*dataset.scaling.std[1]+dataset.scaling.means[1];
    ids.push(Math.round((originalHeight-.5)*1000));
  }
  return ids;
}

test('form and soil quotas use nearest labeled training plants and redistribute scarce positives',async()=>{
  const old = await buildDataset(settings);
  assert.ok(!Object.hasOwn(old.stats,'positiveExamplesByFormSoil'));
  const control = await buildDataset({...settings,positiveSampling:'ordinary',auditPositiveSampling:true});
  assert.deepEqual(old.X, control.X);
  assert.deepEqual(old.scaling,control.scaling);

  const trial = await buildDataset({...settings,positiveSampling:'form-soil'});
  assert.deepEqual(trial.manifest,control.manifest);
  assert.deepEqual(trial.Y,control.Y);
  assert.deepEqual(trial.stats.positiveExamplesByFormSoil.map(g=>[g.plantForm,g.ground,g.available]),
    control.stats.positiveExamplesByFormSoil.map(g=>[g.plantForm,g.ground,g.available]));
  const groups = trial.stats.positiveExamplesByFormSoil;
  assert.ok(groups.every(g=>g.plantForm!=='validation-only'));
  for (const unused of ['farther-neighbor','tied-second']) {
    assert.deepEqual(groups.filter(g=>g.plantForm===unused).map(g=>[g.available,g.selected]), [[0,0],[0,0]]);
  }
  assert.deepEqual(groups.filter(g=>g.plantForm==='seedling').map(g=>[g.available,g.selected]), [[2,2],[2,2]]);
  assert.deepEqual(groups.filter(g=>g.plantForm==='branching').map(g=>g.selected).sort(),[4,5]);
  const trialIds = rowIds(trial,1);
  assert.equal(new Set(trialIds).size,13);
  for (const group of groups) {
    const selected = trialIds.filter(id => {
      const soil = Math.floor(id/100)%2 === 1;
      const stage = id%100===0 ? 'seedling' : 'branching';
      return group.ground===soil && group.plantForm===stage;
    });
    assert.equal(group.selected,selected.length);
  }
  assert.deepEqual(rowIds(trial,0),rowIds(control,0));
  assert.deepEqual(await buildDataset({...settings,positiveSampling:'form-soil'}),trial);
});

test('selecting the entire positive pool keeps the ordinary order and supports unversioned form labels',async()=>{
  const generate = (recipe,step)=>{
    const scan=trainingFixture(recipe,step);
    for(const box of scan.labels.boxes) delete box.plant_form;
    return scan;
  };
  const ordinary=await buildDataset({...settings,sampleLimit:48000,generate});
  const trial=await buildDataset({...settings,sampleLimit:48000,generate,positiveSampling:'form-soil'});
  assert.deepEqual(ordinary.X,trial.X);
  assert.deepEqual(ordinary.scaling,trial.scaling);
  assert.deepEqual(trial.stats.positiveExamplesByFormSoil,[
    {plantForm:'unspecified',ground:true,available:40,selected:40},
    {plantForm:'unspecified',ground:false,available:40,selected:40}
  ]);
});

test('invalid or conflicting sampling choices fail before generating fields',async()=>{
  const generate=()=>assert.fail('Unexpected scan');
  await assert.rejects(buildDataset({positiveSampling:'invalid',generate}),/positive sampling/);
  await assert.rejects(buildDataset({positiveSampling:'form-soil',selectPositiveRows:()=>[],generate}),/custom positive rows/);
});
