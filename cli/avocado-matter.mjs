import {createReadStream} from 'node:fs';
import {join} from 'node:path';

const directory = process.argv[2];
if (!directory || process.argv.length !== 3) {
  throw Error('Usage: node cli/avocado-matter.mjs /path/to/extracted-avocado-dataset');
}

// The September collection has six focal trees. August contains the same six plus two others.
const focalScans = ['r14-t35e', 'r45-t24w', 'r49-t10e', 'r49-t65e', 'r6-t12w', 'r60-t8w'];
const bands = [[0.15, 0.48], [0.48, 0.81]];
const emptyCounts = () => bands.map(() => ({wood: 0, leaf: 0, other: 0}));

async function countMatter(file) {
  const counts = emptyCounts();
  const recordSize = 40;
  let remainder = Buffer.alloc(0), records = 0;
  for await (const chunk of createReadStream(file, {highWaterMark: recordSize * 16384})) {
    const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
    const end = data.length - data.length % recordSize;
    records += end / recordSize;
    for (let i = 0; i < end; i += recordSize) {
      if (data.readUInt32LE(i + 28) !== 1) continue; // Center tree in this scan
      const height = data.readDoubleLE(i + 32);
      if (!Number.isFinite(height)) throw Error(`Invalid height in ${file}`);
      if (height < bands[0][0] || height >= bands[1][1]) continue;
      const band = counts[height < bands[0][1] ? 0 : 1];
      const label = data.readUInt32LE(i + 24);
      if (label === 1) band.wood++;
      else if (label === 0) band.leaf++;
      else band.other++;
    }
    remainder = data.subarray(end);
  }
  if (!records || remainder.length) throw Error(`Expected whole 40-byte records in ${file}`);
  return {records, counts};
}

const collections = [];
for (const date of ['20170814', '20170907']) {
  const scans = [], totals = emptyCounts();
  for (const name of focalScans) {
    const result = await countMatter(join(directory, date, `${name}.bin`));
    scans.push({name, ...result});
    for (const [index, band] of result.counts.entries()) {
      totals[index].wood += band.wood;
      totals[index].leaf += band.leaf;
      totals[index].other += band.other;
    }
  }
  collections.push({date, totals, scans});
}
console.log(JSON.stringify({source: 'https://doi.org/10.17632/h49fpprg6c.1', heightBandsMeters: bands, collections}, null, 2));
