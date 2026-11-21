import {features, matchCenters, detectionStages, targetCenters} from './data.js?v=plants3';
import {detectOrchardBases} from './orchard.js';
import {cropProfile} from './crops.js';
import {evaluatePins} from './references.js';

const localPoint = ([localX,localY]) => ({localX,localY});

// Only the observation counts use the simulator's point origins. The detectors
// see the same XYZ a visitor would find in an exported PLY.
export function analyzeStudyScan(scan) {
  const profile = cropProfile(scan.p.crop);
  const centers = targetCenters(scan.labels.boxes);
  const references = centers.map(localPoint);
  const peaks = features({xyz:scan.xyz},profile.peakHeight);
  const heights = peaks.pos.map((_,i) => peaks.X[13*i]);
  const heightPins = detectionStages(peaks,heights,0,profile.pinSeparation).selected;
  const proposals = matchCenters(peaks.pos,centers,.15);
  const height = evaluatePins(heightPins.map(localPoint),references);

  const orchardPins = scan.p.crop === 'apple'
    ? detectOrchardBases(scan.xyz).pins.map(({x,y}) => [x,y]) : null;
  const orchard = orchardPins && evaluatePins(orchardPins.map(localPoint),references);
  const plants = centers.map(([x,y],i) => ({
    x,y,returns:scan.plantReturns[i],
    peak:proposals.pinByBox[i] !== -1,
    height:height.pinByReference15[i] !== -1,
    ...(orchard ? {orchard:orchard.pinByReference15[i] !== -1} : {})
  }));
  return {
    tileId:scan.labels.tile_id,recipe:scan.p,sampledRays:scan.sampledRays,
    target:scan.labels.center_target ?? 'box-midpoint-xy',
    returnedPoints:scan.cls.length,peakFloorMeters:profile.peakHeight,
    separationMeters:profile.pinSeparation,observedPlants:plants.filter(p => p.returns > 0).length,
    proposalCount:peaks.pos.length,matchedProposals:proposals.count,
    heightScores:height.scores,heightPins,plants,
    ...(orchard ? {orchardScores:orchard.scores,orchardPins,orchardMethod:'height-band-occupancy-v1'} : {})
  };
}

export function checkStudyPair(first,second) {
  const sameCenters = first.plants.length === second.plants.length &&
    first.plants.every((p,i) => p.x === second.plants[i].x && p.y === second.plants[i].y);
  if (!sameCenters) throw Error('The two scans have different target locations. Compare identical planting settings.');
}
