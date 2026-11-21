// Reuse the recorded calibration scans. No confirmation fields enter this diagnostic.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hash,selectFitCutoffs} from './tomato-cutoff-controls.mjs';
import {poolScores} from './tomato-soil-controls.mjs';

const [path] = process.argv.slice(2);
if (process.argv.length !== 3) throw Error('Pass the JSON from tomato-fit-calibration.mjs calibrate.');
const report = JSON.parse(await readFile(path,'utf8'));
assert.equal(report.study,'tomato-fit-calibration-v1');
assert.equal(report.phase,'calibrate');
assert.equal(report.designHash,hash(report.design));
const {trainingSeeds,panels} = report.design;
const seeds = [...panels.primary,...panels.sensitivity];
assert.deepEqual([panels.primary.length,panels.sensitivity.length,new Set(seeds).size],[4,4,8]);
const fields = [...report.calibration.primary.fields,...report.calibration.sensitivity.fields];
const arms = report.calibration.primary.grid.map(({seed,epochs,percent})=>({seed,epochs,percent}));
for (const scan of fields) {
  assert.deepEqual(scan.models.map(({seed,epochs,percent})=>({seed,epochs,percent})),arms);
}

function scoresFor(fieldSeeds) {
  const scans = fields.filter(field=>fieldSeeds.includes(field.seed));
  const groups = [];
  for (const layout of ['reference','os1-64']) {
    for (const plantForm of ['seedling','branching']) {
      const group = scans.filter(scan=>scan.layout===layout && scan.plantForm===plantForm);
      assert.deepEqual(group.map(scan=>scan.seed).sort((a,b)=>a-b),[...fieldSeeds].sort((a,b)=>a-b));
      groups.push({layout,plantForm,scans:group});
    }
  }
  return arms.map((arm,i)=>({...arm,groups:groups.map(({layout,plantForm,scans})=>({
    layout,plantForm,scores:poolScores(scans,scan=>scan.models[i].scores)
  }))}));
}

// Recover the two published panels from integer counts before regrouping them.
for (const [name,fieldSeeds] of Object.entries(panels)) {
  const rows = scoresFor(fieldSeeds);
  assert.deepEqual(rows,report.calibration[name].grid);
  assert.deepEqual(selectFitCutoffs(rows,trainingSeeds),report.calibration[name].choices);
}
function* choose(fields,count,start=0) {
  if (count===0) { yield []; return; }
  for (let i=start;i<=fields.length-count;i++) {
    for (const rest of choose(fields,count-1,i+1)) yield [fields[i],...rest];
  }
}
const started = performance.now();
const subsets = Array.from(choose(seeds,4), fieldSeeds=>({
  fieldSeeds,choices:selectFitCutoffs(scoresFor(fieldSeeds),trainingSeeds)
}));
assert.equal(subsets.length,70);
const frequencies = trainingSeeds.map(seed=>{
  const counts = {};
  for (const panel of subsets) {
    const {epochs,percent} = panel.choices.find(fit=>fit.seed===seed);
    const label = epochs+'@'+(percent/100).toFixed(2);
    counts[label] = (counts[label] ?? 0)+1;
  }
  return {seed,counts};
});
console.log(JSON.stringify({study:'tomato-calibration-panels-v1',domain:'synthetic',freezeHash:report.freezeHash,
  calibrationSeeds:seeds,frequencies,allEight:selectFitCutoffs(scoresFor(seeds),trainingSeeds),
  subsets,elapsedMs:performance.now()-started},null,2));
