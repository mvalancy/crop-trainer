// Compare frozen base-location rules on registered TLS dates from the same vineyard.
// The April reference frame stays fixed. Only scoring reads the surveyed centers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {detectScan} from '../../trainer/field-test/inference.js';
import {evaluatePins,parseReferences} from '../../trainer/field-test/references.js';
import {readPlotColumns} from './vineyard-las.mjs';

const [las,strip,weights]=process.argv.slice(2);
if (!weights || process.argv.length!==5) throw Error('Usage: node benchmark/studies/vineyard-vertical-support.mjs processed-scan.las prepared-april-strip vineyard-weights.json');
const info=JSON.parse(await readFile(join(strip,'frame.json'),'utf8'));
const model=JSON.parse(await readFile(weights,'utf8'));
assert.equal(info.source,'https://doi.org/10.5281/zenodo.18259014');
assert.equal(info.frame.unit,'m');
assert.equal(model.crop,'grapevine');
assert.equal(model.pinSeparation,.65);

const cells=200, cellWidth=.05, lowM=.15, highM=.55, layers=8;
const mask=new Uint8Array(cells*cells);
const returnsInBand=new Uint32Array(mask.length);
const highest=new Float64Array(mask.length).fill(-Infinity);
const topX=new Float64Array(mask.length),topY=new Float64Array(mask.length);
const {origin,gradePercent}=info.frame;
const slopeX=gradePercent[0]/100,slopeY=gradePercent[1]/100;
const started=performance.now();
const counts=await readPlotColumns(las,origin,(x,y,z,cell)=>{
  if (z>highest[cell]) {highest[cell]=z;topX[cell]=x;topY[cell]=y;}
  const h=z-origin[2]-(x-origin[0])*slopeX-(y-origin[1])*slopeY;
  const layer=Math.floor((h-lowM)/cellWidth);
  if (layer>=0 && layer<layers) {
    mask[cell]|=1<<layer;
    returnsInBand[cell]++;
  }
});
const overhead=[];
for (let cell=0;cell<highest.length;cell++) {
  if (Number.isFinite(highest[cell])) overhead.push(topX[cell],topY[cell],highest[cell]);
}
const prepareMs=performance.now()-started;
const nativeStart=performance.now();
const native=detectScan(Float64Array.from(overhead),model,info.frame);
const nativeMs=performance.now()-nativeStart;

// In each 15 x 15 cm neighborhood, measure footprint area and the longest
// consecutive stack of occupied 5 cm layers. One return fills a voxel.
const occupied=new Uint8Array(256), longest=new Uint8Array(256), topLayer=new Uint8Array(256);
for (let bits=1;bits<256;bits++) {
  occupied[bits]=occupied[bits>>1]+(bits&1);
  topLayer[bits]=1<<(31-Math.clz32(bits));
  let length=0;
  for(let i=0;i<layers;i++) {
    length=(bits & (1<<i)) ? length+1 : 0;
    longest[bits]=Math.max(longest[bits],length);
  }
}
const rankStart=performance.now();
const candidates=[];
for(let cell=0;cell<mask.length;cell++) {
  if (!mask[cell]) continue;
  const x=cell%cells,y=Math.floor(cell/cells);
  let footprint=0,voxels=0,union=0,topUnion=0,hits=0;
  for(let row=Math.max(0,y-1);row<=Math.min(cells-1,y+1);row++) {
    for(let col=Math.max(0,x-1);col<=Math.min(cells-1,x+1);col++) {
      const neighbor=row*cells+col, bits=mask[neighbor];
      hits+=returnsInBand[neighbor];
      topUnion|=topLayer[bits];
      footprint+=Number(bits!==0); voxels+=occupied[bits]; union|=bits;
    }
  }
  candidates.push({cell,localX:(x+.5)*cellWidth,localY:(y+.5)*cellWidth,footprint,stack:longest[union],topStack:longest[topUnion],voxels,hits});
}
const pinBudget=native.pins.length;
function place(sorted) {
  const pins=[];
  for(const candidate of sorted) {
    if (pins.length===pinBudget) break;
    if (pins.every(p=>(p.localX-candidate.localX)**2+(p.localY-candidate.localY)**2>=model.pinSeparation**2)) {
      pins.push(candidate);
    }
  }
  return pins;
}
const groundFootprint=place([...candidates].sort((a,b)=>b.footprint-a.footprint || a.cell-b.cell));
const returnDensity=place([...candidates].sort((a,b)=>b.hits-a.hits || a.cell-b.cell));
const collapsedVertical=place([...candidates].sort((a,b)=>b.topStack-a.topStack || b.footprint-a.footprint || a.cell-b.cell));
const vertical=place(candidates.sort((a,b)=>b.stack-a.stack || b.voxels-a.voxels || a.cell-b.cell));
const rankMs=performance.now()-rankStart;
const scoringStart=performance.now();
const references=parseReferences(await readFile(join(strip,'trunks.csv'),'utf8'),'trunks.csv',info.frame);
const methods={};
for (const [key,pins] of Object.entries({nativeModel:native.pins,height:native.baselinePins,groundFootprint,returnDensity,collapsedVertical,vertical})) {
  methods[key]={pins:pins.length,scores:evaluatePins(pins,references).scores};
}
console.log(JSON.stringify({source:info.source,license:info.license,scan:basename(las),aprilFrame:info.frame,modelSha256:createHash('sha256').update(JSON.stringify(model)).digest('hex'),
  ...counts,occupiedXY:overhead.length/3,bandColumns:candidates.length,references:references.length,
  settings:{cellWidth,lowM,highM,layers,neighborhoodCells:3,pinBudget,pinSeparation:model.pinSeparation},
  methods,timingMs:{preparation:prepareMs,native:nativeMs,geometricRanking:rankMs,scoring:performance.now()-scoringStart}},null,2));
