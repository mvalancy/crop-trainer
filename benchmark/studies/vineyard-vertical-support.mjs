// Compare frozen base-location rules on registered TLS dates from the same vineyard.
// The April reference frame stays fixed. Only scoring reads the surveyed centers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {evaluatePins,parseReferences} from '../../trainer/field-test/references.js';
import {columnSettings,locateVinePlot} from './vineyard-columns.mjs';

const [las,strip,weights]=process.argv.slice(2);
if (!weights || process.argv.length!==5) throw Error('Usage: node benchmark/studies/vineyard-vertical-support.mjs processed-scan.las prepared-april-strip vineyard-weights.json');
const info=JSON.parse(await readFile(join(strip,'frame.json'),'utf8'));
const model=JSON.parse(await readFile(weights,'utf8'));
assert.equal(info.source,'https://doi.org/10.5281/zenodo.18259014');
assert.equal(info.frame.unit,'m');
assert.equal(model.crop,'grapevine');
assert.equal(model.pinSeparation,.65);

const {predictions,timingMs,inPlot,sourcePoints,occupiedXY,bandColumns} = await locateVinePlot(las,info.frame,model);
const scoringStart=performance.now();
const references=parseReferences(await readFile(join(strip,'trunks.csv'),'utf8'),'trunks.csv',info.frame);
const methods={};
for (const [key,pins] of Object.entries(predictions)) {
  methods[key]={pins:pins.length,scores:evaluatePins(pins,references).scores};
}
console.log(JSON.stringify({source:info.source,license:info.license,scan:basename(las),aprilFrame:info.frame,modelSha256:createHash('sha256').update(JSON.stringify(model)).digest('hex'),
  inPlot,sourcePoints,occupiedXY,bandColumns,references:references.length,
  settings:{...columnSettings,pinBudget:predictions.nativeModel.length,pinSeparation:model.pinSeparation},
  methods,timingMs:{...timingMs,scoring:performance.now()-scoringStart}},null,2));
