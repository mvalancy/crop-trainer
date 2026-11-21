import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {weightArtifact,savedPeakAveraging,scoreSavedWeights} from '../trainer/models/network.js';
import {features,buildDataset,validateModel} from '../trainer/models/data.js';
import {field} from '../trainer/generator/field.js';
import {detectScan} from '../trainer/field-test/inference.js';
import {trainNetworkCPU,predictNetwork} from '../trainer/models/neural.js';

test('original model bytes remain stable and mismatched feature schemas fail closed',()=>{
  const settings={crop:'tomato',hiddenLayers:[],activation:'tanh',minimumHeight:.065,threshold:.5};
  const fit={settings,trainer:'crop-peak-logistic-v1',scaling:{means:Array(13).fill(0),std:Array(13).fill(1)},
    weights:new Float32Array(14),epochs:2};
  const stock=weightArtifact(fit);
  // Hash of this exact zero-weight export from the original schema implementation.
  assert.equal(createHash('sha256').update(JSON.stringify(stock)).digest('hex'),
    'c238bb76cc149c961c974b76fd2c40bd18eb891a1fe7c2a6ca026241e5daddcd');
  assert.equal(JSON.stringify(weightArtifact({...fit,settings:{...settings,peakAveraging:'zero-filled'}})),JSON.stringify(stock));
  const occupied=weightArtifact({...fit,settings:{...settings,peakAveraging:'occupied'}});
  assert.equal(occupied.featureSchema,'crop-peak-13-occupied-v1');
  assert.equal(savedPeakAveraging(stock),'zero-filled');
  assert.equal(savedPeakAveraging(occupied),'occupied');
  assert.throws(()=>weightArtifact({...fit,stats:{peakAveraging:'occupied'}}),/fitted dataset/);
  for(const invalid of ['future',null,['occupied']]){
    assert.throws(()=>weightArtifact({...fit,settings:{...settings,peakAveraging:invalid}}),/averaging/);
  }
  const xyz=[1.025,2.025,.125], rows=features({xyz},.065,'occupied').X;
  assert.equal(rows.length,13);
  assert.throws(()=>scoreSavedWeights(rows,occupied),/averaging/);
  assert.throws(()=>scoreSavedWeights(rows,stock,'occupied'),/averaging/);
  assert.deepEqual([...scoreSavedWeights(rows,occupied,'occupied')],[.5]);
  assert.equal(detectScan(xyz,stock).pins.length,0);
  assert.equal(detectScan(xyz,occupied).pins.length,1);
  assert.throws(()=>detectScan(xyz,{...occupied,featureSchema:'future'}),/feature schema/);
  assert.throws(()=>detectScan(xyz,{...stock,peakAveraging:'occupied'}),/disagrees/);
});

test('imported XYZ scored with occupied-bin weights reproduce both held-out scans from the CPU fit',async()=>{
  const settings={crop:'tomato',plantArchitecture:2,plantForm:'seedling',sensorMode:'os1-64',
    trainingRayBudget:60000,validationRayBudget:60000,minimumHeight:.065,peakAveraging:'occupied',
    trainFields:3,valFields:1,seed:41627,threshold:.42,hiddenLayers:[4],activation:'tanh',epochs:6};
  const set=await buildDataset(settings);
  const fit=await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims});
  const model=weightArtifact({settings,trainer:'crop-mlp-v1',scaling:set.scaling,weights:fit.weights,epochs:fit.epochsCompleted});
  const validation=await validateModel(set,fit.weights,{threshold:settings.threshold,predictScores:predictNetwork});
  for(const tile of set.validation){
    const scan=field(tile.recipe);
    const imported=detectScan(scan.xyz,JSON.parse(JSON.stringify(model)));
    const preview=validation.previews.get(tile.tile_id);
    assert.deepEqual(imported.pins.map(p=>[p.localX,p.localY]),preview.predictions);
    assert.ok(imported.pins.length>0);
    const scores=new Map(preview.stages.proposals.map((p,i)=>[p,preview.proposalScores[i]]));
    assert.deepEqual(imported.pins.map(p=>p.score),preview.predictions.map(p=>scores.get(p)));
  }
});
