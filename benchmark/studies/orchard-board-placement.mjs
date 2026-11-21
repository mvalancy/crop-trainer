// Does a board help a low-return ranking rule when board positions are independent of the trees?
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {boardLayout} from '../../trainer/generator/boards.js';
import {seededRandom} from '../../trainer/plants/traits.js';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {features, detectionStages, makeRecipe, matchCenters, MATCH_RADII_METERS, targetCenters} from '../../trainer/models/data.js';
import {detectOrchardBases, isLowOrchardReturn} from '../../trainer/models/orchard.js';

const seeds = {
  development: [21157163, 21268279, 21379397, 21490513],
  confirmation: [22153127, 22264243, 22375361, 22486489, 22597597, 22708711],
  damage: [23151119, 23262233, 23373349, 23484467]
};
const layouts = ['reference', 'os1-64'];
const placements = ['clear', 'plant', 'independent'];
const methods = ['height', 'support', 'lowReturns', 'maskedBoards'];
const settings = {crop:'apple', plantArchitecture:4, plantForm:'central-leader', appleCanopy:'leafy',
  points:60000, ground:true, weeds:false, sticks:false, scanNoise:null};
const peakHeightM = .065, separationM = 1.05, proximityM = .15;

function orchard(xyz, ranking) {
  return detectOrchardBases(xyz, {ranking, separationMeters:separationM}).pins.map(p => [p.x,p.y]);
}

function score(pins, targets) {
  let pinByTree15;
  const scores = MATCH_RADII_METERS.map(radius => {
    const {count:tp,pinByBox} = matchCenters(pins,targets,radius);
    if (radius === .15) pinByTree15 = Array.from(pinByBox);
    return {cm:100*radius, tp, fp:pins.length-tp, fn:targets.length-tp};
  });
  return {pins, scores, pinByTree15};
}

function analyzeScan(scan, targets, timed) {
  const {xyz,cls} = scan;
  const pins = {
    height:timed('height', () => {
      const peaks = features({xyz},peakHeightM);
      return detectionStages(peaks,peaks.pos.map((_,i)=>peaks.X[13*i]),0,separationM).selected;
    }),
    support:timed('support', () => orchard(xyz,'support')),
    lowReturns:timed('lowReturns', () => orchard(xyz,'low-wood'))
  };
  // Simulator-only attribution after the three blind rules have placed all their pins.
  const origin = timed('attribution', () => {
    const masked = xyz.slice(), nearTree = targets.map(()=>0);
    let lowCrop=0, boards=0, lowBoards=0, lowBoardsNear=0;
    for (let i=0; i<cls.length; i++) {
      if (cls[i]===4) boards++;
      if (!isLowOrchardReturn(xyz[3*i+2])) continue;
      if (cls[i]===1) lowCrop++;
      if (cls[i]!==4) continue;
      lowBoards++;
      masked[3*i+2]=0;
      let near=false;
      for (const [j,[x,y]] of targets.entries()) {
        if ((x-xyz[3*i])**2+(y-xyz[3*i+1])**2 <= proximityM**2) {
          nearTree[j]++; near=true;
        }
      }
      if (near) lowBoardsNear++;
    }
    pins.maskedBoards = lowBoards ? orchard(masked,'low-wood') : pins.lowReturns;
    return {lowCrop,boards,lowBoards,lowBoardsNear,nearTree};
  });
  const evaluated = timed('scoring', () =>
    Object.fromEntries(methods.map(method=>[method,score(pins[method],targets)])));
  return {tileId:scan.labels.tile_id, targets, origin, evaluated};
}

function verifyBoardGeometry(seed,plantCenters) {
  const pair=['plant','independent'].map(placement=>boardLayout({seed,plantCenters,placement,plotSize:10,
    obstacleRandom:seededRandom(seed ^ 54321)}));
  const dimensions=boards=>boards.map(({angle,halfLength,halfWidth})=>[angle,halfLength,halfWidth]);
  assert.equal(pair[0].length,9);
  assert.deepEqual(dimensions(pair[0]),dimensions(pair[1]));
  for (const board of pair[0]) assert.ok(plantCenters.some(([x,y])=>x===board.x && y===board.y));
}

function verifyBoardPair(clear, scan) {
  assert.notEqual(clear.labels.tile_id, scan.labels.tile_id);
  assert.deepEqual(clear.labels.boxes,scan.labels.boxes);
  assert.deepEqual(clear.skeleton, scan.skeleton);
  assert.equal(scan.xyz.length,clear.xyz.length);
  for (let i=0; i<scan.cls.length; i++) {
    assert.equal(scan.xyz[3*i],clear.xyz[3*i]);
    assert.equal(scan.xyz[3*i+1],clear.xyz[3*i+1]);
    if (scan.cls[i]!==4) {
      assert.equal(scan.cls[i],clear.cls[i]);
      assert.equal(scan.xyz[3*i+2],clear.xyz[3*i+2]);
    }
  }
}

