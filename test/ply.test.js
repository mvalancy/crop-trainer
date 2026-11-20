import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePly,MAX_PLY_BYTES} from '../trainer/ply.js';
import {field} from '../trainer/field.js';

const text = new TextEncoder();
const axis = 'property float x\nproperty float y\nproperty float z';
const header = (elements,fmt='ascii') => 'ply\nformat '+fmt+' 1.0\n'+elements+'\nend_header\n';
const ascii = (rows, count=1) => text.encode(header('element vertex '+count+'\n'+axis)+rows);

test('reads georeferenced double coordinates, unordered properties and other ASCII elements', () => {
  const declarations = 'comment simulated test\nelement edge 1\nproperty list uchar int endpoints\n'+
    'element vertex 2\nproperty double y\nproperty uchar red\nproperty list uint8 int16 neighbors\nproperty float32 z\nproperty float64 x\n'+
    'element face 1\nproperty list uchar int vertex_indices';
  const source = (header(declarations)+'2 1 0\n6600000.0125 240 0 1.5 700000.0015\n6600000.015 0 2 1 2 0.1 700000.0115\n3 0 1 0\n').replaceAll('\n','\r\n');
  assert.deepEqual([...parsePly(text.encode(source))],[
    700000.0015,6600000.0125,1.5,700000.0115,6600000.015,Math.fround(.1)]);
});

test('binary rows use declared widths, list lengths and input view offset', () => {
  const prefix = text.encode(header('element vertex 2\nproperty list uchar int indices\nproperty double x\n'+
    'property short z\nproperty uchar r\nproperty float y\nelement face 1\nproperty list uchar int vertex_indices','binary_little_endian'));
  const body = new Uint8Array(49), view = new DataView(body.buffer);
  let offset = 0;
  for (const [j,n,x,y,z] of [[0,1,542000.123,.25,-4],[1,0,542000.456,.5,10]]) {
    view.setUint8(offset++,n);
    if (n) { view.setInt32(offset,42,true); offset+=4; }
    view.setFloat64(offset,x,true); offset+=8;
    view.setInt16(offset,z,true); offset+=2;
    view.setUint8(offset++,j);
    view.setFloat32(offset,y,true); offset+=4;
  }
  view.setUint8(offset++,3);
  for (const i of [0,1,0]) {view.setInt32(offset,i,true);offset+=4;}
  assert.equal(offset,body.length);
  const bytes = new Uint8Array(5+prefix.length+body.length+2);
  bytes.set(prefix,5); bytes.set(body,5+prefix.length);
  assert.deepEqual([...parsePly(bytes.subarray(5,-2))],[542000.123,.25,-4,542000.456,.5,10]);
});

test('reads the exact binary float layout emitted by the field generator', () => {
  const scan = field({seed:574, ground:true, points:12000, radius:.16, spacing:.31});
  const prefix = text.encode(header('element vertex '+scan.cls.length+'\n'+axis,'binary_little_endian'));
  const source = new Uint8Array(prefix.length + scan.xyz.byteLength);
  source.set(prefix);source.set(new Uint8Array(scan.xyz.buffer,scan.xyz.byteOffset,scan.xyz.byteLength),prefix.length);
  const xyz = parsePly(source.buffer);
  assert(xyz instanceof Float64Array);
  assert.equal(xyz.length, scan.xyz.length);
  assert(xyz.every((v,i)=>v===scan.xyz[i]));
});

test('malformed counts, records, coordinates and unsupported encodings give errors', () => {
  for (const data of [ascii('1e 2 3'),ascii('1 2\n3 4 5 6',2),ascii('1 2 3 4'),ascii('1 2 3',2),
    ascii('1 2 3\n4 5 6'),ascii('1e400 2 3'), ascii('0 inf 0'), ascii('0 NaN 0'), ascii('',1000001),
    text.encode(header('element vertex 1\nproperty float x\nproperty double x\nproperty float z')),
    text.encode(header('element vertex 1\n'+axis,'binary_big_endian')),
    text.encode(header('element vertex 1\n'+axis,'binary_little_endian')),
    text.encode('ply\ncomment end_header\n'), text.encode('ply\n'+' '.repeat(65536)+'end_header\n')]) {
    assert.throws(()=>parsePly(data));
  }
  assert.throws(()=>parsePly(new Uint8Array(MAX_PLY_BYTES+1)),/32 MiB/);
});

test('rejects malformed binary records and limits ASCII list lengths', () => {
  const h = text.encode(header('element vertex 1\n'+axis+'\nproperty list int short neighbors','binary_little_endian'));
  const b = new Uint8Array(h.length+16);b.set(h);
  const view = new DataView(b.buffer);
  view.setInt32(h.length+12,-1,true);assert.throws(()=>parsePly(b),/Negative/);
  view.setInt32(h.length+12,12000,true);assert.throws(()=>parsePly(b),/Truncated/);
  view.setInt32(h.length+12,0,true);view.setFloat32(h.length,NaN,true);assert.throws(()=>parsePly(b),/nonfinite/);
  const invalidList = header('element vertex 1\n'+axis+'\nproperty list uchar int neighbors')+'1 2 3 99 0';
  assert.throws(()=>parsePly(text.encode(invalidList)),/list length/);
});
