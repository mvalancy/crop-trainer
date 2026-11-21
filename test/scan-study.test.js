import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRecipe} from '../trainer/models/data.js';
import {field} from '../trainer/generator/field.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {analyzeStudyScan,checkStudyPair,studyRecipes} from '../trainer/study/scan-study.js';

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
    assert.ok(arm.plants.every(plant=>!('orchardTrace' in plant)));
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
  assert.ok(analyzeStudyScan(soil).plants.every(p=>!p.orchard&&p.nearestOrchardPinM===null&&p.orchardTrace.state==='support'));
});

test('scaffold widths vary orchard wood returns while preserving the planted bases and scan settings',()=>{
  const source={...makeRecipe(7412177,true,getSensor('reference'),'apple',2,'open-vase','healthy'),
    appleCanopy:'dormant', points:60000, weeds:false, sticks:false, boards:false, scanNoise:null};
  const recipes=studyRecipes(source,'scaffolds');
  assert.deepEqual(recipes,[3,4].map(plantArchitecture=>({...source,plantArchitecture})));
  assert.throws(()=>studyRecipes(seedlingRecipe('reference'),'scaffolds'),/apple orchard/);
  const [a,b]=recipes.map(recipe=>analyzeStudyScan(field(recipe),'scaffolds'));
  checkStudyPair(a,b);
  const observations=[a,b].map(r=>[r.tileId,r.sampledRays,r.plants.length,r.orchardWoodReturns,r.orchardScores.at(-1).tp]);
  assert.deepEqual(observations,[
    ['6969fb9f0b8de2f7',60000,11,1571,10],
    ['5bc2b4c1837d611a',60000,11,1240,9]
  ]);
  assert.equal(source.plantArchitecture,2);
  assert.ok(!('orchardWoodReturns' in analyzeStudyScan(field(recipes[0]),'damage')));
});

test('paired orchard study explains a spacing miss and a pin centered in from outside 15 cm',()=>{
  const source={...makeRecipe(14151223,true,getSensor('reference'),'apple',3,'central-leader','healthy'),
    points:60000, appleCanopy:'leafy', weeds:false, sticks:false, boards:false, scanNoise:null};
  const [first,second]=studyRecipes(source,'scaffolds').map(recipe=>analyzeStudyScan(field(recipe),'scaffolds'));
  assert.deepEqual(first.plants[2].orchardTrace,{state:'matched',supportCellCount:20,spacedCellCount:1});
  assert.deepEqual(second.plants[2].orchardTrace,{state:'spacing',supportCellCount:3,spacedCellCount:0});
  assert.equal((first.plants[2].nearestOrchardPinM*100).toFixed(1),'7.7');
  assert.equal((second.plants[2].nearestOrchardPinM*100).toFixed(1),'79.2');
  for (const result of [first,second]) {
    const tree=result.plants[10];
    assert.equal(tree.orchardTrace.spacedCellCount,0);
    assert.equal(tree.orchardTrace.state,'matched');
    assert.ok(tree.nearestOrchardPinM<=.15);
    assert.equal(result.plants.filter(p=>p.orchardTrace.state==='matched').length,result.orchardScores.at(-1).tp);
    assert.ok(!('supportCells' in result) && !('spacedCells' in result));
  }
});

test('apple pin-spacing arms use one scan and preserve the height-only control',()=>{
  const source={...makeRecipe(17107753,true,getSensor('reference'),'apple',4,'central-leader','healthy'),
    points:60000, appleCanopy:'leafy', weeds:false, sticks:false, boards:false, scanNoise:null};
  const [first,second]=studyRecipes(source,'spacing');
  assert.equal(first,source);
  assert.equal(second,first);
  assert.throws(()=>studyRecipes(seedlingRecipe('reference'),'spacing'),/apple orchard/);
  const scan=field(source);
  const control=analyzeStudyScan(scan,'spacing');
  const closer=analyzeStudyScan(scan,'spacing',.75);
  assert.deepEqual(control,analyzeStudyScan(scan,'spacing',1.05));
  checkStudyPair(control,closer);
  assert.equal(control.tileId,'a481a4eb571f9f65');
  assert.equal(closer.tileId,control.tileId);
  assert.equal(control.orchardSeparationMeters,1.05);
  assert.equal(closer.orchardSeparationMeters,.75);
  assert.deepEqual(closer.heightPins,control.heightPins);
  assert.deepEqual(closer.sampledHeightScores,control.sampledHeightScores);
  assert.deepEqual([control,closer].map(r=>[r.orchardScores.at(-1).tp,r.orchardScores.at(-1).fp]),[[7,3],[7,5]]);
});

