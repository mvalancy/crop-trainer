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

export function fitVineGround(low) {
  const cells=200;
  // Estimate the plane independently of the labels and predictions. Equal weight
  // per occupied square metre limits the influence of dense scanner positions.
  const samples=[];
  for(let y=0;y<10;y++) for(let x=0;x<10;x++) {
    const zs=[];
    for(let dy=0;dy<20;dy++) for(let dx=0;dx<20;dx++) {
      const z=low[(y*20+dy)*cells+x*20+dx]; if(Number.isFinite(z)) zs.push(z);
    }
    if(zs.length<100) continue;
    zs.sort((a,b)=>a-b);
    samples.push([1,x+.5,y+.5,zs[Math.floor(.1*(zs.length-1))]]);
  }
  if(samples.length<3) return null;
  // Solve the three normal equations z = a + bx + cy.
  const matrix=Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>
    samples.reduce((sum,s)=>sum+s[i]*s[j],0)));
  for(let i=0;i<3;i++) {
    let pivot=i;
    for(let j=i+1;j<3;j++) if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i])) pivot=j;
    [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
    const divisor=matrix[i][i];
    if(Math.abs(divisor)<1e-10) return null;
    matrix[i]=matrix[i].map(v=>v/divisor);
    for(let j=0;j<3;j++) if(j!==i) {
      const factor=matrix[j][i]; matrix[j]=matrix[j].map((v,k)=>v-factor*matrix[i][k]);
    }
  }
  const [z0,b,c]=matrix.map(row=>row[3]);
  return {z0,b,c,groundSamples:samples.length};
}
