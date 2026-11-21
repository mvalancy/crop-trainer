// Count direct evidence near the known planting positions in overhead apple scans.
import assert from 'node:assert/strict';
import {makeRecipe} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';

const seeds = [876019, 876137, 876437];
const radiusM = 0.10;
const heightRangeM = [0.10, 0.55];
const stemPart = 1; // Tapered woody stems in trainer/plants/surfaces.js.
const reference = getSensor('reference');

function woodyReturnsNearBases({xyz, parts, labels}) {
  const boxes = labels.boxes;
  const counts = new Array(boxes.length).fill(0);
  for (let point = 0; point < parts.length; point++) {
    if (parts[point] !== stemPart) continue;
    const x = xyz[3*point], y = xyz[3*point+1], z = xyz[3*point+2];
    for (let tree = 0; tree < boxes.length; tree++) {
      const {min, base_xy_m: [baseX, baseY]} = boxes[tree];
      const height = z - min[2];
      if (height < heightRangeM[0] || height > heightRangeM[1]) continue;
      if ((x-baseX)**2 + (y-baseY)**2 <= radiusM**2) counts[tree]++;
    }
  }
  return counts;
}

const scans = [], summary = [];
const basesBySeed = new Map();
for (const rays of [12000, 60000]) {
  for (const form of ['central-leader', 'open-vase']) {
    for (const canopy of ['leafy', 'dormant']) {
      let trees = 0, treesWithLowWood = 0;
      for (const seed of seeds) {
        const recipe = makeRecipe(seed, true, reference, 'apple', 2, form, 'healthy');
        const scan = field({...recipe, points:rays, appleCanopy:canopy,
          weeds:false, sticks:false, boards:false, scanNoise:null});
        const bases = scan.labels.boxes.map(box => box.base_xy_m);
        if (basesBySeed.has(seed)) assert.deepEqual(bases, basesBySeed.get(seed));
        else basesBySeed.set(seed, bases);
        const lowWoodReturns = woodyReturnsNearBases(scan);
        trees += bases.length;
        treesWithLowWood += lowWoodReturns.filter(count => count > 0).length;
        scans.push({seed, rays, form, canopy, tileId:scan.labels.tile_id, lowWoodReturns});
      }
      summary.push({rays, form, canopy, trees, treesWithLowWood});
    }
  }
}
console.log(JSON.stringify({domain:'synthetic', seeds, radiusM, heightRangeM,
  heightReference:'tree bounding box bottom', summary, scans}, null, 2));
