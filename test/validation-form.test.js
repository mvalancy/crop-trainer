import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataset,rescanValidation,validationFormSettings,validateModel} from '../trainer/models/data.js';
import {field} from '../trainer/generator/field.js';
import {trainNetworkCPU,predictNetwork} from '../trainer/models/neural.js';
import {weightArtifact} from '../trainer/models/network.js';
import {runFieldTest} from '../trainer/field-test/score-scan.js';

const settings={crop:'tomato',plantArchitecture:2,plantForm:'transplant',plantCondition:'healthy',
  seed:28361,trainFields:2,valFields:1,sensorMode:'reference',trainingRayBudget:30000,
  validationRayBudget:30000,minimumHeight:.065};

test('only held-out scans change when requesting a different validation crop form',async()=>{
  const stock=await buildDataset(settings);
  const holdout={...settings,validationPlantForm:'seedling'};
  const other=await buildDataset(holdout);
  assert.equal(Object.hasOwn(stock.stats,'validationPlantForm'),false);
  assert.equal(other.stats.validationPlantForm,'seedling');
  assert.deepEqual(other.stats.fieldSeeds,stock.stats.fieldSeeds);
  assert.deepEqual(other.stats.trainingExamplesByField,stock.stats.trainingExamplesByField);
  assert.deepEqual(other.X,stock.X);
  assert.deepEqual(other.Y,stock.Y);
  assert.deepEqual(other.scaling,stock.scaling);
  assert.deepEqual(other.manifest.filter(t=>t.split==='train'),stock.manifest.filter(t=>t.split==='train'));
  for(const [i,tile] of other.validation.entries()){
    const original=stock.validation[i];
    assert.deepEqual(tile.recipe,{...original.recipe,plantForm:'seedling'});
    assert.notEqual(tile.tile_id,original.tile_id);
  }

  // A layout rescan uses the held-out form that produced the original tile.
  const ring=await rescanValidation(other,'os1-64');
  assert.equal(ring.stats.validationPlantForm,'seedling');
  assert.equal(ring.scaling,other.scaling);
  for(const [i,tile] of ring.validation.entries()){
    assert.equal(tile.recipe.plantForm,'seedling');
    assert.deepEqual(tile.truth,other.validation[i].truth);
  }

  const fitSettings={hiddenLayers:[4],activation:'tanh',epochs:5,threshold:.5,dims:13};
  const exportFit=async(set,geometry)=>{
    const fit=await trainNetworkCPU(set.X,set.Y,fitSettings);
    return weightArtifact({settings:{...geometry,...fitSettings},trainer:'crop-mlp-v1',
      scaling:set.scaling,weights:fit.weights,epochs:fit.epochsCompleted,stats:set.stats});
  };
  const weights=await exportFit(other,holdout);
  assert.equal(weights.plantForm,'transplant');
  assert.equal(Object.hasOwn(weights,'validationPlantForm'),false);
  assert.deepEqual(weights,await exportFit(stock,settings));

  const scored=await validateModel(other,weights.weights,{predictScores:predictNetwork});
  for(const tile of other.manifest.filter(t=>t.split==='validation')){
    const scan=field(tile.recipe);
    assert.equal(scan.labels.tile_id,tile.tile_id);
    const replay=runFieldTest({model:weights,xyz:scan.xyz,tileId:tile.tile_id,
      labels:{filename:'centers.json',text:JSON.stringify(scan.labels)}});
    const expected=scored.tiles.find(t=>t.tile_id===tile.tile_id);
    assert.deepEqual(replay.evaluation.scores.map(({cm,tp,fp,fn})=>({cm,tp,fp,fn})),expected.byTolerance);
  }
});

test('a common validation form gives the same scans across different training forms',async()=>{
  const mixed=await buildDataset({...settings,plantForm:'mixed',validationPlantForm:'seedling'});
  const onlySeedlings=await buildDataset({...settings,plantForm:'seedling'});
  assert.deepEqual(mixed.manifest.filter(t=>t.split==='validation'),onlySeedlings.manifest.filter(t=>t.split==='validation'));
  assert.notDeepEqual(mixed.manifest.filter(t=>t.split==='train'),onlySeedlings.manifest.filter(t=>t.split==='train'));
});

test('follow and redundant validation choices normalize away and invalid crop forms fail before generation',async()=>{
  for(const validationPlantForm of [undefined,'follow','transplant']){
    assert.deepEqual(validationFormSettings({...settings,validationPlantForm}),{});
  }
  assert.deepEqual(validationFormSettings({...settings,validationPlantForm:'mixed'}),{validationPlantForm:'mixed'});
  for(const invalid of [{validationPlantForm:null},{validationPlantForm:'romaine'},
    {validationPlantForm:''},{plantArchitecture:1,plantForm:'mixed',validationPlantForm:'seedling'}]){
    let generated=false;
    await assert.rejects(buildDataset({...settings,...invalid,generate(){generated=true;}}),/plant form|structured/i);
    assert.equal(generated,false);
  }
});
