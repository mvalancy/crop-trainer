// Frozen column and footprint rules shared by the Portuguese and Spanish field checks.
import {detectScan} from '../../trainer/field-test/inference.js';
import {readPlotColumns} from './vineyard-las.mjs';

export const columnSettings = Object.freeze({
  cellWidth: .05, lowM: .15, highM: .55, layers: 8, neighborhoodCells: 3,
});

export async function locateVinePlot(las,frame,model) {
  const cells=200;
  const {cellWidth,lowM,layers}=columnSettings;
  const mask=new Uint8Array(cells*cells);
  const returnsInBand=new Uint32Array(mask.length);
  const highest=new Float64Array(mask.length).fill(-Infinity);
  const topX=new Float64Array(mask.length),topY=new Float64Array(mask.length);
  const {origin,gradePercent}=frame;
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
  const native=detectScan(Float64Array.from(overhead),model,frame);
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
  return {
    ...counts, occupiedXY:overhead.length/3, bandColumns:candidates.length, bandMask:mask,
    predictions:{nativeModel:native.pins,height:native.baselinePins,groundFootprint,returnDensity,collapsedVertical,vertical},
    timingMs:{preparation:prepareMs,native:nativeMs,geometricRanking:rankMs},
  };
}
