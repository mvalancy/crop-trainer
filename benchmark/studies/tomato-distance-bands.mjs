// Sample only the training split. Distances are horizontal distances to crop centers.
import assert from 'node:assert/strict';
import {selectHardNegatives} from '../../trainer/models/hard-negatives.js';

export function selectDistanceMatched(scores,count,{sampling,hardCount},distancesSquared,recordHardIndices=false) {
  assert.equal(scores.length,distancesSquared.length);
  const near=[],far=[];
  for (let i=0;i<scores.length;i++) {
    const squared=distancesSquared[i];
    assert.ok(Number.isFinite(squared) && squared>.15**2,'Only labeled negative rows may be selected.');
    (squared<.30**2 ? near : far).push(i);
  }
  const nearCount=near.filter(i=>i<count).length;
  let indices,hardNear;
  const hardIndices=[];
  if (sampling==='distance-matched') {
    hardNear=Math.round(hardCount*nearCount/count);
    function within(band,quota,hard) {
      if (!quota) return [];
      const bandScores=Float32Array.from(band,i=>scores[i]);
      if (recordHardIndices && hard) {
        const hardest=selectHardNegatives(bandScores,hard,hard);
        for (const j of hardest) hardIndices.push(band[j]);
      }
      return selectHardNegatives(bandScores,quota,hard).map(i=>band[i]);
    }
    indices=[...within(near,nearCount,hardNear),...within(far,count-nearCount,hardCount-hardNear)]
      .sort((a,b)=>a-b);
  } else {
    indices=selectHardNegatives(scores,count,hardCount);
    const hardest=hardCount ? selectHardNegatives(scores,hardCount,hardCount) : [];
    if (recordHardIndices) hardIndices.push(...hardest);
    hardNear=hardest.filter(i=>distancesSquared[i]<.30**2).length;
  }
  const selectedNear=indices.filter(i=>distancesSquared[i]<.30**2).length;
  if (sampling==='distance-matched') assert.equal(selectedNear,nearCount);
  return {indices,...(recordHardIndices ? {hardIndices} : {}),bands:{eligibleNear:near.length,eligibleFar:far.length,ordinaryNear:nearCount,
    selectedNear,selectedFar:count-selectedNear,hardNear,hardFar:hardCount-hardNear}};
}
