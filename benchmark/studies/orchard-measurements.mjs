// Shared orchard measurements use the same surfaces, detector and one-to-one matcher as the browser.
import assert from 'node:assert/strict';
import {detectionStages, features, matchCenters, MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {detectOrchardBases} from '../../trainer/models/orchard.js';
import {cropProfile} from '../../trainer/generator/crops.js';
import {formsFor} from '../../trainer/plants/forms.js';
import {structuredPlant, growOrgans} from '../../trainer/plants/index.js';
import {plantingRow} from '../../trainer/plants/planting.js';
import {plantTraits, seededRandom} from '../../trainer/plants/traits.js';

export const stationM = .0635;
const profile = cropProfile('apple');
const forms = formsFor('apple');

function measureTree(stems) {
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

export function measureOrchard(recipe,{firstOnly=false}={}) {
  const random=seededRandom(recipe.seed),trees=[];
  for(let row=0;row<profile.rows;row++){
    for (const {x,y,radius} of plantingRow(recipe,profile,row,random)) {
      const treeIndex=trees.length;
      const traits=()=>plantTraits(recipe.seed,treeIndex+1,forms,recipe.plantForm,'healthy');
      const common={x:0,y:0,radius,plantArchitecture:recipe.plantArchitecture};
      const stems=[];
      growOrgans('apple',{...common,...traits(),z:0,stem(...args){stems.push(args);},ellipsoid(){}},'dormant');
      const {branches,ratios}=measureTree(stems);
      assert.ok(recipe.plantForm==='open-vase' ? [3,4].includes(branches.length) : [7,8,9].includes(branches.length));
      const bounds=structuredPlant('apple',{...common,...traits(),soil:0,canopy:'dormant',rays(){},write(){},skeleton:[]});
      trees.push({seed:recipe.seed,form:recipe.plantForm,treeIndex,baseXY:[x,y],branches,ratios,heightAboveTrunkGroundM:bounds.max[2]});
      if(firstOnly)return trees;
    }
  }
  return trees;
}

function measure(pins, truth) {
  let matched15;
  const scores = MATCH_RADII_METERS.map(radius => {
    const {pinByBox,count:tp} = matchCenters(pins,truth,radius);
    if (radius === .15) matched15 = Array.from(pinByBox,index => index >= 0);
    return {cm:100*radius, tp, fp:pins.length-tp, fn:truth.length-tp};
  });
  const nearestM = truth.map(([x,y]) => pins.length
    ? Math.min(...pins.map(([px,py]) => Math.hypot(px-x,py-y))) : null);
  return {matched15, scores, nearestM};
}

export function scoreOrchardScan(scan, truth, timed) {
  const xy = scan.xyz;
  const orchard = timed('orchard',() => detectOrchardBases(xy).pins.map(({x,y}) => [x,y]));
  const height = timed('height',() => {
    const peaks = features({xyz:xy},.065,'zero-filled');
    const heights = peaks.pos.map((_,i) => peaks.X[13*i]);
    return detectionStages(peaks,heights,0,1.05).selected;
  });
  return timed('matching',() => ({orchard:measure(orchard,truth), height:measure(height,truth)}));
}