test('ranking rules use the same scan and show every low cell that can affect priority',()=>{
  const recipe={...makeRecipe(18101637,true,getSensor('os1-64'),'apple',4,'central-leader','healthy'),
    points:60000, appleCanopy:'leafy', weeds:false, sticks:false, boards:false, scanNoise:null};
  const [first,second]=studyRecipes(recipe,'ranking');
  assert.equal(first,second);
  assert.equal(first,recipe);
  assert.throws(()=>studyRecipes(seedlingRecipe('reference'),'ranking'),/apple orchard/);
  const scan=field(first);
  const usual=analyzeStudyScan(scan,'ranking');
  const trial=analyzeStudyScan(scan,'ranking',{ranking:'low-wood'});
  checkStudyPair(usual,trial);
  assert.equal(usual.tileId,'f89d8eafa9371fd6');
  assert.deepEqual([usual.orchardRanking,trial.orchardRanking],['support','low-wood']);
  assert.deepEqual([usual.orchardSeparationMeters,trial.orchardSeparationMeters],[1.05,1.05]);
  assert.deepEqual(usual.heightScores,trial.heightScores);
  assert.deepEqual(usual.sampledHeightPins,trial.sampledHeightPins);
  assert.ok(!('orchardLowCellIds' in usual));
  const cells=new Set();
  for(let i=0;i<scan.xyz.length;i+=3){
    if(scan.xyz[i+2]>=.15 && scan.xyz[i+2]<.48){
      cells.add(200*Math.floor(scan.xyz[i+1]/.05)+Math.floor(scan.xyz[i]/.05));
    }
  }
  assert.equal(cells.size,6);
  assert.deepEqual(trial.orchardLowCellIds,[...cells].sort((a,b)=>a-b));
  const usualTree=usual.plants[0],trialTree=trial.plants[0];
  assert.equal(usualTree.orchard,false);
  assert.equal(trialTree.orchard,true);
  assert.equal(trialTree.orchardTrace.topCandidate.lowCellCount,1);
  assert.ok(!('bestCellId' in usualTree.orchardTrace));
  assert.equal(trialTree.orchardTrace.bestCellId,200*32+26);
  assert.equal(trialTree.orchardTrace.topCandidate.rankScore,usualTree.orchardTrace.topCandidate.score+1);
  assert.equal(usualTree.orchardTrace.supportCellCount,trialTree.orchardTrace.supportCellCount);
  assert.deepEqual([usual,trial].map(r=>[r.orchardScores.at(-1).tp,r.orchardScores.at(-1).fp]),[[11,3],[12,2]]);
});

test('board placement pairs distinct scans and scores both with the same XYZ-only rule',()=>{
  const source={...makeRecipe(21490513,true,getSensor('os1-64'),'apple',4,'central-leader','healthy'),
    points:60000, appleCanopy:'leafy', weeds:false, sticks:false, boards:false, scanNoise:null};
  const recipes=studyRecipes({...source,boardPlacement:'independent'},'boards');
  const near={...source,boards:true};
  assert.deepEqual(recipes,[near,{...near,boardPlacement:'independent'}]);
  assert.throws(()=>studyRecipes(seedlingRecipe('reference'),'boards'),/apple orchard/);
  const scans=recipes.map(recipe=>field(recipe)), results=scans.map(scan=>analyzeStudyScan(scan,'boards'));
  checkStudyPair(...results);
  assert.deepEqual(results.map(r=>[r.tileId,r.boardPlacement,r.sampledRays,r.boardReturns]),[
    ['2067527bcc475e59','plant',60000,619],['112581f2a17baf5d','independent',60000,642]
  ]);
  for (const [i,r] of results.entries()) {
    assert.equal(r.orchardRanking,'low-wood');
    assert.equal(r.orchardSeparationMeters,1.05);
    assert.equal(r.boardReturns,scans[i].cls.filter(c=>c===4).length);
    assert.deepEqual(r.orchardScores,analyzeStudyScan(scans[i],'ranking',{ranking:'low-wood'}).orchardScores);
  }
  assert.deepEqual(results.map(r=>r.orchardScores.map(({tp,fp,fn})=>[tp,fp,fn])),[
    [[2,12,9],[3,11,8],[6,8,5]],[[1,12,10],[2,11,9],[4,9,7]]
  ]);
  assert.notDeepEqual(results[0].heightScores,results[1].heightScores);
  assert.notDeepEqual(results[0].sampledHeightScores,results[1].sampledHeightScores);
  // Point origins annotate the preview. Hiding them must leave all detector pins intact.
  const unlabelled={...scans[1],cls:new Uint8Array(scans[1].cls.length),counts:scans[1].counts.map(()=>0)};
  const hidden=analyzeStudyScan(unlabelled,'boards');
  assert.equal(hidden.boardReturns,0);
  for (const key of ['heightPins','sampledHeightPins','orchardPins']) assert.deepEqual(hidden[key],results[1][key]);
});

test('first planted tree in the board study guide maps to Tree 0 in the inspector',()=>{
  const source={...makeRecipe(22153127,true,getSensor('reference'),'apple',4,'central-leader','healthy'),
    points:60000, appleCanopy:'leafy', weeds:false, sticks:false, boards:false, scanNoise:null};
  const observations=studyRecipes(source,'boards').map(recipe=>{
    const scan=field(recipe), tree=analyzeStudyScan(scan,'boards').plants[0];
    return [scan.labels.tile_id,tree.boardReturns15cm,(100*tree.nearestOrchardPinM).toFixed(2)];
  });
  assert.deepEqual(observations,[['60d5152dcaa1f08c',22,'8.45'],['8d4bccccff0ff4ba',0,'42.16']]);
});
