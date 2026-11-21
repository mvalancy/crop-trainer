// Does adding a rank bonus for low returns move more orchard pins toward the planted base?
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {makeRecipe, features, detectionStages, MATCH_RADII_METERS, targetCenters} from '../../trainer/models/data.js';
import {detectOrchardBases, inspectOrchardBases, ORCHARD_GRID_SIDE} from '../../trainer/models/orchard.js';
import {evaluatePins} from '../../trainer/field-test/references.js';

const design={
  seeds:{
    development:[18101637,18212749,18323861,18434973],
    confirmation:[19105417,19216529,19327641,19438753,19549865,19660977]
  },
  density:{seeds:[21101143,21212257,21323369,21434483],rays:[12000,60000]},
  crop:'apple', plantArchitecture:4, rays:60000, ground:true, scanNoise:null, weeds:false, sticks:false, boards:false,
  forms:['central-leader','open-vase'], conditions:['healthy','damaged'], canopies:['leafy','dormant'],
  layouts:['reference','os1-64'], spacingM:1.05, peakFloorM:.065, trainingMs:0,
  rule:'Add one point per distinct occupied 5 cm cell in the central 3 by 3 cells with 0.15 <= z < 0.48 m, capped at two points. Only greedy ranking changes.'
};
const requested=process.argv.slice(2);
if (requested.length>1 || (requested.length && requested[0]!=='density' && !Object.hasOwn(design.seeds,requested[0]))) {
  throw Error('Usage: node benchmark/studies/orchard-ranking.mjs [development|confirmation|density]');
}

const local=([localX,localY])=>({localX,localY});
const cellsPerMeter=ORCHARD_GRID_SIDE/10;
const cellKey=cell=>Math.floor(cell.y*cellsPerMeter)*ORCHARD_GRID_SIDE+Math.floor(cell.x*cellsPerMeter);

function analyze(scan, truth, timed) {
  const references=truth.map(local);
  const heightPins=timed('height',()=>{
    const peaks=features({xyz:scan.xyz},design.peakFloorM);
    const heights=peaks.pos.map((_,i)=>peaks.X[13*i]);
    return detectionStages(peaks,heights,0,design.spacingM).selected;
  });
  const height=timed('matching',()=>evaluatePins(heightPins.map(local),references).scores);
  const methods={}, traces={};
  for (const ranking of ['support','low-wood']) {
    const result=timed(ranking,()=>detectOrchardBases(scan.xyz,{ranking,includeStages:true,separationMeters:design.spacingM}));
    const pins=result.pins.map(p=>local([p.x,p.y]));
    const scored=timed('matching',()=>evaluatePins(pins,references));
    const diagnoses=timed('diagnosis',()=>inspectOrchardBases(result,truth,scored.pinByReference15));
    methods[ranking]={scores:scored.scores,trees:diagnoses.map((tree,i)=>({
      matchedPin:scored.pinByReference15[i],state:tree.state,qualified:tree.supportCellCount,
      retained:tree.spacedCellCount,nearestPinM:tree.nearestPinMeters,
      bestNearby:tree.strongestCell,nearestSource:result.spacedCells[tree.nearestPinIndex]??null
    }))};
    traces[ranking]=result;
  }
  // Verify every candidate's unmodified support and every common winner's final centering.
  timed('diagnosis',()=>{
    const base=traces.support,trial=traces['low-wood'];
    assert.equal(trial.threshold,base.threshold);
    assert.equal(trial.candidateCount,base.candidateCount);
    const supportByCell=new Map(base.supportCells.map(c=>[cellKey(c),c.score]));
    for (const cell of trial.supportCells) {
      assert.equal(cell.score,supportByCell.get(cellKey(cell)));
      assert.equal(cell.rankScore,cell.score+Math.min(2,cell.lowCellCount));
    }
    const pinByCell=new Map(base.spacedCells.map((c,i)=>[cellKey(c),base.pins[i]]));
    trial.spacedCells.forEach((c,i)=>{
      const common=pinByCell.get(cellKey(c));
      if(common) assert.deepEqual(trial.pins[i],common);
    });
  });
  return {scores:{height,support:methods.support.scores,'low-wood':methods['low-wood'].scores},
    trees:truth.map(([x,y],i)=>({x,y,support:methods.support.trees[i],'low-wood':methods['low-wood'].trees[i]}))};
}

