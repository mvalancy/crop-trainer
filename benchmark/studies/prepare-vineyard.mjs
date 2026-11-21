// Adapter for the April 9 TLS scan in Zenodo 18259014 (TLS-Grapevine2024).
// Run after extracting the archive. Inputs remain on the user's computer.
import {open,readFile,mkdir,rmdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fitVineGround,readPlotColumns} from './vineyard-las.mjs';

const [root,output,strip='center']=process.argv.slice(2);
if (!root || !output || process.argv.length > 5 || !['center','north','south'].includes(strip)) {
  throw Error('Usage: node benchmark/studies/prepare-vineyard.mjs extracted-dataset new-plot-directory [center|north|south]');
}
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
// The two adjacent strips use the same easting and disjoint northing intervals.
originXY[1] += {center:0,north:10,south:-10}[strip];
const references=trunks.filter(p=>p.every((v,i)=>v>=originXY[i] && v<originXY[i]+10));
const cells=200, low=new Float64Array(cells*cells).fill(Infinity);
const high=new Float64Array(cells*cells).fill(-Infinity);
const xAt=new Float64Array(high.length), yAt=new Float64Array(high.length);
const {sourcePoints,inPlot} = await readPlotColumns(join(root,scanPath),originXY,(x,y,z,bin) => {
  low[bin] = Math.min(low[bin],z);
  if (z > high[bin]) { high[bin]=z; xAt[bin]=x; yAt[bin]=y; }
});

const fitted=fitVineGround(low);
if (!fitted) throw Error('Ground plane is underdetermined.');
const {z0,b,c,groundSamples}=fitted;
const count=high.reduce((sum,z)=>sum+Number.isFinite(z),0);
const body=Buffer.alloc(count*24);
let pos=0;
for(let i=0;i<high.length;i++) if(Number.isFinite(high[i])) {
  for(const v of [xAt[i],yAt[i],high[i]]) {body.writeDoubleLE(v,pos); pos+=8;}
}
const plyHeader='ply\nformat binary_little_endian 1.0\nelement vertex '+count+'\nproperty double x\nproperty double y\nproperty double z\nend_header\n';
const frame={unit:'m',origin:[...originXY,z0],gradePercent:[100*b,100*c]};
const info={source:'https://doi.org/10.5281/zenodo.18259014',license:'CC BY 4.0',scanPath,crs:'EPSG:3763',
  sourcePoints,pointsInPlot:inPlot,occupiedCells:count,references:references.length,groundSamples,frame};
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
