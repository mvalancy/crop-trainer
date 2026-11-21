// Simulator evidence for inspecting finished predictions. The detector only sees XYZ.
import {PEAK_GRID_SIZE, PEAK_CELL_METERS} from '../../trainer/models/data.js';

const cell = meters => Math.max(0, Math.min(PEAK_GRID_SIZE - 1, Math.floor(meters / PEAK_CELL_METERS)));

export function indexReturns(scan) {
  const ownerSets = new Map();
  const cellCount = PEAK_GRID_SIZE ** 2;
  const heights = new Float32Array(cellCount).fill(-Infinity);
  const topOwners = new Uint16Array(cellCount);
  const topClasses = new Uint8Array(cellCount);
  const mixedTopClasses = new Uint8Array(cellCount);
  for (let i = 0; i < scan.cls.length; i++) {
    const j = cell(scan.xyz[3*i]) + PEAK_GRID_SIZE*cell(scan.xyz[3*i+1]);
    const owner = scan.plantIds?.[i] ?? 0;
    if (owner) {
      if (!ownerSets.has(j)) ownerSets.set(j,new Set());
      ownerSets.get(j).add(owner);
    }
    const z = scan.xyz[3*i+2];
    if (z > heights[j]) {
      heights[j] = z;
      topOwners[j] = owner;
      topClasses[j] = scan.cls[i];
      mixedTopClasses[j] = 0;
    } else if (z===heights[j] && topClasses[j]!==scan.cls[i]) {
      mixedTopClasses[j] = 1;
    }
  }
  return {ownerSets, heights, topOwners, topClasses, mixedTopClasses};
}

// A pin may sit off the original peak’s cell after spatial refinement.
export function extraPinSurfaces(pins,pinByReference15,index) {
  const matched = new Set(pinByReference15);
  const counts = {soil:0,crop:0,weed:0,other:0,empty:0,mixedTop:0};
  const classNames = ['soil','crop','weed'];
  for (const [i,pin] of pins.entries()) {
    if (matched.has(i)) continue;
    const j = cell(pin.localX) + PEAK_GRID_SIZE*cell(pin.localY);
    if (index.heights[j]===-Infinity) counts.empty++;
    else if (index.mixedTopClasses[j]) counts.mixedTop++;
    else counts[classNames[index.topClasses[j]] ?? 'other']++;
  }
  return counts;
}
