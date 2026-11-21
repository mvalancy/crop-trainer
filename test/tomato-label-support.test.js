import assert from 'node:assert/strict';
import test from 'node:test';
import {field} from '../trainer/generator/field.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {features,makeRecipe} from '../trainer/models/data.js';
import {measureScan} from '../benchmark/studies/tomato-label-support.mjs';

test('optional plant-return ownership follows noise, clustered copies and soil removal',()=>{
  const recipe = {...makeRecipe(65537,true,getSensor('os1-64'),'tomato',2,'mixed','healthy'),
    points:18000,weeds:true,sticks:true,boards:true,
    scanNoise:{seed:333993,xy:.4,z:.3,density:14,gaps:3,stray:.28,cluster:15}};
  const normal = field(recipe);
  assert.equal('plantIds' in normal,false);
  const withSoil = field(recipe,undefined,{includePlantIds:true});
  const {plantIds,...existing} = withSoil;
  assert.deepEqual(existing,normal);
  const withoutSoil = field({...recipe,ground:false},undefined,{includePlantIds:true});
  assert.ok(withSoil.counts[0] > 0 && withoutSoil.plantIds.some(id=>id>0));
  let emitted=0;
  for (const [i,id] of plantIds.entries()) {
    if (withSoil.cls[i] === 0) continue;
    assert.equal(withoutSoil.plantIds[emitted],id);
    assert.equal(withoutSoil.cls[emitted],withSoil.cls[i]);
    for (let axis=0;axis<3;axis++) assert.equal(withoutSoil.xyz[3*emitted+axis],withSoil.xyz[3*i+axis]);
    emitted++;
  }
  assert.equal(emitted,withoutSoil.plantIds.length);
  for (const scan of [withSoil,withoutSoil]) {
    const counted=Array(scan.labels.boxes.length).fill(0);
    assert.equal(scan.plantIds.length,scan.xyz.length/3);
    for (const [i,id] of scan.plantIds.entries()) {
      assert.equal(id>0,scan.cls[i]===1);
      if (id) counted[id-1]++;
    }
    assert.deepEqual(counted,scan.plantReturns);
  }
});

test('patch audit distinguishes a missed plant, a neighbor and mixed crop/soil returns',()=>{
  const boxes=[1.025,2.025,3.025,4.025].map(x=>({plant_form:'seedling',base_xy_m:[x,1.025]}));
  const scan={xyz:Float32Array.of(1.025,1.025,.6, 2.025,1.025,.6, 3.025,1.025,.6,
      4.025,1.025,.6, 4.026,1.025,.9),p:{ground:true},labels:{boxes},
    plantIds:Uint16Array.of(0,0,2,4,0),cls:Uint8Array.of(0,0,1,1,0),plantReturns:[0,1,0,1]};
  const cells=[];
  const ordinary=features({xyz:scan.xyz},.035,'zero-filled','local-ground');
  const audited=features(scan,.035,'zero-filled','local-ground',(x,y)=>cells.push([x,y]));
  assert.deepEqual(audited,ordinary);
  assert.deepEqual(cells,[[20,20],[40,20],[60,20],[80,20]]);
  const groups=new Map();
  measureScan(scan,groups);
  assert.deepEqual([...groups.values()],[{plantForm:'seedling',ground:true,eligible:4,
    noTargetAnywhere:2,noTargetInPatch:3,noCropInPatch:2,tallestFromTarget:0,tallestFromSoil:3}]);
});
