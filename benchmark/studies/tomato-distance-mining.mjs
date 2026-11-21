// Fix the near/far mixture from the ordinary training sample before scoring any test planting.
import {settings,captures,runHardNegativeStudy} from './tomato-hard-negative-runner.mjs';
import {selectDistanceMatched} from './tomato-distance-bands.mjs';
import {auditTrainingSurfaces} from './tomato-hard-negative-surfaces.mjs';

const design={
  trainingSeeds:[2805643,2916761,3027871],
  testSeeds:[55121029,55242043,55363061,55484073,55605089,55726103],
  settings,captures,
  doses:[{sampling:'ordinary',hardCount:0},{sampling:'half-hard',hardCount:150},{sampling:'distance-matched',hardCount:150}],
  pilotEpochs:40,nearLimitMeters:.30,
  selection:'Keep exactly the ordinary 300 background rows’ distance composition from the shuffled train pool. Label distances are from refined candidate XY to nearest training center. Near means >0.15 and <0.30 m; far means ≥0.30 m. Divide the 150 hard slots in proportion to the ordinary near count, round its share to the nearest integer (ties up), and assign the rest to far. In each band take the highest pilot scores, break ties by shuffled index, and complete that band with unused candidates in shuffled order. Keep the final selected indices in shuffled order. All three arms keep the same positives and budget.',
  primary:'At 15 cm, require fewer extra weedy-seedling pins in both layouts than ordinary. Seedling recall and branching precision may each fall by at most one percentage point on either layout under both clean and weedy conditions. Also report the distance-matched minus unrestricted half-hard differences on these same fields. Freeze all samplers, models and the 0.65 cutoff before confirmation.'
};
await runHardNegativeStudy('tomato-distance-matched-mining-v1',design,{
  selectExamples:selectDistanceMatched,includeNegativeDistances:true,compareWith:'half-hard',
  surfaceAudit:(training,plan)=>auditTrainingSurfaces(training,plan,selectDistanceMatched)
});
