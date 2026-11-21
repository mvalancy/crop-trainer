// Diagnose trunk-base misses in paired synthetic scans using the production locator and matcher.
import assert from 'node:assert/strict';
import {arch, cpus, platform} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {cropProfile} from '../../trainer/generator/crops.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {features,detectionStages,makeRecipe,matchCenters,MATCH_RADII_METERS,targetCenters} from '../../trainer/models/data.js';
import {detectOrchardBases,inspectOrchardBases} from '../../trainer/models/orchard.js';

const design = {
  seeds:{development:[13010371,13120793,13231219,13341643],
    confirmation:[14151223,14261647,14372069,14482493,14592917,14703341]},
  versions:[3,4], forms:['central-leader','open-vase'], canopies:['leafy','dormant'], layouts:['reference','os1-64'],
  crop:'apple',condition:'healthy',rays:60000,ground:true,clutter:false,scanNoise:null,
  innerRadiusM:.4, scoreRadiiM:MATCH_RADII_METERS, heightGateM:.065, separationM:cropProfile('apple').pinSeparation
};
const requested = process.argv.slice(2);
if (requested.length > 1 || requested.length && !Object.hasOwn(design.seeds,requested[0])) {
  throw Error('Usage: node benchmark/studies/orchard-support.mjs [development|confirmation]');
}

function score(pins, truth) {
  let indices15;
  const scores=MATCH_RADII_METERS.map(radius => {
    const {count:tp,pinByBox}=matchCenters(pins,truth,radius);
    if (radius===.15) indices15=pinByBox;
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp};
  });
  return {scores,indices15};
}

function makePair(seed,form,canopy,layout,timed) {
  const scans=design.versions.map(version=>{
    const recipe={...makeRecipe(seed,true,getSensor(layout),'apple',version,form,'healthy'),
      points:design.rays, appleCanopy:canopy, weeds:false,sticks:false,boards:false,scanNoise:null};
    return timed('generation',()=>field(recipe));
  });
  const [v3,v4]=scans,truth=targetCenters(v4.labels.boxes);
  assert.deepEqual(targetCenters(v3.labels.boxes),truth);
  assert.deepEqual(v3.skeleton,v4.skeleton,'Changed branch centerlines');
  assert.notEqual(v3.labels.tile_id,v4.labels.tile_id);
  for (const scan of scans) {
    assert.equal(scan.sampledRays,design.rays);
    assert.equal(scan.xyz.length/3,design.rays);
  }
  // The zones are disjoint. Swapping Z preserves the XY and changes neither survey nor detector.
  for(let i=1;i<truth.length;i++)for(const [x,y] of truth.slice(0,i)) {
    assert(Math.hypot(x-truth[i][0],y-truth[i][1])>2*design.innerRadiusM);
  }
  const inner=v4.xyz.slice(), outer=v4.xyz.slice(), changed={inner:0,outer:0};
  const wood={v3:{inner:0,outer:0},v4:{inner:0,outer:0}};
  for(let i=0;i<design.rays;i++) {
    const j=3*i, x=v4.xyz[j], y=v4.xyz[j+1];
    assert.equal(x,v3.xyz[j]); assert.equal(y,v3.xyz[j+1]);
    const near=truth.some(([tx,ty])=>(tx-x)**2+(ty-y)**2<=design.innerRadiusM**2);
    const zone=near?'inner':'outer';
    if(v3.parts[i]===1) wood.v3[zone]++;
    if(v4.parts[i]===1) wood.v4[zone]++;
    if(v3.xyz[j+2]!==v4.xyz[j+2]) {
      changed[zone]++;
      (near?inner:outer)[j+2]=v3.xyz[j+2];
    }
  }
  return {truth,xyz:{v3:v3.xyz,v4:v4.xyz,v3Inner:inner,v3Outer:outer},wood,changed,
    tileIds:scans.map(scan=>scan.labels.tile_id)};
}

function evaluate(xyz,truth,original,timed) {
  const locator=timed('orchard',()=>detectOrchardBases(xyz,{includeStages:true}));
  const measured=timed('matching',()=>score(locator.pins.map(p=>[p.x,p.y]),truth));
  const stages=timed('diagnostics',()=>inspectOrchardBases(locator,truth,measured.indices15));
  const evaluation={orchard:measured.scores};
  if (original) {
    const pins=timed('height',()=>{
      const peaks=features({xyz},design.heightGateM,'zero-filled');
      return detectionStages(peaks,peaks.pos.map((_,i)=>peaks.X[13*i]),0,design.separationM).selected;
    });
    evaluation.height=timed('matching',()=>score(pins,truth).scores);
    // Store one diagnostic per known base; raw scans and candidate grids can be regenerated.
    evaluation.trees=stages.map(({state,supportCellCount,spacedCellCount,nearestPinMeters})=>
      ({state,supportCellCount,spacedCellCount,nearestPinMeters}));
  }
  return evaluation;
}

function aggregate(pairs) {
  const counts={};
  for(const variant of ['v3','v4','v3Inner','v3Outer']){
    const methods={};counts[variant]=methods;
    for(const method of Object.keys(pairs[0].evaluations[variant]).filter(key=>key!=='trees')){
      methods[method]=MATCH_RADII_METERS.map((r,i)=>{
        let tp=0,fp=0,fn=0;
        for(const pair of pairs){
          const s=pair.evaluations[variant][method][i];
          assert.equal(s.cm,r*100);tp+=s.tp;fp+=s.fp;fn+=s.fn;
        }
        return {cm:r*100,tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};
      });
    }
  }
  const transitions={},wood={v3:{inner:0,outer:0},v4:{inner:0,outer:0}},changed={inner:0,outer:0};
  for(const pair of pairs) {
    for(const zone of ['inner','outer']){
      changed[zone]+=pair.changed[zone];
      for(const version of ['v3','v4'])wood[version][zone]+=pair.wood[version][zone];
    }
    const {v3,v4}=pair.evaluations;
    for(let i=0;i<v3.trees.length;i++){
      const transition=v3.trees[i].state+' → '+v4.trees[i].state;
      transitions[transition]=(transitions[transition]??0)+1;
    }
  }
  return {pairs:pairs.length,counts,transitions15:transitions,wood,changed};
}

function run(seeds) {
  const timingsMs={generation:0,orchard:0,height:0,matching:0,diagnostics:0,total:0};
  const start=performance.now();
  function timed(phase,fn) {
    const t=performance.now(),value=fn();
    timingsMs[phase]+=performance.now()-t;
    return value;
  }
  const pairs=[];
  for(const seed of seeds)for(const form of design.forms)for(const canopy of design.canopies)for(const layout of design.layouts) {
    const {xyz,...pair}=makePair(seed,form,canopy,layout,timed);
    pair.evaluations={};
    for(const [variant,scan] of Object.entries(xyz)) {
      pair.evaluations[variant]=evaluate(scan,pair.truth,variant==='v3'||variant==='v4',timed);
    }
    pairs.push({seed,form,canopy,layout,...pair});
  }
  const bySeed=seeds.map(seed=>({seed,...aggregate(pairs.filter(p=>p.seed===seed))}));
  const aggregateScores=aggregate(pairs);
  timingsMs.total=performance.now()-start;
  return {seeds,timingsMs,aggregate:aggregateScores,bySeed,pairs};
}
const splits={};
for(const split of requested.length?requested:Object.keys(design.seeds))splits[split]=run(design.seeds[split]);
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',runtime:{node:process.version,os:platform(),arch:arch(),cpu:cpus()[0]?.model},
  design,splits},null,2));
