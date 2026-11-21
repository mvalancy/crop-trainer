// Does changing greedy cell spacing improve tree-base localization on the same overhead returns?
import assert from 'node:assert/strict';
import {arch,cpus,platform} from 'node:os';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {detectionStages,features,makeRecipe,matchCenters,MATCH_RADII_METERS,targetCenters} from '../../trainer/models/data.js';
import {detectOrchardBases,inspectOrchardBases} from '../../trainer/models/orchard.js';

const design={
  seeds:{development:[16103321,16214453,16325581,16436713],confirmation:[17107753,17218883,17330009,17441141,17552273,17663401]},
  crop:'apple',plantArchitecture:4,forms:['central-leader','open-vase'],conditions:['healthy','damaged'],
  canopies:['leafy','dormant'],layouts:['reference','os1-64'],rays:60000,
  ground:true,weeds:false,sticks:false,boards:false,scanNoise:null,
  defaultSpacingM:1.05,spacingM:[.75,1.05,1.35],scoreRadiiM:MATCH_RADII_METERS,heightGateM:.065
};
const requested=process.argv.slice(2);
if(requested.length>1 || requested.length && !Object.hasOwn(design.seeds,requested[0])) {
  throw Error('Usage: node benchmark/studies/orchard-spacing.mjs [development|confirmation]');
}

function measure(pins,truth) {
  let indices15;
  const scores=design.scoreRadiiM.map(radius=>{
    const {count:tp,pinByBox}=matchCenters(pins,truth,radius);
    if(radius===.15) indices15=pinByBox;
    return {cm:100*radius,tp,fp:pins.length-tp,fn:truth.length-tp};
  });
  return {scores,indices15};
}

// Reconstruct the exact greedy decision for the strongest eligible cell in a missed base's disk.
// The locator ranks the 5 cm grid by support, enumerating equal scores in row-major order.
function blockingCells(trace,diagnosis) {
  const step=.05, side=200;
  function gridCell(p) {
    const col=Math.round(p.x/step-.5),row=Math.round(p.y/step-.5);
    assert.ok(col>=0 && col<side && row>=0 && row<side);
    assert.equal(p.x,(col+.5)*step);assert.equal(p.y,(row+.5)*step);
    return {col,row,key:row*side+col};
  }
  const rankByCell=new Map();
  let previousScore=Infinity, previousKey=-1;
  for(const [rank,p] of trace.supportCells.entries()) {
    const {key}=gridCell(p);
    assert.ok(p.score<previousScore || p.score===previousScore && key>previousKey,'Unexpected score/tie order');
    rankByCell.set(key,rank);
    previousScore=p.score;previousKey=key;
  }
  assert.equal(rankByCell.size,trace.supportCells.length);
  let previousRank=-1;
  const kept=trace.spacedCells.map(p=>{
    const cell=gridCell(p),rank=rankByCell.get(cell.key);
    assert.ok(rank>previousRank,'Kept cells are out of greedy order');previousRank=rank;
    return {...cell,rank};
  });
  return diagnosis.map(tree=>{
    if(tree.state!=='spacing')return null;
    const candidate=gridCell(tree.strongestCell),rank=rankByCell.get(candidate.key);
    assert.ok(Number.isInteger(rank));
    for(const earlier of kept) {
      if(earlier.rank>=rank)break;
      const distanceSquared=((candidate.col-earlier.col)**2+(candidate.row-earlier.row)**2)*step**2;
      if(distanceSquared<trace.separationMeters**2) {
        const firstBlockerScore=trace.supportCells[earlier.rank].score;
        assert.ok(firstBlockerScore>=tree.strongestCell.score);
        return {candidateCell:candidate.key,candidateRank:rank,candidateScore:tree.strongestCell.score,
          firstBlockerCell:earlier.key,firstBlockerRank:earlier.rank,firstBlockerScore,
          distanceM:Math.sqrt(distanceSquared),insideShortRadius:distanceSquared<.75**2};
      }
    }
    assert.fail('Every rejected candidate must have an earlier retained cell within the minimum spacing');
  });
}

function evaluate(scan,truth,timed) {
  const {xyz}=scan;
  const peaks=timed('heightFeatures',()=>features({xyz},design.heightGateM,'zero-filled'));
  const heights=peaks.pos.map((_,i)=>peaks.X[13*i]);
  const orchard={},height={};
  let originalSupport;
  for(const spacing of design.spacingM) {
    const result=timed('orchard',()=>detectOrchardBases(xyz,{separationMeters:spacing,includeStages:true}));
    assert.equal(result.separationMeters,spacing);
    assert.equal(result.threshold,4);
    if(originalSupport) assert.deepEqual(result.supportCells,originalSupport,'Changing spacing changed eligible cells');
    else originalSupport=result.supportCells;

    const pins=result.pins.map(p=>[p.x,p.y]);
    const {scores,indices15}=timed('matching',()=>measure(pins,truth));
    const diagnosis=timed('diagnostics',()=>inspectOrchardBases(result,truth,indices15));
    const blockers=timed('diagnostics',()=>blockingCells(result,diagnosis));
    orchard[spacing]={scores,pins,trees:diagnosis.map((tree,i)=>({
      matchedPin:indices15[i], state:tree.state, qualified:tree.supportCellCount,
      retained:tree.spacedCellCount, nearestPinM:tree.nearestPinMeters,...(blockers[i]?{blocker:blockers[i]}:{})
    }))};
    const heightPins=timed('heightSpacing',()=>detectionStages(peaks,heights,0,spacing).selected);
    height[spacing]=timed('matching',()=>measure(heightPins,truth)).scores;
  }
  return {orchard,height};
}

