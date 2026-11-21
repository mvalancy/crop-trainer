// Does one seedling's only observed return support its matched pin?
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {field} from '../../trainer/generator/field.js';
import {features,PEAK_CELL_METERS,PEAK_GRID_SIZE} from '../../trainer/models/data.js';
import {savedFeatureSettings,scoreSavedWeights} from '../../trainer/models/network.js';
import {detectScan} from '../../trainer/field-test/inference.js';
import {evaluatePins,parseReferences} from '../../trainer/field-test/references.js';
import {tomatoTestRecipe} from './tomato-terrain-controls.mjs';
import {hash} from './tomato-cutoff-controls.mjs';

const box=77,model=JSON.parse(await readFile(new URL('../../trainer/field-test/example/tomato-weed-hard.json',import.meta.url)));
assert.equal(hash(model),'4f86076f4fe7ca5e932b13c2a5bf4902c1cac79b6df33ffd167ccbb12675d3bc');
const scan=field({...tomatoTestRecipe(51112017,'os1-64','seedling',true),weeds:true},undefined,{includePlantIds:true});
assert.equal(scan.labels.tile_id,'3b07cf65952362c6');
assert.equal(model.threshold,.65);
assert.equal(scan.plantReturns[box],1);
const {peakAveraging,featureMode}=savedFeatureSettings(model);
const plotFrame={unit:'m',origin:[0,0,0]};
const references=parseReferences(JSON.stringify(scan.labels),'labels.json',plotFrame,{tileId:scan.labels.tile_id,pointCount:scan.cls.length,crop:'tomato'});
const center=references[box],owner=box+1;
const ownReturns=Array.from(scan.plantIds.keys()).filter(i=>scan.plantIds[i]===owner);
assert.equal(ownReturns.length,1);
assert.equal(scan.cls[ownReturns[0]],1);

function cell(value) {return Math.max(0,Math.min(PEAK_GRID_SIZE-1,Math.floor(value/PEAK_CELL_METERS)));}
function describePin(pin) {
  if (!pin) return null;
  return {x:pin.localX,y:pin.localY,score:pin.score,distanceCm:100*Math.hypot(pin.localX-center.localX,pin.localY-center.localY)};
}

// Keep scoring and intervention inputs separate. The detector receives only retained XYZ.
function predict(xyz) {
  const {pins,proposalCount}=detectScan(xyz,model);
  const evaluation=evaluatePins(pins,references),assigned=evaluation.pinByReference15[box];
  const closest=pins.map(describePin).sort((a,b)=>a.distanceCm-b.distanceCm)[0] ?? null;
  return {proposalCount,totalPins:pins.length,assigned:describePin(pins[assigned]),nearest:closest,
    matchAtCm:Object.fromEntries(evaluation.scores.map(s=>[s.cm,evaluation.pinByReferenceAtCm[s.cm][box]>=0])),
    plotScores:evaluation.scores.map(({cm,tp,fp,fn})=>({cm,tp,fp,fn}))};
}

function proposals(xyz) {
  const cells=[];
  const {pos,X}=features({xyz},model.minimumHeight,peakAveraging,featureMode,(x,y)=>cells.push([x,y]));
  return {cells,pos,scores:scoreSavedWeights(X,model,peakAveraging,featureMode)};
}

const original=predict(scan.xyz),candidate=proposals(scan.xyz);
const peakIndex=candidate.pos.findIndex(([x,y])=>x===original.assigned.x && y===original.assigned.y);
assert.ok(peakIndex>=0);
assert.equal(candidate.scores[peakIndex],original.assigned.score);
const peak=candidate.cells[peakIndex],pinCell=[cell(original.assigned.x),cell(original.assigned.y)];

function surface(i) {
  if (scan.cls[i]===0) return 'soil';
  if (scan.cls[i]===2) return 'weed';
  if (scan.cls[i]===1) return scan.plantIds[i]===owner ? 'target-crop' : 'other-crop';
  return 'other';
}

function cellEvidence([x,y]) {
  const counts={},top=[],zAt=i=>scan.xyz[3*i+2];
  let maximum=-Infinity;
  for (let i=0;i<scan.cls.length;i++) {
    if (cell(scan.xyz[3*i])!==x || cell(scan.xyz[3*i+1])!==y) continue;
    const label=surface(i);
    counts[label]=(counts[label]??0)+1;
    if (zAt(i)>maximum) {maximum=zAt(i);top.length=0;}
    if (zAt(i)===maximum) top.push({index:i,surface:label,ownerBox:scan.plantIds[i] ? scan.plantIds[i]-1 : null});
  }
  return {cell:[x,y],counts,maximumMeters:top.length ? maximum : null,top};
}

const weedWindow=[],neighborhoodSurfaces={};
for (let i=0;i<scan.cls.length;i++) {
  const dx=cell(scan.xyz[3*i])-peak[0],dy=cell(scan.xyz[3*i+1])-peak[1];
  // The local-ground model's outermost annulus reaches six cells from the peak.
  if (dx*dx+dy*dy<=36) {
    const label=surface(i);
    neighborhoodSurfaces[label]=(neighborhoodSurfaces[label]??0)+1;
  }
  if (scan.cls[i]===2 && Math.abs(dx)<=1 && Math.abs(dy)<=1) weedWindow.push(i);
}
function drop(indices) {
  const removed=new Set(indices),xyz=new Float32Array(scan.xyz.length-3*removed.size);
  let j=0;
  for (let i=0;i<scan.cls.length;i++) {
    if (removed.has(i)) continue;
    xyz.set(scan.xyz.subarray(3*i,3*i+3),j);
    j+=3;
  }
  assert.equal(j,xyz.length);
  const result=predict(xyz),p=proposals(xyz);
  const at=p.cells.findIndex(([x,y])=>x===peak[0] && y===peak[1]);
  const sameCell=at<0 ? null : describePin({localX:p.pos[at][0],localY:p.pos[at][1],score:p.scores[at]});
  return {removedCount:removed.size,prediction:result,originalPeakCellProposal:sameCell};
}
const targetIndices=ownReturns,weedIndices=weedWindow;
const output={
  study:'tomato-one-return-v1',domain:'synthetic',tileId:scan.labels.tile_id,box,threshold:model.threshold,
  weightHash:hash(model),referenceCount:references.length,targetCenter:[center.localX,center.localY],originalReturnCount:scan.cls.length,
  targetReturns:targetIndices.map(index=>({index,xyz:Array.from(scan.xyz.subarray(3*index,3*index+3))})),
  peak:cellEvidence(peak),refinedPinCell:cellEvidence(pinCell),neighborhoodSurfaces,weedWindowIndices:weedIndices,
  original,withoutTarget:drop(targetIndices),
  ...(weedIndices.length ? {withoutLocalWeeds:drop(weedIndices),withoutBoth:drop([...targetIndices,...weedIndices])} : {})
};
console.log(JSON.stringify(output,null,2));
