// B9's flight coordinates are local. Fit the translation exclusively to the
// published checkerboard controls before loading or evaluating any trunk labels.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {compareVineSurvey, readSurveyedTrunks} from './vineyard-survey.mjs';

const [las, gcpDbf, trunkShp, weightsPath] = process.argv.slice(2);
if (!weightsPath || process.argv.length !== 6) {
  throw Error('Usage: node benchmark/studies/vineyard-b9.mjs September30m.las GCPs.dbf Trunks.shp vineyard-weights.json');
}
const checkpointScript = fileURLToPath(new URL('./vineyard-b9-checkpoints.mjs', import.meta.url));
const calibrationStart = performance.now();
const {stdout} = await promisify(execFile)(process.execPath, [checkpointScript, las, gcpDbf]);
const alignment = JSON.parse(stdout);
const registrationSeconds = (performance.now()-calibrationStart)/1000;
const shape = await readFile(trunkShp);
assert.equal(createHash('sha256').update(shape).digest('hex'), '573c49b7f3bbcf05cd285490f5c0003a52c92064909b8662ed5aab7dc50c5c40',
  'Use Trunks.shp from the Trunk_locations.zip file in Zenodo 7383601.');
const references = readSurveyedTrunks(shape, 11);
const trial = await compareVineSurvey(las, weightsPath, references, {
  translation: alignment.translation, equalPinCheck: true,
});
console.log(JSON.stringify({
  site: 'B9, Tomiño, Spain', survey: 'https://doi.org/10.5281/zenodo.7383601',
  file: basename(las), sensor: 'DJI Zenmuse L1', deposit: 'https://doi.org/10.5281/zenodo.8113105',
  sourcePoints: alignment.pointCount, fittedMarkerIds: alignment.candidates.filter(c => c.usedForTranslation).map(c => c.id),
  translation: alignment.translation, checkRmsCm: alignment.checkRmsCm, registrationSeconds, ...trial,
}, null, 2));
