// Compare primary-branch diameter spread within each intact, dormant v3 apple portrait.
import assert from 'node:assert/strict';
import {makeRecipe} from '../trainer/data.js';
import {cropProfile} from '../trainer/crops.js';
import {formsFor} from '../trainer/plants/forms.js';
import {structuredPlant} from '../trainer/plants/index.js';
import {plantingRow} from '../trainer/plants/planting.js';
import {specimenPair} from '../trainer/plants/portrait.js';
import {plantTraits, seededRandom} from '../trainer/plants/traits.js';

const seeds = [9180011,9291127,9402239,9513359,9624469,9735581,9846691,9957793];
const stationM = .0635; // Akbar et al., §3. Approximately 2.5 inches from branch origin.
const profile = cropProfile('apple');

function firstTreeRadius(recipe) {
  const random = seededRandom(recipe.seed);
  for (let row=0; row<profile.rows; row++) {
    const first = plantingRow(recipe,profile,row,random).next().value;
    if (first) return first.radius;
  }
  throw Error('The selected planting is empty.');
}

function measureTree(organs) {
  const stems = organs.filter(([kind]) => kind==='stem').map(([,stem]) => stem);
  const [ax,ay,az,bx,by,bz,base,tip] = stems[0];
  const dx=bx-ax, dy=by-ay, dz=bz-az, length=Math.hypot(dx,dy,dz);
  // Relative axial position and perpendicular distance from the trunk centerline.
  function trunkCoordinates(x,y,z) {
    const t = ((x-ax)*dx+(y-ay)*dy+(z-az)*dz) / length**2;
    const radial = Math.hypot(x-ax-t*dx,y-ay-t*dy,z-az-t*dz);
    return {t,radial};
  }
  const branches=[];
  for (const [sx,sy,sz,ex,ey,ez,startRadius,endRadius] of stems.slice(1)) {
    const start = trunkCoordinates(sx,sy,sz);
    if (start.t < -1e-9 || start.t > 1+1e-9 || start.radial > 1e-9) continue;
    const limbLength = Math.hypot(ex-sx,ey-sy,ez-sz);
    const diameterMm = offsetM => 2000*(startRadius+(endRadius-startRadius)*offsetM/limbLength);
    // A caliper can also start from the visible junction. Find where this
    // branch centerline exits the truncated-cone trunk, including its top cap.
    let inside=0, outside=1;
    for(let i=0; i<40; i++){
      const f=(inside+outside)/2;
      const {t,radial}=trunkCoordinates(sx+f*(ex-sx),sy+f*(ey-sy),sz+f*(ez-sz));
      if(t>=0 && t<=1 && radial<=base+t*(tip-base)) inside=f;
      else outside=f;
    }
    const beyondBarkM=outside*limbLength+stationM;
    assert.ok(beyondBarkM < limbLength);
    branches.push({axisOriginMm:diameterMm(stationM),trunkSurfaceOriginMm:diameterMm(beyondBarkM)});
  }
  const ratios={};
  for (const key of ['axisOriginMm','trunkSurfaceOriginMm']) {
    const values=branches.map(branch=>branch[key]);
    ratios[key]=Math.min(...values)/Math.max(...values);
  }
  return {branches,ratios};
}

const trees=[];
for (const seed of seeds) {
  for (const form of ['central-leader','open-vase']) {
    const recipe=makeRecipe(seed,true,null,'apple',3,form,'healthy');
    const radius=firstTreeRadius(recipe);
    const forms=formsFor('apple');
    const {intact}=specimenPair('apple',forms,{seed,form,canopy:'dormant',radius,plantArchitecture:3});
    const {branches,ratios}=measureTree(intact);
    assert.ok(form==='open-vase' ? [3,4].includes(branches.length) : [7,8,9].includes(branches.length));
    // The production surface builder accumulates actual organ extrema even
    // when there are no rays. The local soil elevation at this trunk is zero.
    const soil=0;
    const bounds=structuredPlant('apple',{x:0,y:0,soil,radius,plantArchitecture:3,canopy:'dormant',
      ...plantTraits(seed,1,forms,form,'healthy'),rays(){},write(){},skeleton:[]});
    trees.push({seed,form,treeIndex:0,branches,ratios,heightAboveTrunkGroundM:bounds.max[2]-soil});
  }
}
console.log(JSON.stringify({domain:'synthetic',measurement:'primary branch circular cross section',
  stationM,seeds,trees},null,2));
