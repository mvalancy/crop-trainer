import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const directory = process.argv[2];
if (!directory || process.argv.length !== 3) throw Error('Usage: node cli/maize-ground.mjs /path/to/Crops3D_IS/IS');
const sorted = values => values.sort((a, b) => a - b);
const ranked = (values, p) => values[Math.ceil(values.length * p) - 1];
function quantile(values, p) {
  const offset = (values.length - 1) * p, i = Math.floor(offset);
  return values[i] + (offset - i) * (values[Math.ceil(offset)] - values[i]);
}

// Read only the fixed layout of the original Crops3D_IS plot files. App uploads have separate limits.
async function inspect(name) {
  const source = await readFile(join(directory, name));
  const terminator = 'end_header\n';
  const marker = source.subarray(0, 4096).indexOf(terminator);
  if (marker < 0) throw Error(`Missing Crops3D_IS header in ${name}`);
  const headerEnd = marker + terminator.length;
  const lines = source.subarray(0, headerEnd).toString('ascii').trimEnd().split('\n');
  const elements = lines.filter(line => line.startsWith('element '));
  const points = elements.length === 1 && elements[0].match(/^element vertex (\d+)$/);
  const properties = lines.filter(line => line.startsWith('property ')).map(line => line.slice(9));
  const expected = ['float x', 'float y', 'float z', 'uchar red', 'uchar green', 'uchar blue', 'float scalar_sf'];
  if (lines[0] !== 'ply' || lines[1] !== 'format binary_little_endian 1.0' || !points ||
      properties.join(',') !== expected.join(',') || source.length !== headerEnd + 19 * Number(points[1])) {
    throw Error(`Unexpected Crops3D_IS format in ${name}`);
  }
  const cells = new Map(), plants = new Map();
  for (let i = headerEnd; i < source.length; i += 19) {
    const x = source.readFloatLE(i), y = source.readFloatLE(i + 4), z = source.readFloatLE(i + 8), id = source.readFloatLE(i + 15);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isInteger(id) || id < 0) throw Error(`Invalid vertex in ${name}`);
    const key = `${Math.floor(x / .05)},${Math.floor(y / .05)}`;
    if (!cells.has(key)) cells.set(key, {low: Infinity, ground: Infinity});
    const cell = cells.get(key);
    cell.low = Math.min(cell.low, z);
    if (id === 0) cell.ground = Math.min(cell.ground, z);
    else {
      if (!plants.has(id)) plants.set(id, {x: 0, y: 0, n: 0});
      const plant = plants.get(id);
      plant.x += x; plant.y += y; plant.n++;
    }
  }
  const plotFloor = ranked(sorted(Array.from(cells.values(), cell => cell.low)), .2);
  const samples = [];
  for (const [id, plant] of plants) {
    const x = Math.floor((plant.x / plant.n) / .05), y = Math.floor((plant.y / plant.n) / .05);
    const nearbyGround = [], ring = [], ringGround = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const cell = cells.get(`${x + dx},${y + dy}`);
      if (!cell) continue;
      const distance2 = dx * dx + dy * dy;
      if (distance2 <= 4 && Number.isFinite(cell.ground)) nearbyGround.push(cell.ground);
      if (distance2 >= 9 && distance2 <= 36) {
        ring.push(cell.low);
        if (Number.isFinite(cell.ground)) ringGround.push(cell.ground);
      }
    }
    const sample = {id, referenceCells: nearbyGround.length, ringCells: ring.length, labeledRingCells: ringGround.length};
    if (nearbyGround.length >= 3 && ring.length >= 3) {
      const reference = quantile(sorted(nearbyGround), .5), localFloor = ranked(sorted(ring), .2);
      sample.plotError = plotFloor - reference;
      sample.localError = localFloor - reference;
      sample.ringSpread = ranked(ring, .8) - localFloor;
      if (ringGround.length >= 3) sample.groundSpread = ranked(sorted(ringGround), .8) - ranked(ringGround, .2);
    }
    samples.push(sample);
  }
  return {name, vertices: Number(points[1]), samples};
}

const plots = [];
for (const id of [2, 3, 11, 12, 14]) plots.push(await inspect(`maize-${id}.ply`));
const anchors = plots.flatMap(plot => plot.samples);
const metrics = {};
for (const key of ['plotError', 'localError', 'ringSpread', 'groundSpread']) {
  const absolute = sorted(anchors.filter(a => key in a).map(a => Math.abs(a[key])));
  metrics[key] = {
    count: absolute.length,
    median: absolute.length ? quantile(absolute, .5) : null,
    p90: absolute.length ? quantile(absolute, .9) : null
  };
  if (key.endsWith('Error')) metrics[key].within35mm = absolute.filter(value => value <= .035).length;
}
console.log(JSON.stringify({source: 'https://doi.org/10.6084/m9.figshare.27313272', units: 'source XYZ units, treated as metres', metrics, plots}, null, 2));
