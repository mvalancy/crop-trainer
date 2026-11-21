// PLY 1.0 coordinates stay in file units and precision until scan alignment.
export const MAX_PLY_BYTES = 32 * 1024 * 1024;
export const MAX_PLY_POINTS = 1_000_000;
const HEADER_BYTES = 64 * 1024;
const MAX_RECORDS = 2_000_000;
const types = new Map();
for (const [names, bytes, read, min, max] of [
  ['char int8',1,'getInt8',-128,127], ['uchar uint8',1,'getUint8',0,255],
  ['short int16',2,'getInt16',-32768,32767], ['ushort uint16',2,'getUint16',0,65535],
  ['int int32',4,'getInt32',-2147483648,2147483647], ['uint uint32',4,'getUint32',0,4294967295],
  ['float float32',4,'getFloat32'], ['double float64',8,'getFloat64']
]) {
  for (const name of names.split(' ')) types.set(name,{bytes,read,min,max});
}

// Generator coordinates are interleaved float32 XYZ. Write the declared
// little-endian order explicitly so desktop and board exports agree.
export function encodePly(xyz) {
  if (!(xyz instanceof Float32Array) || xyz.length % 3) throw Error('Expected float32 XYZ triples.');
  const header = new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex '+xyz.length / 3+
    '\nproperty float x\nproperty float y\nproperty float z\nend_header\n');
  const bytes = new Uint8Array(header.length + xyz.byteLength);
  bytes.set(header);
  const view = new DataView(bytes.buffer, header.length);
  for (let i = 0; i < xyz.length; i++) view.setFloat32(i * 4, xyz[i], true);
  return bytes;
}

function parseHeader(bytes) {
  const lines = [], decoder = new TextDecoder();
  let start = 0, ended = false;
  for (let i = 0; i < Math.min(bytes.length,HEADER_BYTES); i++) {
    if (bytes[i] !== 10) continue;
    const line = decoder.decode(bytes.subarray(start,i)).trimEnd();
    start = i+1;
    if (line === 'end_header') { ended = true; break; }
    lines.push(line);
  }
  if (lines[0] !== 'ply') throw Error('Expected a PLY file beginning with “ply”.');
  if (!ended) throw Error('Missing end_header or PLY header exceeds 64 KiB.');
  const elements = [];
  let format, current, records = 0;
  for (const line of lines.slice(1)) {
    const [key,...v] = line.trim().split(/\s+/);
    if (key === 'comment' || key === 'obj_info' || key === '') continue;
    if (key === 'format') {
      if (format || current || v.length !== 2 || !['ascii','binary_little_endian'].includes(v[0]) || v[1] !== '1.0')
        throw Error('Use ASCII or binary little-endian PLY version 1.0.');
      format = v[0];
    } else if (key === 'element') {
      if (!format || v.length !== 2 || !/^\d+$/.test(v[1]) || elements.some(e=>e.name===v[0]))
        throw Error('Invalid or repeated PLY element declaration.');
      const count = Number(v[1]);
      if (v[0] === 'vertex' && (count < 1 || count > MAX_PLY_POINTS)) throw Error('Choose a scan with 1 to 1,000,000 vertices.');
      records += count;
      if (records > MAX_RECORDS || elements.length >= 128) throw Error('Too many PLY elements or records.');
      current = {name:v[0],count,properties:[]}; elements.push(current);
    } else if (key === 'property') {
      const list = v[0] === 'list', name = v.at(-1), type = types.get(v.at(-2));
      const lengthType = list ? types.get(v[1]) : null;
      if (!current || v.length !== (list?4:2) || !type || (list && lengthType?.max === undefined) ||
          current.properties.length >= 128 || current.properties.some(p=>p.name===name)) throw Error('Invalid, repeated or unsupported PLY property.');
      const axis = current.name === 'vertex' ? ['x','y','z'].indexOf(name) : -1;
      if (axis >= 0 && list) throw Error('The vertex x, y and z properties must be scalar numbers.');
      current.properties.push({name,type,lengthType,axis});
    } else throw Error('Unsupported PLY header directive: '+key.slice(0,40));
  }
  const vertices = elements.find(e=>e.name==='vertex');
  if (!vertices || vertices.properties.filter(p=>p.axis>=0).length !== 3) throw Error('PLY vertices need x, y and z properties.');
  if (elements.some(e=>e.count && !e.properties.length)) throw Error('Each nonempty PLY element needs properties.');
  return {elements,format,body:start,count:vertices.count};
}