function pool(scans,method) {
  return MATCH_RADII_METERS.map((radius,i)=>{
    let tp=0, fp=0, fn=0;
    for (const scan of scans) {
      const s=scan.evaluated[method].scores[i];
      assert.equal(s.cm,100*radius);
      tp+=s.tp; fp+=s.fp; fn+=s.fn;
    }
    return {cm:100*radius,tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};
  });
}

function summarize(scans) {
  return Object.fromEntries(placements.map(placement=>{
    const subset=scans.filter(s=>s.placement===placement);
    const scores=Object.fromEntries(methods.map(method=>[method,pool(subset,method)]));
    const origin={lowCrop:0,boards:0,lowBoards:0,lowBoardsNear:0,treesWithLowBoardsNear:0};
    const maskChanges15={gained:0,lost:0};
    for (const s of subset) {
      for (const key of ['lowCrop','boards','lowBoards','lowBoardsNear']) origin[key]+=s.origin[key];
      origin.treesWithLowBoardsNear+=s.origin.nearTree.filter(n=>n>0).length;
      for (const [i,pin] of s.evaluated.lowReturns.pinByTree15.entries()) {
        const masked=s.evaluated.maskedBoards.pinByTree15[i];
        if (pin>=0 && masked<0) maskChanges15.lost++;
        if (pin<0 && masked>=0) maskChanges15.gained++;
      }
    }
    return [placement,{scanCount:subset.length,scores,origin,maskChanges15}];
  }));
}

function run(split) {
  const started=performance.now(), scans=[];
  const timingsMs={generation:0, height:0, support:0, lowReturns:0, attribution:0, scoring:0};
  function timed(phase,op) {
    const t=performance.now(),value=op();
    timingsMs[phase]+=performance.now()-t;
    return value;
  }
  const conditions=split==='damage'?['healthy','damaged']:['healthy'];
  for (const seed of seeds[split]) {
    let basePositions;
    const raysByLayout=new Map();
    for (const condition of conditions) for (const layout of layouts) {
      let clear, clearSupport;
      const ids=new Set();
      for (const placement of placements) {
        const recipe={...makeRecipe(seed,true,getSensor(layout),'apple',4,'central-leader',condition),...settings,
          boards:placement!=='clear', ...(placement==='independent'?{boardPlacement:placement}:{})};
        const scan=timed('generation',()=>field(recipe));
        assert.equal(scan.sampledRays,settings.points);
        assert.equal(scan.xyz.length,3*settings.points);
        const targets=targetCenters(scan.labels.boxes);
        if (basePositions) assert.deepEqual(targets,basePositions);
        else {basePositions=targets; verifyBoardGeometry(seed,targets);}
        assert.ok(!ids.has(scan.labels.tile_id),'Board placements must have distinct tile identities');
        ids.add(scan.labels.tile_id);
        if (clear) verifyBoardPair(clear,scan);
        else {
          clear=scan;
          const first=raysByLayout.get(layout);
          if (first) for(let i=0;i<scan.xyz.length;i+=3) {
            assert.equal(scan.xyz[i],first[i]); assert.equal(scan.xyz[i+1],first[i+1]);
          }
          else raysByLayout.set(layout,scan.xyz);
        }
        const result=analyzeScan(scan,targets,timed);
        if (placement==='clear') clearSupport=result.evaluated.support.pins;
        else assert.deepEqual(result.evaluated.support.pins,clearSupport,'Boards changed original support pins');
        scans.push({seed,condition,layout,placement,...result});
      }
    }
  }
  const byCondition=Object.fromEntries(conditions.map(c=>[c,summarize(scans.filter(s=>s.condition===c))]));
  const byField=Object.fromEntries(seeds[split].map(seed=>[seed,Object.fromEntries(conditions.map(c=>
    [c,summarize(scans.filter(s=>s.condition===c && s.seed===seed))]))]));
  timingsMs.total=performance.now()-started;
  return {timingsMs,byCondition,byField,scans};
}

const splits=process.argv.slice(2);
if (splits.length>1 || splits.some(s=>!Object.hasOwn(seeds,s))) throw Error('Choose development, confirmation or damage.');
const results=Object.fromEntries((splits.length?splits:Object.keys(seeds)).map(s=>[s,run(s)]));
console.log(JSON.stringify({domain:'synthetic', backend:'CPU', runtime:{node:process.version, cpu:cpus()[0]?.model},
  settings, seeds,layouts,placements,peakHeightM,separationM,proximityM,results}));
