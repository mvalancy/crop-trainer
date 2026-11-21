// The published April vineyard LAS uses metre coordinates and legacy uncompressed records.
import {open} from 'node:fs/promises';

export async function readPlotColumns(path, originXY, onPoint) {
  const cells = 200;
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(227);
    const first = await handle.read(header, 0, header.length, 0);
    if (first.bytesRead !== header.length || header.toString('ascii',0,4) !== 'LASF' || header[104] > 5) {
      throw Error('Expected the original uncompressed LAS with legacy point records.');
    }
    const start = header.readUInt32LE(96), stride = header.readUInt16LE(105);
    const sourcePoints = header.readUInt32LE(107);
    if (stride < 20 || !sourcePoints || start + stride*sourcePoints > (await handle.stat()).size) {
      throw Error('Invalid LAS record lengths.');
    }
    const scale = [131,139,147].map(i=>header.readDoubleLE(i));
    const offset = [155,163,171].map(i=>header.readDoubleLE(i));
    const blockPoints = 65536, buffer = Buffer.alloc(stride*blockPoints);
    let inPlot = 0;
    for (let n = 0; n < sourcePoints; n += blockPoints) {
      const bytes = stride*Math.min(blockPoints,sourcePoints-n);
      const {bytesRead} = await handle.read(buffer,0,bytes,start+stride*n);
      if (bytesRead !== bytes) throw Error('Incomplete scan.');
      for (let i = 0; i < bytes; i += stride) {
        const x = buffer.readInt32LE(i)*scale[0]+offset[0], y = buffer.readInt32LE(i+4)*scale[1]+offset[1];
        const ix = Math.floor((x-originXY[0])*20), iy = Math.floor((y-originXY[1])*20);
        if (ix < 0 || ix >= cells || iy < 0 || iy >= cells) continue;
        const z = buffer.readInt32LE(i+8)*scale[2]+offset[2];
        onPoint(x,y,z,iy*cells+ix);
        inPlot++;
      }
    }
    return {sourcePoints,inPlot};
  } finally {
    await handle.close();
  }
}
