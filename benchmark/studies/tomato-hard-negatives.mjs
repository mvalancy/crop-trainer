// The first hard-negative experiment retains its original plan and freeze format.
import {settings,captures,runHardNegativeStudy} from './tomato-hard-negative-runner.mjs';
import {auditTrainingSurfaces} from './tomato-hard-negative-surfaces.mjs';

const study='tomato-hard-negative-v1';
const trainingSeeds=[2103181,2204207,2305237];
const testSeeds=[51112017,51224031,51336047,51448061,51560079,51672091];
const doses=[{sampling:'ordinary',hardCount:0},{sampling:'half-hard',hardCount:150},{sampling:'quarter-hard',hardCount:75}];
const design={trainingSeeds,testSeeds,settings,captures,doses,pilotEpochs:40,
  selection:'Score every eligible shuffled background row from training using the ordinary 40-epoch pilot. Take the declared number of highest scores (shuffled index breaks ties). Fill remaining places from the shuffled pool without duplicates. Retrain from the fixed initialization with new training-set scaling.',
  primary:'15 cm. Relative to ordinary 640 epochs, reduce extra seedling pins on weedy fields on each layout. Seedling recall and branching precision must each remain within one percentage point of ordinary on both layouts under both clean and weedy conditions. Test the half-hard and quarter-hard rules separately without choosing a dose on confirmation.'};

await runHardNegativeStudy(study,design,{surfaceAudit:auditTrainingSurfaces});
