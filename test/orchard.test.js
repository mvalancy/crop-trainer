import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOrchardBases,inspectOrchardBases,isLowOrchardReturn} from '../trainer/models/orchard.js';
import {field} from '../trainer/generator/field.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {makeRecipe,matchCenters,targetCenters} from '../trainer/models/data.js';
import {runFieldTest} from '../trainer/field-test/score-scan.js';

function syntheticColumn(x,y) {
  const xyz=[];
  for (const z of [.6,.95,1.3,1.8,2.3]) {
    for (const dx of [-.07,0,.07]) for (const dy of [-.07,0,.07]) xyz.push(x+dx,y+dy,z);
  }
  for (const dx of [-.32,.32]) for (const dy of [-.32,.32]) xyz.push(x+dx,y+dy,1.8);
  return xyz;
}

test('heights distributed around two planted columns give one independent pin per column',()=>{
  const xyz=[...syntheticColumn(2.5,3.5),...syntheticColumn(6.5,7.5)];
  const result=detectOrchardBases(xyz);
  assert.equal(result.pins.length,2);
  for (const [x,y] of [[2.5,3.5],[6.5,7.5]]) {
    assert.ok(result.pins.some(p=>Math.hypot(p.x-x,p.y-y)<.08 && p.score>=result.threshold));
  }
  // Repeating returns at one occupied cell cannot inflate support.
  assert.deepEqual(result,detectOrchardBases([...xyz,...xyz]));
});

test('bare soil and an isolated high return do not supply vertical support',()=>{
  assert.deepEqual(detectOrchardBases([2,3,0,2.1,3,.03,2.15,3,2.6]).pins,[]);
  assert.deepEqual(detectOrchardBases([]).pins,[]);
  assert.throws(()=>detectOrchardBases([2,3,Infinity]),/finite/);
  assert.throws(()=>detectOrchardBases([-1,3,1]),/plot/);
  assert.throws(()=>detectOrchardBases([1,2]),/XYZ/);
  for(const spacing of [0, Infinity, '0.75']) {
    assert.throws(()=>detectOrchardBases([], {separationMeters:spacing}),/orchard candidate spacing/);
  }
});

test('low-return evidence changes only the ranking of already eligible orchard cells',()=>{
  const upper=[...syntheticColumn(3.025,4.025),...syntheticColumn(3.825,4.025)];
  const lower=[3.825,4.025,.15,3.875,4.025,.45,3.775,4.025,.46];
  const trace={includeStages:true}, experiment={...trace,ranking:'low-wood'};
  const ordinary=detectOrchardBases(upper,trace);
  assert.deepEqual(detectOrchardBases([...upper,...lower],{...trace,ranking:'support'}),ordinary);
  assert.deepEqual(detectOrchardBases(upper,experiment).pins,ordinary.pins);
  assert.deepEqual(detectOrchardBases(lower,experiment).pins,[]);
  assert.throws(()=>detectOrchardBases(upper,{ranking:'unknown'}),/ranking/);

  const trial=detectOrchardBases([...upper,...lower],experiment);
  assert.equal(trial.ranking,'low-wood');
  assert.deepEqual(trial.lowCellIds,[80*200+75,80*200+76,80*200+77]);
  assert.ok(!('lowCellIds' in ordinary));
  assert.ok(!('lowCellIds' in detectOrchardBases(upper,{ranking:'low-wood'})));
  assert.equal(trial.candidateCount,ordinary.candidateCount);
  assert.equal(trial.pins.length,1);
  assert.equal(ordinary.pins.length,1);
  assert.ok(ordinary.pins[0].x<3.2 && trial.pins[0].x>3.7);
  assert.deepEqual(detectOrchardBases([...upper,...lower,...lower],experiment),trial);
  const originalScores=new Map(ordinary.supportCells.map(p=>[[p.x,p.y].join(','),p.score]));
  assert.ok(trial.supportCells.some(cell=>cell.lowCellCount>2));
  for(const cell of trial.supportCells){
    assert.equal(cell.score,originalScores.get([cell.x,cell.y].join(',')));
    assert.equal(cell.rankScore,cell.score+Math.min(cell.lowCellCount,2));
  }
  assert.deepEqual([.149999,.15,.479999,.48].map(isLowOrchardReturn),[false,true,true,false]);
});

