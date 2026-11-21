// Compare a fixed positive-example budget on an untouched training seed and new test plantings.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {settings,fitPair,scoreFields} from './tomato-soil-controls.mjs';

const cohorts={
  development:{trainSeed:443731,fieldSeeds:[36124013,36251027,36378101,36505033]},
  confirmation:{trainSeed:687139,fieldSeeds:[37132031,37259107,37386067,37513043,37640117,37767059]}
};
const sampleLimit=600;
const [cohort]=process.argv.slice(2);
if (process.argv.length>3 || (cohort && !Object.hasOwn(cohorts,cohort))) {
  throw Error('Choose development, confirmation or no argument for both cohorts.');
}
const fieldSeeds=Object.values(cohorts).flatMap(c=>c.fieldSeeds);
assert.equal(new Set(fieldSeeds).size,fieldSeeds.length);
const results={};
const splitSeeds=new Set();
for (const [name,design] of Object.entries(cohorts)) {
  if (cohort && cohort!==name) continue;
  const fits=await fitPair(design.trainSeed,sampleLimit,{stageControl:true});
  for (const seed of new Set(fits[0].manifest.map(scan=>scan.seed))) {
    assert.ok(!fieldSeeds.includes(seed) && !splitSeeds.has(seed));
    splitSeeds.add(seed);
  }
  assert.ok(fits.every(fit=>fit.samples===sampleLimit));
  const result=scoreFields(fits,design.fieldSeeds);
  const checks=['reference','os1-64'].map(layout=>{
    const scores=(form,sampling)=>result.summary.find(s=>s.plantForm===form && s.layout===layout)
      .models.find(m=>m.sampling===sampling).scores.find(s=>s.cm===15);
    const baseline=scores('branching','ordinary').precision, balanced=scores('branching','form-soil').precision;
    return {layout,seedlingF1Change:scores('seedling','form-soil').f1-scores('seedling','ordinary').f1,
      branchingPrecisionChange:baseline===null || balanced===null ? null : balanced-baseline,
      meetsBranchingLimit:baseline!==null && balanced!==null && balanced>=baseline-.01};
  });
  results[name]={fits:fits.map(({model,...metadata})=>metadata),...result,checks};
}
console.log(JSON.stringify({domain:'synthetic',backend:'CPU',node:process.version,cpu:cpus()[0]?.model,
  settings,sampleLimit,cohorts,results}));
