// Compare branch measurements and trunk-base detection across paired v3/v4 apple orchards.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {makeRecipe,MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {measureOrchard,scoreOrchardScan,stationM} from './orchard-measurements.mjs';

const design = {
  seeds:[11043331,11179043,11314759,11450479,11586197,11721913,11857631,11993351],
  forms:['central-leader','open-vase'], versions:[3,4], canopies:['leafy','dormant'],
  conditions:['healthy','damaged'], layouts:['reference','os1-64'], sampledRays:60000,
  ground:true, weeds:false, sticks:false, boards:false, scanNoise:null, caliperStationM:stationM,
  scoreRadiiM:MATCH_RADII_METERS
};
const timingsMs={calipers:0,generation:0,orchard:0,height:0,matching:0};
function timed(stage,operation) {
  const start=performance.now(), result=operation();
  timingsMs[stage]+=performance.now()-start;
  return result;
}
const trees=[],fields=[];
for (const seed of design.seeds) for (const form of design.forms) {
  let planting;
  for (const version of design.versions) {
    const recipe=makeRecipe(seed,true,null,'apple',version,form,'healthy');
    const measured=timed('calipers',()=>measureOrchard(recipe));
    const bases=measured.map(tree=>tree.baseXY);
    planting??=bases;
    assert.deepEqual(bases,planting);
    for(const tree of measured)trees.push({...tree,version});
  }
  for(const canopy of design.canopies) for(const condition of design.conditions) for(const layout of design.layouts) {
    let original;
    for(const version of design.versions) {
      const recipe={...makeRecipe(seed,design.ground,getSensor(layout),'apple',version,form,condition),
        points:design.sampledRays,appleCanopy:canopy,weeds:design.weeds,sticks:design.sticks,boards:design.boards,scanNoise:design.scanNoise};
      const scan=timed('generation',()=>field(recipe));
      assert.deepEqual(scan.labels.boxes.map(box=>box.base_xy_m),planting);
      assert.equal(scan.sampledRays,design.sampledRays);
      assert.equal(scan.xyz.length/3,design.sampledRays);
      if(original) {
        assert.deepEqual(scan.skeleton,original.skeleton,'Woody centerlines changed');
        assert.notEqual(scan.labels.tile_id,original.labels.tile_id);
        for(let i=0;i<scan.cls.length;i++){
          assert.equal(scan.xyz[3*i],original.xyz[3*i]);
          assert.equal(scan.xyz[3*i+1],original.xyz[3*i+1]);
        }
      } else original=scan;
      const {orchard,height}=scoreOrchardScan(scan,planting,timed);
      fields.push({seed,form,canopy,condition,layout,version,tileId:scan.labels.tile_id,sampledRays:scan.sampledRays,
        targets:planting.length,woodReturns:scan.parts.reduce((n,part)=>n+(part===1),0),orchard:orchard.scores,height:height.scores});
    }
  }
}

function distribution(numbers) {
  const sorted=[...numbers].sort((a,b)=>a-b),n=sorted.length;
  return {min:sorted[0],median:(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2,
    mean:sorted.reduce((a,b)=>a+b,0)/n,max:sorted[n-1]};
}
function scoreGroup(group) {
  return Object.fromEntries(['orchard','height'].map(method=>[method,MATCH_RADII_METERS.map((radius,i)=>{
    let tp=0,fp=0,fn=0;
    for(const field of group) {
      const score=field[method][i];
      assert.equal(score.cm,100*radius);
      tp+=score.tp; fp+=score.fp; fn+=score.fn;
    }
    return {cm:100*radius,tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};
  })]));
}
const morphology=[],detection=[];
for(const version of design.versions) {
  const versionFields=fields.filter(f=>f.version===version);
  for(const form of design.forms) {
    const group=trees.filter(tree=>tree.version===version&&tree.form===form);
    morphology.push({version,form,trees:group.length,branches:group.reduce((n,t)=>n+t.branches.length,0),
      heightM:distribution(group.map(t=>t.heightAboveTrunkGroundM)),
      axisOriginRatio:distribution(group.map(t=>t.ratios.axisOriginMm)),
      barkOriginRatio:distribution(group.map(t=>t.ratios.trunkSurfaceOriginMm))});
  }
  const overall=scoreGroup(versionFields);
  const by=key=>Object.fromEntries([...new Set(versionFields.map(row=>row[key]))].map(value=>
    [value,scoreGroup(versionFields.filter(row=>row[key]===value))]));
  detection.push({version,scans:versionFields.length,overall,bySeed:by('seed'),byForm:by('form'),byCanopy:by('canopy'),
    byCondition:by('condition'),byLayout:by('layout')});
}
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',host:{node:process.version,cpu:cpus()[0]?.model},
  design,timingsMs,morphology,detection,trees,fields},null,2));
