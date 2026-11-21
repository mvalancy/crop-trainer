import {features, matchCenters, detectionStages, targetCenters} from '../models/data.js?v=peak-study1';
import {detectOrchardBases, inspectOrchardBases, ORCHARD_GRID_SIDE} from '../models/orchard.js?v=orchard-ranking1';
import {cropProfile} from '../generator/crops.js';
import {evaluatePins} from '../field-test/references.js';
import {RAY_BUDGETS, getSensor} from '../generator/sensors.js';

const localPoint = ([localX,localY]) => ({localX,localY});

function heightResult(peaks, separation, references) {
  const heights = peaks.pos.map((_,i) => peaks.X[13*i]);
  const pins = detectionStages(peaks,heights,0,separation).selected;
  return {pins,...evaluatePins(pins.map(localPoint),references)};
}

function treeTrace(tree, comparison, ranking) {
  const trace={state:tree.state,supportCellCount:tree.supportCellCount,spacedCellCount:tree.spacedCellCount};
  if(comparison==='ranking'){
    trace.topCandidate=tree.strongestCell;
    if(ranking==='low-wood'){
      const cell=tree.strongestCell, scale=ORCHARD_GRID_SIDE/10;
      trace.bestCellId=cell?Math.floor(cell.y*scale)*ORCHARD_GRID_SIDE+Math.floor(cell.x*scale):null;
    }
  }
  return trace;
}

export function studyRecipes(recipe, mode, budgets) {
  if (mode === 'spacing' || mode === 'ranking') {
    if (recipe.crop !== 'apple') throw Error('Choose an apple orchard to compare tree-base rules.');
    return [recipe, recipe];
  }
  if (mode === 'boards') {
    if (recipe.crop !== 'apple') throw Error('Choose an apple orchard to compare board placement.');
    const near = {...recipe, boards:true};
    delete near.boardPlacement;
    return [near, {...near, boardPlacement:'independent'}];
  }
  if (mode === 'scaffolds') {
    if (recipe.crop !== 'apple') throw Error('Choose an apple orchard to compare scaffold widths.');
    return [3,4].map(plantArchitecture => ({...recipe,plantArchitecture}));
  }
  if (mode === 'damage') {
    if (recipe.crop !== 'apple' || !(recipe.plantArchitecture >= 2)) throw Error('Choose structured apple trees to compare scaffold damage.');
    return ['healthy','damaged'].map(plantCondition => ({...recipe, plantCondition}));
  }
  if (mode === 'layouts') {
    return ['reference','os1-64'].map(key => ({...recipe, sampling:getSensor(key), points:60000}));
  }
  if (mode !== 'budgets') throw Error('Choose a supported scan comparison.');
  if (budgets?.length !== 2 ||
      !budgets.every(n => RAY_BUDGETS.includes(n)) || budgets[0] >= budgets[1]) {
    throw Error('Choose a second budget higher than the first.');
  }
  return budgets.map(points => ({...recipe, points}));
}

function boardHitsNearBases(scan, centers) {
  const counts=centers.map(()=>0);
  for(let i=0;i<scan.cls.length;i++){
    if(scan.cls[i]!==4)continue;
    const x=scan.xyz[3*i], y=scan.xyz[3*i+1];
    for(const [j,[cx,cy]] of centers.entries()){
      if((x-cx)**2+(y-cy)**2<=.15**2) counts[j]++;
    }
  }
  return counts;
}

// Only the observation counts use the simulator's point origins. The detectors
// see the same XYZ a visitor would find in an exported PLY.
export function analyzeStudyScan(scan, comparison, orchardOptions={}) {
  const profile = cropProfile(scan.p.crop);
  const centers = targetCenters(scan.labels.boxes);
  const references = centers.map(localPoint);
  const peaks = features({xyz:scan.xyz},profile.peakHeight);
  const height = heightResult(peaks,profile.pinSeparation,references);
  const sampled = heightResult(features({xyz:scan.xyz},profile.peakHeight,'occupied'),profile.pinSeparation,references);
  const proposals = matchCenters(peaks.pos,centers,.15);

  // Earlier callers passed the spacing as a number.
  const options=comparison==='boards' ? {ranking:'low-wood'} :
    typeof orchardOptions==='number' ? {separationMeters:orchardOptions} : orchardOptions;
  const orchardStages = scan.p.crop === 'apple'
    ? detectOrchardBases(scan.xyz,{...options,includeStages:true}) : null;
  const orchardPins = orchardStages?.pins.map(({x,y})=>[x,y]);
  const orchard = orchardStages && evaluatePins(orchardPins.map(localPoint),references);
  const orchardTrace = orchard && inspectOrchardBases(orchardStages,centers,orchard.pinByReference15);
  const boardHits=comparison==='boards' ? boardHitsNearBases(scan,centers) : null;
  const plants = centers.map(([x,y],i) => ({
    x,y,returns:scan.plantReturns[i],
    ...(boardHits ? {boardReturns15cm:boardHits[i]} : {}),
    peak:proposals.pinByBox[i] !== -1,
    height:height.pinByReference15[i] !== -1,
    sampledHeight:sampled.pinByReference15[i] !== -1,
    ...(orchard ? {orchard:orchard.pinByReference15[i] !== -1,
      nearestOrchardPinM:orchardTrace[i].nearestPinMeters,
      orchardTrace:treeTrace(orchardTrace[i],comparison,orchardStages.ranking)} : {})
  }));
  return {
    tileId:scan.labels.tile_id,recipe:scan.p,sampledRays:scan.sampledRays,
    target:scan.labels.center_target ?? 'box-midpoint-xy',
    returnedPoints:scan.cls.length,peakFloorMeters:profile.peakHeight,
    separationMeters:profile.pinSeparation,observedPlants:plants.filter(p => p.returns > 0).length,
    proposalCount:peaks.pos.length,matchedProposals:proposals.count,
    heightScores:height.scores,heightPins:height.pins,plants,
    sampledHeightScores:sampled.scores,sampledHeightPins:sampled.pins,
    ...(comparison==='scaffolds' && scan.parts ? {
      orchardWoodReturns:scan.parts.reduce((n,part,i)=>n+(part===1 && scan.cls[i]===1),0)
    } : {}),
    ...(comparison==='boards' ? {boardPlacement:scan.p.boardPlacement ?? 'plant', boardReturns:scan.counts[4]} : {}),
    ...(orchard && (comparison==='ranking' || comparison==='boards') ? {orchardRanking:orchardStages.ranking ?? 'support'} : {}),
    ...(comparison!=='boards' && orchardStages?.lowCellIds ? {orchardLowCellIds:orchardStages.lowCellIds} : {}),
    ...(orchard ? {orchardScores:orchard.scores,orchardPins,orchardSeparationMeters:orchardStages.separationMeters,orchardMethod:'height-band-occupancy-v1'} : {})
  };
}

export function checkStudyPair(first,second) {
  const sameCenters = first.plants.length === second.plants.length &&
    first.plants.every((p,i) => p.x === second.plants[i].x && p.y === second.plants[i].y);
  if (!sameCenters) throw Error('The two scans have different target locations. Compare identical planting settings.');
}
