// Frozen transfer check on RTK-surveyed vines in northern Spain.
// Supply the original B7 red LAS, or the B7 30 m L1 LAZ decompressed to LAS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {open, readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {compareVineSurvey, readSurveyedTrunks} from './vineyard-survey.mjs';

const [las, shapePath, weightsPath] = process.argv.slice(2);
if (!las || !shapePath || !weightsPath || process.argv.length !== 5) {
  throw Error('Usage: node benchmark/studies/vineyard-b7.mjs B7-scan.las trunk_locations_VineyardB7.shp vineyard-weights.json');
}
const shape = await readFile(shapePath);
assert.equal(createHash('sha256').update(shape).digest('hex'), '5969e2065b3dfe8a829e088698d3e18ceaa6b08d6cc746ed2c40f27edc9d1e63',
  'Use the B7 trunk shapefile from Zenodo 10362568.');
const handle = await open(las, 'r');
const header = Buffer.alloc(227);
try {
  await handle.read(header, 0, header.length, 0);
} finally {
  await handle.close();
}
const sources = new Map([
  [6479816, {sensor: 'Red-band photogrammetry', deposit: 'https://doi.org/10.5281/zenodo.10362568'}],
  [47893588, {sensor: 'DJI Zenmuse L1', deposit: 'https://doi.org/10.5281/zenodo.8113105'}],
]);
const sourcePoints = header.readUInt32LE(107);
const capture = sources.get(sourcePoints);
if (header.toString('ascii', 0, 4) !== 'LASF' || header[104] > 5 || !capture) {
  throw Error('Expected the July 14 B7 red LAS or the original 30 m L1 flight decompressed to legacy LAS.');
}

const references = readSurveyedTrunks(shape, 1);
const trial = await compareVineSurvey(las, weightsPath, references);
console.log(JSON.stringify({
  site: 'B7, Tomiño, Spain', survey: 'https://doi.org/10.5281/zenodo.10362568',
  file: basename(las), ...capture, sourcePoints, ...trial,
}, null, 2));
