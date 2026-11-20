import {features, detectionStages, checkScoreThreshold, PEAK_HEIGHTS} from './data.js?v=systems1';
import {cropProfile} from './crops.js?v=systems1';
import {scoreSavedWeights} from './network.js?v=systems1';

const metersPerUnit = {m:1, cm:.01, mm:.001};

// The feature grid covers one 10 m square. Its origin must stay fixed when two
// scans are compared: translating each scan to its own minimum changes the bins.
function toPlot(xyz, unit, origin, gradePercent) {
  if (typeof unit !== 'string' || !Object.hasOwn(metersPerUnit,unit) || !Array.isArray(origin) || origin.length !== 3 ||
      !origin.every(Number.isFinite)) {
    throw Error('Choose m, cm or mm and enter a finite plot origin (X, Y, ground Z) in the scan’s units.');
  }
  if (!Array.isArray(gradePercent) || gradePercent.length !== 2 ||
      !Number.isFinite(gradePercent[0]) || !Number.isFinite(gradePercent[1])) {
    throw Error('Enter two finite ground grades in percent for the X and Y directions.');
  }
  if (!(Array.isArray(xyz) || ArrayBuffer.isView(xyz)) || !xyz.length || xyz.length % 3) {
    throw Error('Expected a nonempty sequence of XYZ triples.');
  }
  const local = new Float32Array(xyz.length);
  const scale = metersPerUnit[unit];
  const slopeX = gradePercent[0]/100, slopeY = gradePercent[1]/100;
  for (let i = 0; i < xyz.length; i += 3) {
    const x = xyz[i], y = xyz[i+1], z = xyz[i+2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw Error('The scan contains a nonfinite coordinate.');
    }
    // Subtract the surveyed origin and plane before narrowing georeferenced doubles.
    const mx = (x-origin[0])*scale, my = (y-origin[1])*scale;
    if (mx < -1e-9 || mx > 10+1e-9 || my < -1e-9 || my > 10+1e-9) {
      throw Error('Point '+(i/3+1)+' falls outside the 10 × 10 m plot. Check the units and lower-left origin, or crop the scan to one plot.');
    }
    local[i] = mx;
    local[i+1] = my;
    local[i+2] = (z-origin[2])*scale - (slopeX*mx + slopeY*my);
    if (!Number.isFinite(local[i+2])) throw Error('A converted height is too large. Check the scan units, origin and grades.');
  }
  return local;
}

/**
 * Apply exported weights to interleaved XYZ returns from a single Z-up plot.
 * The frame origin is the lower-left XY corner and ground elevation, in source
 * units. Optional measured X/Y grades are signed percent rise. Pins carry both
 * source XY and local XY in metres.
 */
export function detectScan(xyz, model, {unit='m', origin=[0,0,0], gradePercent=[0,0]}={}, onStages) {
  if (model?.format !== 'crop-trainer-weights-v1') throw Error('Choose a model from Download model weights in the Training shed.');
  if (typeof model.crop !== 'string') throw Error('The saved model is missing its crop.');
  cropProfile(model.crop);
  if (!PEAK_HEIGHTS.includes(model.minimumHeight) || !Number.isFinite(model.pinSeparation) || model.pinSeparation <= 0) {
    throw Error('The saved model has an unsupported peak height or invalid pin separation.');
  }
  if (model.output !== 'sigmoid' || !Array.isArray(model.hiddenLayers) || !['relu','tanh'].includes(model.activation)) {
    throw Error('The saved model has an unsupported network configuration.');
  }
  checkScoreThreshold(model.threshold);
  const local = toPlot(xyz,unit,origin,gradePercent);
  const candidates = features({xyz:local},model.minimumHeight);
  const scores = scoreSavedWeights(candidates.X,model);
  if (!scores.every(Number.isFinite)) throw Error('Nonfinite model scores. Check the weights and input coordinates.');

  // Run both methods on exactly the same proposals, before applying spacing.
  const heights = candidates.pos.map((_,i) => candidates.X[13*i]);
  const learned = detectionStages(candidates,scores,model.threshold,model.pinSeparation);
  onStages?.(learned);
  const baseline = detectionStages(candidates,heights,0,model.pinSeparation);
  const indices = new Map(candidates.pos.map((point,i) => [point,i]));
  const pin = (point) => {
    const [localX,localY] = point;
    return {x:origin[0]+localX/metersPerUnit[unit],y:origin[1]+localY/metersPerUnit[unit],localX,localY};
  };
  const frame = {unit,origin:[...origin]};
  if (gradePercent[0] || gradePercent[1]) frame.gradePercent = [...gradePercent];
  return {
    crop:model.crop,frame,pointCount:local.length/3,
    detector:{featureSchema:model.featureSchema,hiddenLayers:[...model.hiddenLayers],activation:model.activation,
      minimumHeight:model.minimumHeight,threshold:model.threshold,pinSeparation:model.pinSeparation},
    proposalCount:candidates.pos.length,acceptedCount:learned.accepted.length,
    pins:learned.selected.map(point => ({...pin(point),score:scores[indices.get(point)]})),
    baselinePins:baseline.selected.map(point => ({...pin(point),heightMeters:heights[indices.get(point)]}))
  };
}