function summarize(scans) {
  const scores={};
  for(const method of ['height','support','low-wood']){
    scores[method]=MATCH_RADII_METERS.map((radius,i)=>{
      let tp=0,fp=0,fn=0;
      for(const scan of scans) {
        const s=scan.scores[method][i];
        assert.equal(s.cm,radius*100);
        tp+=s.tp;fp+=s.fp;fn+=s.fn;
      }
      return {cm:radius*100,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,
        recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
    });
  }
  let gained=0,lost=0;
  const byNearBaseCue={}, transitions15={}, distinctGains=new Set();
  for(const scan of scans) for(const [index,tree] of scan.trees.entries()){
    const standard=tree.support, trial=tree['low-wood'];
    assert.equal(standard.qualified,trial.qualified);
    const category=!trial.bestNearby?'noEligibleCell':trial.bestNearby.lowCellCount?'bestCellHasBonus':'bestCellHasNoBonus';
    const group=byNearBaseCue[category]??={trees:0,gained:0,lost:0};
    const a=standard.matchedPin>=0,b=trial.matchedPin>=0;
    const transition=standard.state+' to '+trial.state;
    transitions15[transition]=(transitions15[transition]??0)+1;
    group.trees++;
    if(!a && b){group.gained++;gained++;distinctGains.add(scan.seed+'/'+index);}
    if(a && !b){group.lost++;lost++;}
  }
  assert.equal(gained-lost,scores['low-wood'].at(-1).tp-scores.support.at(-1).tp);
  return {scanCount:scans.length,scores,gained15:gained,lost15:lost,distinctTreesGaining15:distinctGains.size,transitions15,byNearBaseCue};
}

function run(seeds, budgets=[design.rays]) {
  const start=performance.now(), scans=[];
  const timingsMs={generation:0,height:0,support:0,'low-wood':0,matching:0,diagnosis:0};
  function timed(key,fn){
    const before=performance.now(), result=fn();
    timingsMs[key]+=performance.now()-before;
    return result;
  }
  for (const seed of seeds) {
    let bases;
    for(const form of design.forms) for(const condition of design.conditions) for(const canopy of design.canopies) for(const layout of design.layouts) for(const rays of budgets) {
      const recipe={...makeRecipe(seed,true,getSensor(layout),'apple',4,form,condition),
        points:rays,appleCanopy:canopy,scanNoise:null,weeds:false,sticks:false,boards:false};
      const scan=timed('generation',()=>field(recipe)), truth=targetCenters(scan.labels.boxes);
      if(!bases)bases=truth;
      assert.deepEqual(truth,bases);
      assert.equal(scan.sampledRays,rays);
      scans.push({seed,form,condition,canopy,layout,rays,tileId:scan.labels.tile_id,...analyze(scan,truth,timed)});
    }
  }
  const by={};
  for(const key of ['seed','form','condition','canopy','layout','rays']){
    by[key]=Object.fromEntries([...new Set(scans.map(s=>s[key]))].map(value=>[value,summarize(scans.filter(scan=>scan[key]===value))]));
  }
  const aggregate=summarize(scans);
  timingsMs.total=performance.now()-start;
  return {aggregate,by,timingsMs,scans};
}

const splits={};
for(const name of requested.length?requested:Object.keys(design.seeds)){
  splits[name]=name==='density'?run(design.density.seeds,design.density.rays):run(design.seeds[name]);
}
console.log(JSON.stringify({domain:'synthetic',runtime:{node:process.version,cpu:cpus()[0].model},design,splits},null,2));
