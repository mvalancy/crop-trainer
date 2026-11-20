import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRecipe} from '../trainer/data.js';
import {field} from '../trainer/field.js';
import {getSensor} from '../trainer/sensors.js';
import {parseReferences, evaluatePins, MAX_REFERENCE_BYTES} from '../trainer/references.js';

const nativeFrame = {unit:'m', origin:[0, 0, 0]};
const local = (localX, localY) => ({localX, localY});
const csv = (text, frame=nativeFrame) => parseReferences(text, 'survey.csv', frame);

test('CSV coordinates are preserved and converted to plot metres', () => {
  const frame = {unit:'mm', origin:[823456000, -1000, 42]};
  const points = parseReferences('\ufeffX, Y\r\n823456250,-5e2\r\n\r\n823466000,+9000.0\r\n', 'PLOT.CSV', frame);
  assert.deepEqual(points, [
    {x:823456250, y:-500, localX:.25, localY:.5},
    {x:823466000, y:9000, localX:10, localY:10}
  ]);
  assert.deepEqual(csv('x,y\n1,2', {unit:'cm', origin:[0,0,0]}), [
    {x:1, y:2, localX:.01, localY:.02}
  ]);
  assert.deepEqual(csv('x,y\n'), []);
});

test('invalid frames, cells and plot extents fail before scoring', () => {
  for (const row of ['0,', ',0', '0xF,2', '0,NaN', '-Infinity,1', '3e3000,2', '1,2,3']) {
    assert.throws(() => csv('x,y\n' + row), /line 2/);
  }
  for (const text of ['', 'y,x', '0,1']) assert.throws(() => csv(text), /Start the center CSV/);
  assert.throws(() => csv('x,y\n.5,-.01'), /outside/);
  assert.throws(() => csv('x,y\n10.0001,0'), /outside/);
  assert.throws(() => csv('x,y', {unit:'ft', origin:[0,0,0]}), /origin/);
  assert.throws(() => csv('x,y', {unit:'m', origin:[NaN,0,0]}), /origin/);
  assert.throws(() => parseReferences('x,y','survey.txt',nativeFrame), /Choose an x,y CSV/);
});

test('a native generator label export matches box centers and scan identity', () => {
  const scan = field(makeRecipe(713, true, getSensor('os1-64'), 'artichoke'));
  const labels = scan.labels;
  const expected = {tileId:labels.tile_id, crop:'artichoke', pointCount:scan.xyz.length/3};
  const parse = (data, frame=nativeFrame, metadata=expected) =>
    parseReferences(JSON.stringify(data), 'tile.labels.json', frame, metadata);
  const references = parse(labels);
  assert.equal(references.length, labels.boxes.length);
  assert.ok(references.length > 0);
  const {min, max} = labels.boxes[0];
  assert.deepEqual(references[0], {
    x:(min[0]+max[0])/2, y:(min[1]+max[1])/2,
    localX:(min[0]+max[0])/2, localY:(min[1]+max[1])/2
  });
  assert.throws(() => parse(labels,{unit:'cm', origin:[0,0,0]}), /Generator label JSON/);
  assert.throws(() => parse(labels,{unit:'m', origin:[2,0,0]}), /Generator label JSON/);
  assert.deepEqual(parse(labels,{unit:'m', origin:[0,0,.15]}), references,
    'ground elevation can change detected heights but never a surveyed XY center');
  assert.throws(() => parse({...labels, tile_id:'123456789abcdef0'}), /tile IDs/);
  assert.throws(() => parse({...labels, num_points:labels.num_points+1}), /point count/);
  assert.throws(() => parse({...labels, crop:'tomato'}), /different crops/);
  assert.throws(() => parse({...labels, boxes:[{min:[1,1,1], max:[0,0,0]}]}), /Invalid bounds/);
  assert.throws(() => parse({...labels, boxes:[{min:[99,0,0], max:[99,1,1]}]}), /outside/);
  assert.throws(() => parse({boxes:[]}), /generator/);
});

test('score radii and saved match IDs use maximum one-to-one XY matching', () => {
  const references = [local(0,0), local(.2,0)];
  const report = evaluatePins([local(.1,0), local(0,0), local(8,1)], references);
  assert.deepEqual(report.scores, [
    {cm:7.5, tp:1, fp:2, fn:1, precision:1/3, recall:.5, f1:2/5},
    {cm:10, tp:2, fp:1, fn:0, precision:2/3, recall:1, f1:4/5},
    {cm:15, tp:2, fp:1, fn:0, precision:2/3, recall:1, f1:4/5}
  ]);
  assert.deepEqual(report.pinByReference15, [1,0]);
  assert.equal(report.signedCountError, 1);
  const single = evaluatePins([local(.15,0)], [local(0,0),local(.01,0)]);
  assert.deepEqual(single.scores.map(row => row.tp), [0,0,1]);
  assert.equal(single.pinByReference15.filter(i => i !== -1).length, 1);
  assert.equal(single.signedCountError, -1);
});

test('surveyed empty plots and silent detectors have explicit metric denominators', () => {
  for (const [pins,refs,tp,fp,fn,precision,recall,f1] of [
    [[],[],0,0,0,null,null,null],
    [[local(0,0)],[],0,1,0,0,null,0],
    [[],[local(0,0)],0,0,1,null,0,0]
  ]) {
    const {scores,pinByReference15,signedCountError} = evaluatePins(pins,refs);
    assert.deepEqual(scores[2], {cm:15,tp,fp,fn,precision,recall,f1});
    assert.deepEqual(pinByReference15, refs.map(() => -1));
    assert.equal(signedCountError,fp-fn);
  }
});

test('large uploads, many references and excessive matching work fail explicitly', () => {
  assert.throws(() => csv('é'.repeat(MAX_REFERENCE_BYTES/2+1)), /2 MiB/);
  assert.throws(() => csv('x,y\n'+'1,1\n'.repeat(2001)), /2,000/);
  assert.throws(() => evaluatePins(Array(10001), []), /Too many centers/);
  assert.throws(() => evaluatePins(Array(5000), Array(2000)), /Too many centers/);
});
