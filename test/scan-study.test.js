import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRecipe} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {getSensor} from '../trainer/sensors.js';
import {analyzeStudyScan,checkStudyPair,studyRecipes} from '../trainer/scan-study.js';

function seedlingRecipe(sensor) {
  const recipe=makeRecipe(216917,true,getSensor(sensor),'tomato',2,'seedling');
  Object.assign(recipe,{weeds:false,sticks:false,boards:false});
  for(const key of ['xy','z','density','gaps','stray','cluster']) recipe.scanNoise[key]=0;
  return recipe;
}

test('paired generator study reproduces reference seedling hits and one-to-one pin scores',()=>{
  const recipe=seedlingRecipe('reference');
  const [low,high]=[30000,1000000].map(points=>analyzeStudyScan(field({...recipe,points})));
  checkStudyPair(low,high);
  for(const [arm,id,observed,peaks,counts] of [
    [low,'add860f363b25596',93,15,[15,4,90]],
    [high,'e09123723c475a38',105,103,[103,23,2]]
  ]) {
    assert.equal(arm.tileId,id);
    assert.equal(arm.plants.length,105);
    assert.equal(arm.observedPlants,observed);
    assert.equal(arm.matchedProposals,peaks);
    const {cm,tp,fp,fn}=arm.heightScores.at(-1);
    assert.deepEqual([cm,tp,fp,fn],[15,...counts]);
    assert.equal(arm.plants.filter(plant=>plant.height).length,tp);
    assert.ok(!('orchardPins' in arm));
  }
  const wrong={...high,plants:high.plants.map(p=>({...p,x:p.x+.1}))};
  assert.throws(()=>checkStudyPair(low,wrong),/target locations/);
});

test('two requests above a ring layout ceiling show the same acquired scan',()=>{
  const recipe=seedlingRecipe('os1-32');
  const [low,high]=[30000,100000].map(points=>analyzeStudyScan(field({...recipe,points})));
  checkStudyPair(low,high);
  assert.equal(low.sampledRays,32*512);
  assert.equal(high.sampledRays,low.sampledRays);
  assert.equal(low.tileId,high.tileId);
  assert.deepEqual(low.plants,high.plants);
  assert.deepEqual(low.heightPins,high.heightPins);
});

test('the layout comparison preserves planting, obstacles and noise at equal sampled rays',()=>{
  const recipe=makeRecipe(1370561,true,getSensor('os1-32'),'tomato',2,'seedling');
  const [grid,rings]=studyRecipes(recipe,'layouts');
  assert.deepEqual(grid,{...recipe,points:60000,sampling:getSensor('reference')});
  assert.deepEqual(rings,{...recipe,points:60000,sampling:getSensor('os1-64')});
  const a=field(grid),b=field(rings);
  assert.deepEqual(a.labels.boxes,b.labels.boxes);
  assert.equal(a.sampledRays,60000);
  assert.equal(b.sampledRays,60000);
  assert.notDeepEqual(a.plantReturns,b.plantReturns);
  assert.deepEqual(studyRecipes(recipe,'budgets',[30000,100000]).map(r=>r.sampling.key),['os1-32','os1-32']);
  assert.throws(()=>studyRecipes(recipe,'budgets',[60000,60000]),/higher/);
});

test('generator observation labels have no influence on either orchard detector',()=>{
  const scan=field({...makeRecipe(81357,true,getSensor('reference'),'apple',3,'open-vase'),points:30000});
  const original=analyzeStudyScan(scan);
  const changed=analyzeStudyScan({...scan,plantReturns:scan.plantReturns.map(()=>0),
    cls:new Uint8Array(scan.cls.length),parts:undefined,
    labels:{...scan.labels,boxes:scan.labels.boxes.map(b=>({...b,base_xy_m:[0,0]}))}});
  assert.ok(original.orchardPins.length>0);
  assert.deepEqual(changed.orchardPins,original.orchardPins);
  assert.deepEqual(changed.heightPins,original.heightPins);
  assert.equal(changed.observedPlants,0);
});

test('scaffold damage compares the same structured orchard at its applied ray budget',()=>{
  const orchard=makeRecipe(7412177,true,getSensor('reference'),'apple',2,'open-vase','mixed');
  const source={...orchard,appleCanopy:'dormant',points:34000};
  for(const [index,arm] of studyRecipes(source,'damage').entries()){
    assert.deepEqual(arm,{...source,plantCondition:['healthy','damaged'][index]});
  }
  assert.equal(source.plantCondition,'mixed');
  assert.throws(()=>studyRecipes(seedlingRecipe('reference'),'damage'),/structured apple/);
  assert.throws(()=>studyRecipes({...source,plantArchitecture:1},'damage'),/structured apple/);
  assert.throws(()=>studyRecipes(source,'unknown'),/supported scan comparison/);
});

test('orchard damage gives a nearest distance even when the pin misses the 15 cm match',()=>{
  const source={...makeRecipe(7412177,true,getSensor('reference'),'apple',2,'open-vase'),
    appleCanopy:'leafy', points:60000, weeds:false, sticks:false, boards:false, scanNoise:null};
  const [a,b]=studyRecipes(source,'damage').map(recipe=>analyzeStudyScan(field(recipe)));
  checkStudyPair(a,b);
  assert.equal(a.tileId,'2ebd71591d8c0c2e');
  assert.equal(b.tileId,'8771d49dce3ecaac');
  for(const [scan,expectedCm,matched,matches] of [[a,'6.7',true,9],[b,'37.9',false,4]]){
    assert.equal((scan.plants[0].nearestOrchardPinM*100).toFixed(1),expectedCm);
    assert.equal(scan.plants[0].orchard,matched);
    assert.equal(scan.orchardScores.at(-1).tp,matches);
  }
  const soil={...field(source),xyz:new Float32Array([0,0,0])};
  assert.ok(analyzeStudyScan(soil).plants.every(p=>!p.orchard&&p.nearestOrchardPinM===null));
});
