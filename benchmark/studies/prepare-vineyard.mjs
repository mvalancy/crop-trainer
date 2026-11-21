// Adapter for the April 9 TLS scan in Zenodo 18259014 (TLS-Grapevine2024).
// Run after extracting the archive. Inputs remain on the user's computer.
import {open,readFile,mkdir,rmdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';

const [root,output]=process.argv.slice(2);
if(!root || !output) throw Error('node benchmark/studies/prepare-vineyard.mjs extracted-dataset new-plot-directory');
const scanPath='1_Leaf_Development/BBCH_13/TLS_PointClouds/Processed/BBCH13_20240409_TLS.las';
const shape=await readFile(join(root,'Vectors/Grapevine_trunks.shp'));
if(shape.readInt32LE(32)!==11) throw Error('Expected the published PointZ trunk shapefile.');
const trunks=[];
for(let offset=100;offset<shape.length;) {
  const bytes=shape.readInt32BE(offset+4)*2;
  if(bytes<28 || offset+8+bytes>shape.length || shape.readInt32LE(offset+8)!==11) throw Error('Invalid trunk record.');
  trunks.push([shape.readDoubleLE(offset+12),shape.readDoubleLE(offset+20)]);
  offset+=8+bytes;
}
if(trunks.length!==52) throw Error('Expected 52 trunk positions from the versioned record.');
// Choose the middle strip using the survey extent before running any detector.
const originXY=[0,1].map(axis=>{
  const values=trunks.map(p=>p[axis]);
  return Math.floor((Math.min(...values)+Math.max(...values))/2)-5;
});
const references=trunks.filter(p=>p.every((v,i)=>v>=originXY[i] && v<originXY[i]+10));
const cells=200, low=new Float64Array(cells*cells).fill(Infinity);
const high=new Float64Array(cells*cells).fill(-Infinity);
const xAt=new Float64Array(high.length), yAt=new Float64Array(high.length);
let sourcePoints, inPlot=0;
const handle=await open(join(root,scanPath),'r');
try {
  const header=Buffer.alloc(227);
  await handle.read(header,0,header.length,0);
  if(header.toString('ascii',0,4)!=='LASF' || header[104]>5) throw Error('Expected the original uncompressed LAS with legacy point records.');
  const start=header.readUInt32LE(96), stride=header.readUInt16LE(105);
  sourcePoints=header.readUInt32LE(107);
  if(stride<20 || !sourcePoints || start+stride*sourcePoints>(await handle.stat()).size) throw Error('Invalid LAS record lengths.');
  const scale=[131,139,147].map(i=>header.readDoubleLE(i));
  const offset=[155,163,171].map(i=>header.readDoubleLE(i));
  const blockPoints=65536, buffer=Buffer.alloc(stride*blockPoints);
  for(let n=0;n<sourcePoints;n+=blockPoints) {
    const bytes=stride*Math.min(blockPoints,sourcePoints-n);
    const {bytesRead}=await handle.read(buffer,0,bytes,start+stride*n);
    if(bytesRead!==bytes) throw Error('Incomplete scan.');
    for(let i=0;i<bytes;i+=stride) {
      const x=buffer.readInt32LE(i)*scale[0]+offset[0], y=buffer.readInt32LE(i+4)*scale[1]+offset[1];
      const ix=Math.floor((x-originXY[0])*20), iy=Math.floor((y-originXY[1])*20);
      if(ix<0 || ix>=cells || iy<0 || iy>=cells) continue;
      const z=buffer.readInt32LE(i+8)*scale[2]+offset[2], bin=iy*cells+ix;
      inPlot++; low[bin]=Math.min(low[bin],z);
      if(z>high[bin]) { high[bin]=z; xAt[bin]=x; yAt[bin]=y; }
    }
  }
} finally { await handle.close(); }

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
if(samples.length<3) throw Error('Too few occupied ground cells.');
// Solve the three normal equations z = a + bx + cy.
const matrix=Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>
  samples.reduce((sum,s)=>sum+s[i]*s[j],0)));
for(let i=0;i<3;i++) {
  let pivot=i;
  for(let j=i+1;j<3;j++) if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i])) pivot=j;
  [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
  const divisor=matrix[i][i];
  if(Math.abs(divisor)<1e-10) throw Error('Ground plane is underdetermined.');
  matrix[i]=matrix[i].map(v=>v/divisor);
  for(let j=0;j<3;j++) if(j!==i) {
    const factor=matrix[j][i]; matrix[j]=matrix[j].map((v,k)=>v-factor*matrix[i][k]);
  }
}
const [z0,b,c]=matrix.map(row=>row[3]);
const count=high.reduce((sum,z)=>sum+Number.isFinite(z),0);
const body=Buffer.alloc(count*24);
let pos=0;
for(let i=0;i<high.length;i++) if(Number.isFinite(high[i])) {
  for(const v of [xAt[i],yAt[i],high[i]]) {body.writeDoubleLE(v,pos); pos+=8;}
}
const plyHeader='ply\nformat binary_little_endian 1.0\nelement vertex '+count+'\nproperty double x\nproperty double y\nproperty double z\nend_header\n';
const frame={unit:'m',origin:[...originXY,z0],gradePercent:[100*b,100*c]};
const info={source:'https://doi.org/10.5281/zenodo.18259014',license:'CC BY 4.0',scanPath,crs:'EPSG:3763',
  sourcePoints,pointsInPlot:inPlot,occupiedCells:count,references:references.length,groundSamples:samples.length,frame};
// Reserving the directory prevents concurrent runs from replacing each other's plots.
await mkdir(output);
const files = [
  ['plot.ply', Buffer.concat([Buffer.from(plyHeader), body])],
  ['trunks.csv', 'x,y\n' + references.map(point => point.join(',')).join('\n') + '\n'],
  ['frame.json', JSON.stringify(info, null, 2) + '\n']
];
const created = [];
try {
  for (const [name, content] of files) {
    const path = join(output, name);
    const file = await open(path, 'wx');
    created.push(path);
    try { await file.writeFile(content); }
    finally { await file.close(); }
  }
} catch (error) {
  await Promise.all(created.map(path => unlink(path)));
  await rmdir(output);
  throw error;
}
console.log(JSON.stringify(info));
