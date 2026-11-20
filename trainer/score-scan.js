import {detectScan} from './inference.js?v=systems1';
import {measureStages} from './data.js?v=systems1';
import {parseReferences,evaluatePins} from './references.js?v=systems1';
import {MAX_PLY_POINTS} from './ply.js';

export function runFieldTest({model,xyz,alignment,labels=null,tileId}) {
  if (!xyz || xyz.length/3 > MAX_PLY_POINTS) throw Error('Choose a scan with up to 1,000,000 points.');
  let learnedStages;
  const captureStages = stages => { learnedStages = stages; };
  const result = detectScan(xyz,model,alignment,labels === null ? undefined : captureStages);
  if (labels === null) return {...result,references:null,evaluation:null,baselineEvaluation:null,stages15cm:null};
  if (typeof labels?.text !== 'string' || typeof labels.filename !== 'string')
    throw Error('Supply the reference file name and contents.');
  const references = parseReferences(labels.text,labels.filename,result.frame,{
    crop:result.crop,pointCount:result.pointCount,tileId
  });
  const evaluation = evaluatePins(result.pins,references);
  const baselineEvaluation = evaluatePins(result.baselinePins,references);
  const truth = references.map(p => [p.localX,p.localY]);
  const finalMatches = evaluation.scores.find(row => row.cm === 15).tp;
  const stages15cm = measureStages(learnedStages,truth,finalMatches).map(row => ({
    ...row, recall:truth.length ? row.matched/truth.length : null
  }));
  return {...result,references,evaluation,baselineEvaluation,stages15cm};
}
