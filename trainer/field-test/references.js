import {matchCenters, MATCH_RADII_METERS} from '../models/data.js?v=field-test1';

// Limits apply to one 10 m survey plot. The matcher tests every pin against
// every surveyed center before performing a one-to-one assignment.
export const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;
const MAX_CENTERS = 2000;
const boundarySlack = 1e-9; // Same conversion tolerance as a scan's XYZ bounds.
const unitScale = new Map([['m', 1], ['cm', .01], ['mm', .001]]);
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parseCSV(text) {
  const lines = text.trim().split(/\r\n?|\n/);
  const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
  if (header.length !== 2 || header[0] !== 'x' || header[1] !== 'y') {
    throw Error('Start the center CSV with x,y and list one surveyed plant per row.');
  }
  const centers = [];
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    const cells = line.split(',').map(s => s.trim());
    if (cells.length !== 2 || !cells.every(s => decimal.test(s) && Number.isFinite(Number(s)))) {
      throw Error('CSV line '+(i+2)+' must contain two finite numbers, x,y.');
    }
    centers.push(cells.map(Number));
    if (centers.length > MAX_CENTERS) throw Error('Use at most 2,000 reference centers per plot.');
  }
  return centers;
}

function generatorCenters(text, frame, expected) {
  if (frame.unit !== 'm' || frame.origin[0] !== 0 || frame.origin[1] !== 0) {
    throw Error('Generator label JSON uses metres and XY origin 0,0. Use a source-coordinate CSV for a different horizontal frame.');
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw Error('The labels file must be valid generator JSON.'); }
  if (!Array.isArray(data?.tile_size_m) || data.tile_size_m.length !== 2 ||
      !data.tile_size_m.every(v => v === 10) || !Array.isArray(data.boxes) ||
      typeof data.tile_id !== 'string' || !/^[0-9a-f]{16}$/.test(data.tile_id) ||
      typeof data.crop !== 'string' || !Number.isSafeInteger(data.num_points) || data.num_points < 0) {
    throw Error('Use the generator’s Labels (.json) export or an x,y CSV.');
  }
  if (expected.tileId != null && data.tile_id !== expected.tileId) throw Error('The labels and scan have different tile IDs.');
  if (expected.pointCount != null && data.num_points !== expected.pointCount) throw Error('The label file’s point count differs from the scan.');
  if (expected.crop != null && data.crop !== expected.crop) throw Error('The label file and model specify different crops.');
  if (data.boxes.length > MAX_CENTERS) throw Error('Use at most 2,000 reference centers per plot.');
  return data.boxes.map((box,i) => {
    const {min,max} = box || {};
    if (![min,max].every(a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)) ||
        min.some((v,axis) => v > max[axis])) throw Error('Invalid bounds for label box '+(i+1)+'.');
    if (data.center_target==='plant-base-xy') {
      if (!Array.isArray(box.base_xy_m) || box.base_xy_m.length!==2 || !box.base_xy_m.every(Number.isFinite)) {
        throw Error('Invalid planting position for label box '+(i+1)+'.');
      }
      return box.base_xy_m;
    }
    return [(min[0]+max[0])/2, (min[1]+max[1])/2];
  });
}

// CSV coordinates use the same units and origin convention as the PLY.
// A header-only x,y file explicitly records a surveyed, empty plot.
export function parseReferences(text, filename, frame, expected = {}) {
  if (typeof text !== 'string' || text.length > MAX_REFERENCE_BYTES ||
      new TextEncoder().encode(text).byteLength > MAX_REFERENCE_BYTES) throw Error('Use a reference file of 2 MiB or less.');
  const scale = unitScale.get(frame?.unit);
  if (!scale || !Array.isArray(frame.origin) || frame.origin.length !== 3 || !frame.origin.every(Number.isFinite)) {
    throw Error('Choose valid scan units and a finite plot origin before loading references.');
  }
  const name = String(filename).toLowerCase();
  let centers;
  if (name.endsWith('.csv')) centers = parseCSV(text);
  else if (name.endsWith('.json')) centers = generatorCenters(text.trim(),frame,expected);
  else throw Error('Choose an x,y CSV or a generator Labels (.json) file.');
  return centers.map(([x,y],i) => {
    const localX = (x-frame.origin[0])*scale, localY = (y-frame.origin[1])*scale;
    if (!(localX >= -boundarySlack && localX <= 10+boundarySlack &&
          localY >= -boundarySlack && localY <= 10+boundarySlack)) {
      throw Error('Reference center '+(i+1)+' lies outside the 10 m plot. Check the scan origin and units.');
    }
    return {x,y,localX,localY};
  });
}

export function evaluatePins(pins, references) {
  if (references.length > MAX_CENTERS || pins.length > 10000 || pins.length*references.length > 8000000) {
    throw Error('Too many centers for an interactive comparison on one plot.');
  }
  const xy = p => [p.localX,p.localY];
  const predictions = pins.map(xy), truth = references.map(xy);
  const pinByReferenceAtCm = {};
  const scores = MATCH_RADII_METERS.map(radius => {
    const cm = radius * 100;
    const {count:tp,pinByBox} = matchCenters(predictions,truth,radius);
    pinByReferenceAtCm[cm] = Array.from(pinByBox);
    const fp = pins.length-tp, fn = references.length-tp;
    const countSum = pins.length + references.length;
    return {
      cm, tp, fp, fn,
      precision: pins.length ? tp/pins.length : null,
      recall: references.length ? tp/references.length : null,
      f1: countSum ? 2*tp/countSum : null
    };
  });
  return {scores,signedCountError:pins.length-references.length,pinByReferenceAtCm,
    pinByReference15:pinByReferenceAtCm[15]};
}
