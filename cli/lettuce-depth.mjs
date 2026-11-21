import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (process.argv.length !== 3) throw Error('Usage: node cli/lettuce-depth.mjs /path/to/AgRibotLeafyVeg');

const width = 1280;
const height = 720;
const dates = ['2025-04-15', '2025-04-30', '2025-05-13', '2025-05-21'];
// ImageMagick 7 uses magick. Older releases provide convert.
let decoder = 'magick';
try {
  execFileSync(decoder, ['-version'], { stdio: 'ignore' });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  decoder = 'convert';
}

function measure(maskFile, depths) {
  const header = readFileSync(maskFile);
  if (header.readUInt32BE(16) !== width || header.readUInt32BE(20) !== height || depths.length !== 2 * width * height) {
    throw Error(`Expected a 1280 × 720 mask and an aligned 16-bit depth map for ${maskFile}`);
  }
  const mask = execFileSync(decoder, [maskFile, '-colorspace', 'gray', '-depth', '8', 'gray:-']);
  if (mask.length !== width * height) throw Error(`Unexpected mask size: ${maskFile}`);

  let area = 0, missing = 0, pairs = 0, bothMissing = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) continue;
    if (mask[i] !== 255) throw Error(`Expected binary plant mask: ${maskFile}`);
    const hole = depths.readUInt16LE(2 * i) === 0;
    area++;
    if (hole) missing++;
    if (i % width > 0 && mask[i - 1]) {
      pairs++;
      if (hole && depths.readUInt16LE(2 * (i - 1)) === 0) bothMissing++;
    }
    if (i >= width && mask[i - width]) {
      pairs++;
      if (hole && depths.readUInt16LE(2 * (i - width)) === 0) bothMissing++;
    }
  }
  if (area < 2 || !pairs) throw Error(`Plant mask has no adjacent pixels: ${maskFile}`);
  const expectedBothMissing = pairs * (missing / area) * ((missing - 1) / (area - 1));
  return { area, coverage: 1 - missing / area, pairs, bothMissing, expectedBothMissing };
}

function median(values) {
  values.sort((a, b) => a - b);
  return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
}

for (const date of dates) {
  const records = [];
  let frames = 0;
  for (const plot of readdirSync(join(root, date), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const folder = join(root, date, plot.name);
    const files = readdirSync(folder);
    const byTag = new Map();
    for (const file of files) {
      const match = /^depth_aligned_([0-9-]+)\.raw$/.exec(file);
      if (!match) continue;
      frames++;
      for (const tag of match[1].split('-')) {
        if (byTag.has(tag)) throw Error(`Multiple aligned frames for tag ${tag} in ${folder}`);
        byTag.set(tag, file);
      }
    }
    for (const file of files) {
      const match = /^plant_mask_(\d+)\.png$/.exec(file);
      if (!match) continue;
      const depthFile = byTag.get(match[1]);
      if (!depthFile) throw Error(`Missing aligned depth for ${join(folder, file)}`);
      records.push(measure(join(folder, file), readFileSync(join(folder, depthFile))));
    }
  }
  if (records.length !== 32) throw Error(`Expected 32 focal plants for ${date}, found ${records.length}`);
  const total = key => records.reduce((sum, record) => sum + record[key], 0);
  console.log(JSON.stringify({
    date, frames, plants: records.length, medianMaskPixels: median(records.map(r => r.area)),
    medianNonzeroFraction: median(records.map(r => r.coverage)),
    adjacentBothMissingFraction: total('bothMissing') / total('pairs'),
    shuffledBothMissingFraction: total('expectedBothMissing') / total('pairs')
  }));
}
