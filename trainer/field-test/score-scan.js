import {detectScan} from './inference.js?v=saved-cutoff1';
import {measureStages} from '../models/data.js?v=stage-distance1';
import {parseReferences,evaluatePins} from './references.js?v=map-distance1';
import {MAX_PLY_POINTS} from './ply.js';

export function runFieldTest({model,xyz,alignment,labels=null,tileId,thresholdOverride}) {
  if (!xyz || xyz.length/3 > MAX_PLY_POINTS) throw Error('Choose a scan with up to 1,000,000 points.');
  let learnedStages;
  const captureStages = stages => { learnedStages = stages; };
  const result = detectScan(xyz,model,alignment,labels === null ? undefined : captureStages,thresholdOverride);
  if (labels === null) return {...result,references:null,evaluation:null,baselineEvaluation:null,stagesAtCm:null,stages15cm:null,
    ...(result.orchard ? {orchardEvaluation:null} : {})};
  if (typeof labels?.text !== 'string' || typeof labels.filename !== 'string')
    throw Error('Supply the reference file name and contents.');
  const references = parseReferences(labels.text,labels.filename,result.frame,{
    crop:result.crop,pointCount:result.pointCount,tileId
  });
  const evaluation = evaluatePins(result.pins,references);
  if (result.savedCutoff) {
    result.savedCutoff.evaluation = result.savedCutoff.pins === result.pins ? evaluation :
      evaluatePins(result.savedCutoff.pins,references);
  }
  const baselineEvaluation = evaluatePins(result.baselinePins,references);
  const truth = references.map(p => [p.localX,p.localY]);
  const stagesAtCm = {};
  for (const {cm, tp} of evaluation.scores) {
    stagesAtCm[cm] = measureStages(learnedStages,truth,tp,cm/100).map(row => ({
      ...row, recall:truth.length ? row.matched/truth.length : null
    }));
  }
  const orchardEvaluation = result.orchard ? evaluatePins(result.orchard.pins,references) : null;
  return {...result,references,evaluation,baselineEvaluation,stagesAtCm,stages15cm:stagesAtCm[15],...(orchardEvaluation?{orchardEvaluation}:{})};
}