function pooled(scans,method,spacing) {
  return design.scoreRadiiM.map((radius,i)=>{
    let tp=0,fp=0,fn=0;
    for(const scan of scans) {
      const evaluated=scan[method][spacing];
      const row=(method==='orchard'?evaluated.scores:evaluated)[i];
      assert.equal(row.cm,100*radius);
      tp+=row.tp;fp+=row.fp;fn+=row.fn;
    }
    return {cm:100*radius,tp,fp,fn,precision:tp/(tp+fp)||0,recall:tp/(tp+fn)||0,f1:2*tp/(2*tp+fp+fn)||0};
  });
}

function summary(scans) {
  const orchard={}, height={},changes={};
  const baseline=pooled(scans,'orchard',design.defaultSpacingM).at(-1);
  for(const spacing of design.spacingM) {
    orchard[spacing]=pooled(scans,'orchard',spacing);
    height[spacing]=pooled(scans,'height',spacing);
    if(spacing===design.defaultSpacingM) continue;
    const byDefaultState={};
    let gained=0,lost=0;
    for(const scan of scans) {
      const original=scan.orchard[design.defaultSpacingM].trees;
      const revised=scan.orchard[spacing].trees;
      for(const [i,tree] of original.entries()){
        const now=revised[i].state==='matched';
        const group=byDefaultState[tree.state]??={total:0,matched:0};
        group.total++;
        if(now) group.matched++;
        if(now && tree.state!=='matched') gained++;
        if(!now && tree.state==='matched') lost++;
      }
    }
    const changed=orchard[spacing].at(-1);
    assert.equal(gained-lost,changed.tp-baseline.tp);
    changes[spacing]={gained,lost,extraPinChange:changed.fp-baseline.fp,byDefaultState};
  }
  const blockersAt15cm={defaultSpacingMisses:0,firstBlockerInsideShortRadius:0,firstBlockerOutsideShortRadius:0,
    stillSpacingAtShort:0,sameFirstBlockerAtShort:0,higherSupport:0,equalSupport:0};
  for(const scan of scans) {
    const defaults=scan.orchard[design.defaultSpacingM].trees,shorter=scan.orchard[.75].trees;
    for(const [i,tree] of defaults.entries()) {
      if(tree.state!=='spacing')continue;
      blockersAt15cm.defaultSpacingMisses++;
      if(tree.blocker.firstBlockerScore>tree.blocker.candidateScore)blockersAt15cm.higherSupport++;
      else blockersAt15cm.equalSupport++;
      if(tree.blocker.insideShortRadius)blockersAt15cm.firstBlockerInsideShortRadius++;
      else blockersAt15cm.firstBlockerOutsideShortRadius++;
      const next=shorter[i];
      if(next.state!=='spacing')continue;
      blockersAt15cm.stillSpacingAtShort++;
      assert.equal(next.blocker.candidateCell,tree.blocker.candidateCell);
      if(next.blocker.firstBlockerCell===tree.blocker.firstBlockerCell)blockersAt15cm.sameFirstBlockerAtShort++;
    }
  }
  return {scans:scans.length,orchard,height,changesAt15cm:changes,blockersAt15cm};
}

function run(seeds) {
  const start=performance.now(),scans=[];
  const timingsMs={generation:0,orchard:0,heightFeatures:0,heightSpacing:0,matching:0,diagnostics:0};
  function timed(stage,operation) {
    const t=performance.now(),value=operation();
    timingsMs[stage]+=performance.now()-t;
    return value;
  }
  for(const seed of seeds) {
    let firstTruth;
    const referenceXY=new Map();
    for(const form of design.forms) for(const condition of design.conditions) for(const canopy of design.canopies) for(const layout of design.layouts) {
      const recipe={...makeRecipe(seed,design.ground,getSensor(layout),design.crop,design.plantArchitecture,form,condition),
        appleCanopy:canopy,points:design.rays,weeds:design.weeds,sticks:design.sticks,boards:design.boards,scanNoise:design.scanNoise};
      const scan=timed('generation',()=>field(recipe));
      assert.equal(scan.sampledRays,design.rays);
      assert.equal(scan.xyz.length,3*design.rays);
      const truth=targetCenters(scan.labels.boxes);
      if(firstTruth) assert.deepEqual(truth,firstTruth,'A paired tree base moved');
      else firstTruth=truth;
      const first=referenceXY.get(layout);
      if(first){
        for(let i=0;i<scan.xyz.length;i+=3) {
          assert.equal(scan.xyz[i],first[i]); assert.equal(scan.xyz[i+1],first[i+1]);
        }
      } else referenceXY.set(layout,scan.xyz);
      scans.push({seed,form,condition,canopy,layout,tileId:scan.labels.tile_id,sampledRays:scan.sampledRays,truth,...evaluate(scan,truth,timed)});
    }
  }
  const groups=values=>Object.fromEntries(values.map(([name,group])=>[name,summary(group)]));
  const bySeed=groups(seeds.map(seed=>[seed,scans.filter(scan=>scan.seed===seed)]));
  const byConditionAndCanopy=groups(design.conditions.flatMap(condition=>design.canopies.map(canopy=>
    [condition+' '+canopy,scans.filter(scan=>scan.condition===condition && scan.canopy===canopy)])));
  const aggregate=summary(scans);
  timingsMs.total=performance.now()-start;
  return {timingsMs,aggregate,bySeed,byConditionAndCanopy,scans};
}

const splits={};
for(const name of requested.length?requested:Object.keys(design.seeds)) splits[name]=run(design.seeds[name]);
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',runtime:{node:process.version,os:platform(),arch:arch(),cpu:cpus()[0]?.model},design,splits},null,2));
