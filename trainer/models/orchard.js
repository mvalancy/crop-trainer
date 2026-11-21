// Geometric challenger for a ground-referenced 10 m × 10 m apple plot.
// Inputs are only XYZ in metres. The score is an occupancy index.
const size = 200, step = .05, stride = size+1;
const lowerHeights = [.48, .78, 1.12, 1.55, 2.04];
const weights = [1.5, 1.5, 1, .35, .35];
const threshold = 4, separation = 1.05;

function integral(mask) {
  const sums = new Uint32Array(stride*stride);
  for (let y=0; y<size; y++) {
    let row = 0;
    for (let x=0; x<size; x++) {
      row += mask[y*size+x];
      sums[(y+1)*stride+x+1] = sums[y*stride+x+1]+row;
    }
  }
  return sums;
}

function area(sums, x0, y0, x1, y1) {
  x0=Math.max(0,x0); y0=Math.max(0,y0); x1=Math.min(size,x1); y1=Math.min(size,y1);
  return sums[y1*stride+x1]-sums[y1*stride+x0]-sums[y0*stride+x1]+sums[y0*stride+x0];
}

function occupiedBands(xyz) {
  const bands = lowerHeights.map(() => new Uint8Array(size*size));
  const crown = new Uint8Array(size*size);
  for (let i=0; i<xyz.length; i+=3) {
    const x=xyz[i], y=xyz[i+1], z=xyz[i+2];
    // Survey-origin subtraction can put a boundary coordinate a fraction of a
    // nanometre outside the plot. Use the same tolerance as Field test.
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y) ||
        x< -1e-9 || y< -1e-9 || x>10+1e-9 || y>10+1e-9) {
      throw Error('Use finite XYZ metres in the 10 m plot frame for the apple base locator.');
    }
    let band=lowerHeights.length-1;
    while (band>=0 && z<lowerHeights[band]) band--;
    if (band<0) continue;
    const col=Math.min(size-1,Math.max(0,Math.floor(x/step)));
    const row=Math.min(size-1,Math.max(0,Math.floor(y/step)));
    const cell=row*size+col;
    bands[band][cell]=1;
    if (band>=1) crown[cell]=1;
  }
  return {bands:bands.map(integral), crown:integral(crown)};
}

function supportAt(bands, crown, x, y) {
  if (!area(crown,x-3,y-3,x+4,y+4)) return 0;
  // Look for a crown on several sides of the candidate. A branch tip usually
  // has nearby crown points on just one side. Empty quadrants are informative.
  const quadrants = [
    area(crown,x-15,y-15,x,y), area(crown,x+1,y-15,x+16,y),
    area(crown,x-15,y+1,x,y+16), area(crown,x+1,y+1,x+16,y+16)
  ].sort((a,b)=>a-b);
  if (quadrants[0]+quadrants[1]+quadrants[2]+quadrants[3]<5) return 0;
  const balance=(quadrants[0]+quadrants[1]+2)/(quadrants[2]+quadrants[3]+2);
  const occupied=quadrants.reduce((n,v)=>n+Math.min(1,v/3),0);
  let support=0;
  for (let i=0; i<bands.length; i++) {
    const near=area(bands[i],x-1,y-1,x+2,y+2), wider=area(bands[i],x-3,y-3,x+4,y+4);
    support += weights[i]*(.65*Math.min(1,near/2)+.35*Math.min(1,wider/4));
  }
  return support*(.20+.80*occupied/4)*(1+2.5*balance);
}

export function detectOrchardBases(xyz) {
  if ((!Array.isArray(xyz) && !ArrayBuffer.isView(xyz)) || !Number.isInteger(xyz.length) ||
      xyz.length%3!==0 || xyz.length>3_000_000) throw Error('Provide up to one million interleaved XYZ returns.');
  const {bands,crown}=occupiedBands(xyz), support=new Float32Array(size*size), candidates=[];
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const score=supportAt(bands,crown,x,y);
    if (score>=threshold) {
      candidates.push({x,y,score});
      support[y*size+x]=score;
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for (const cell of candidates) {
    if (!selected.some(p=>((p.x-cell.x)**2+(p.y-cell.y)**2)*step**2<separation**2)) selected.push(cell);
  }
  // Center a broad maximum instead of biasing flat plateaus to an early cell.
  const pins=selected.map(({x,y,score})=>{
    let sum=0, wx=0, wy=0;
    for (let j=Math.max(0,y-2);j<=Math.min(size-1,y+2);j++) {
      for (let i=Math.max(0,x-2);i<=Math.min(size-1,x+2);i++) {
        const w=Math.max(0,support[j*size+i]-.72*score);
        wx+=w*(i+.5)*step; wy+=w*(j+.5)*step; sum+=w;
      }
    }
    return {x:wx/sum, y:wy/sum, score};
  });
  return {pins,candidateCount:candidates.length,threshold,separationMeters:separation};
}