function store(xyz,row,axis,value) {
  if (!Number.isFinite(value)) throw Error('Vertex '+(row+1)+' contains a nonfinite coordinate.');
  xyz[3*row+axis] = value;
}

function binaryBody(bytes,start,elements,xyz) {
  const data = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos = start;
  function consume(n) {
    const offset = pos;
    pos += n;
    if (pos > bytes.length) throw Error('Truncated binary PLY body.');
    return offset;
  }
  for (const {properties,count} of elements) {
    for (let row = 0; row < count; row++) {
      for (const {type,lengthType,axis} of properties) {
        if (lengthType) {
          const n = data[lengthType.read](consume(lengthType.bytes),true);
          if (n < 0) throw Error('Negative PLY list length.');
          consume(n * type.bytes);
        } else {
          const offset = consume(type.bytes);
          if (axis >= 0) store(xyz,row,axis,data[type.read](offset,true));
        }
      }
    }
  }
  if (pos !== bytes.length) throw Error('Unexpected bytes after the declared binary PLY records.');
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function asciiBody(bytes,start,elements,xyz) {
  const text = new TextDecoder().decode(bytes.subarray(start));
  const token = /[^\s]+/g;
  let line, next = 0;
  function readRow() {
    while (next < text.length) {
      const end = text.indexOf('\n',next);
      line = text.slice(next,end < 0 ? text.length : end);
      next += line.length+1;
      token.lastIndex = 0;
      if (/\S/.test(line)) return;
    }
    throw Error('Truncated ASCII PLY body.');
  }
  function scalar(type) {
    const word = token.exec(line)?.[0];
    if (word === undefined) throw Error('Missing property in ASCII PLY record.');
    if (type.max === undefined && /^[+-]?(nan|inf(?:inity)?)$/i.test(word)) return NaN;
    if (!decimal.test(word)) throw Error('Invalid number in ASCII PLY body.');
    const value = Number(word);
    if (type.max !== undefined && (!Number.isInteger(value) || value < type.min || value > type.max))
      throw Error('Integer property is out of range.');
    return type.read === 'getFloat32' ? Math.fround(value) : value;
  }
  for (const {properties,count} of elements) {
    for (let row = 0; row < count; row++) {
      readRow();
      for (const {type,lengthType,axis} of properties) {
        if (lengthType) {
          const n = scalar(lengthType);
          if (n < 0 || n > line.length-token.lastIndex) throw Error('Invalid PLY list length.');
          for (let k = 0; k < n; k++) scalar(type);
        } else {
          const value = scalar(type);
          if (axis >= 0) store(xyz,row,axis,value);
        }
      }
      if (token.exec(line)) throw Error('Extra property in ASCII PLY record.');
    }
  }
  if (/\S/.test(text.slice(next))) throw Error('Unexpected values after the declared ASCII PLY records.');
}

/** Read an ArrayBuffer or byte view and return interleaved XYZ without recentering. */
export function parsePly(source) {
  const bytes = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer,source.byteOffset,source.byteLength)
    : source instanceof ArrayBuffer ? new Uint8Array(source) : null;
  if (!bytes) throw Error('Read the PLY file as an ArrayBuffer.');
  if (bytes.byteLength > MAX_PLY_BYTES) throw Error('PLY file exceeds 32 MiB. Export a smaller plot.');
  const {elements,format,body,count} = parseHeader(bytes);
  const xyz = new Float64Array(count*3);
  if (format === 'ascii') asciiBody(bytes,body,elements,xyz);
  else binaryBody(bytes,body,elements,xyz);
  return xyz;
}