test('collecting the support trace preserves every prediction in a paired v3/v4 orchard',()=>{
  const expected=[
    {version:3,tile:'ac90cc2ee71a50fe',state:'matched',support:20,spaced:1},
    {version:4,tile:'c1222bdf0546d761',state:'spacing',support:3,spaced:0}
  ];
  for (const {version,tile,state,support,spaced} of expected) {
    const recipe=makeRecipe(14151223,true,getSensor('reference'),'apple',version,'central-leader','healthy');
    const scan=field({...recipe,appleCanopy:'leafy',points:60000,weeds:false,sticks:false,boards:false,scanNoise:null});
    assert.equal(scan.labels.tile_id,tile);
    const result=detectOrchardBases(scan.xyz);
    const trace=detectOrchardBases(scan.xyz,{includeStages:true});
    const {supportCells,spacedCells,...sameOutput}=trace;
    assert.deepEqual(sameOutput,result);
    assert.equal(supportCells.length,result.candidateCount);
    assert.equal(spacedCells.length,result.pins.length);

    const truth=targetCenters(scan.labels.boxes);
    const {pinByBox}=matchCenters(result.pins.map(({x,y})=>[x,y]),truth,.15);
    const tree=inspectOrchardBases(trace,truth,pinByBox)[2];
    assert.deepEqual([tree.state,tree.supportCellCount,tree.spacedCellCount],[state,support,spaced]);
  }
});

test('plot boundary roundoff maps to the nearest valid orchard cell',()=>{
  const column=syntheticColumn(.34,.34);
  const exact=[...column,0,0,1.25,10,10,1.25];
  const rounded=[...column,-5e-10,-5e-10,1.25,10+5e-10,10+5e-10,1.25];
  assert.deepEqual(detectOrchardBases(rounded),detectOrchardBases(exact));
  assert.throws(()=>detectOrchardBases([10+2e-9,0,1.25]),/plot/);
});

test('surveyed and blind apple field tests map the same third-method pins into the scan frame',()=>{
  const model={
    format:'crop-trainer-weights-v1',featureSchema:'crop-peak-13-v1',crop:'apple',inputs:13,
    hiddenLayers:[],activation:'tanh',output:'sigmoid',weights:Array(14).fill(0),
    scaling:{means:Array(13).fill(0),std:Array(13).fill(1)},minimumHeight:.035,
    threshold:.9,pinSeparation:1.05
  };
  const bases=[[2.5,3.5],[6.5,7.5]];
  const xyz=bases.flatMap(([x,y])=>syntheticColumn(x,y));
  const local=runFieldTest({model,xyz});
  const origin=[62000000,490000000,13500];
  const alignment={unit:'cm',origin,gradePercent:[4,-2]};
  const world=new Float64Array(xyz.length);
  for (let i=0;i<xyz.length;i+=3) {
    const [x,y,z]=xyz.slice(i,i+3);
    world[i]=origin[0]+100*x;
    world[i+1]=origin[1]+100*y;
    world[i+2]=origin[2]+100*z+4*x-2*y;
  }
  const blind=runFieldTest({model,xyz:world,alignment});
  assert.equal(blind.references,null);
  assert.equal(blind.orchardEvaluation,null);
  assert.equal(blind.orchard.method,'height-band-occupancy-v1');
  assert.equal(blind.orchard.pins.length,2);
  for (const [i,pin] of blind.orchard.pins.entries()) {
    const expected=local.orchard.pins[i];
    assert.deepEqual(pin,{...expected,x:origin[0]+100*expected.localX,y:origin[1]+100*expected.localY});
    assert.ok(pin.support>=blind.orchard.threshold);
  }
  const labels={filename:'bases.csv',text:['x,y',...bases.map(([x,y])=>
    [origin[0]+100*x,origin[1]+100*y].join(','))].join('\n')};
  const surveyed=runFieldTest({model,xyz:world,alignment,labels});
  assert.deepEqual(surveyed.orchard,blind.orchard);
  assert.deepEqual(surveyed.orchardEvaluation.scores.map(({cm,tp,fp,fn})=>[cm,tp,fp,fn]),
    [[7.5,2,0,0],[10,2,0,0],[15,2,0,0]]);
  assert.ok(surveyed.evaluation.scores.every(row=>row.tp===0 && row.fn===2));
  assert.ok(surveyed.baselinePins.length>0);
  assert.equal(surveyed.baselineEvaluation.scores.length,3);
});
