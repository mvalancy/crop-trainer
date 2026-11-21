export const BENCH_HEIGHT_M = .73;
export const TROUGH_HEIGHT_M = .19;

// Metres in a 10 m plot. Render the upper intersection of each plant surface
// at the scanner's existing XY samples. Dimensions are procedural assumptions.
export function canopyPlant(crop,x,y,radius,soilZ,random,rays,hit,id) {
  const base = soilZ + (crop === 'bench-lettuce' ? .74 : 0);
  const bounds = {min:[x,y,base],max:[x,y,base],base_xy_m:[x,y]};
  const phase = 2*Math.PI*random();
  const vigor = .85+.30*random();
  function lobe(cx,cy,z,rx,ry,rz,angle=0) {
    const c=Math.cos(angle), s=Math.sin(angle);
    const ex=Math.hypot(rx*c,ry*s), ey=Math.hypot(rx*s,ry*c);
    bounds.min[0]=Math.min(bounds.min[0],cx-ex); bounds.max[0]=Math.max(bounds.max[0],cx+ex);
    bounds.min[1]=Math.min(bounds.min[1],cy-ey); bounds.max[1]=Math.max(bounds.max[1],cy+ey);
    bounds.max[2]=Math.max(bounds.max[2],z+rz);
    rays(cx,cy,Math.max(rx,ry),(i,dx,dy)=>{
      const u=(c*dx+s*dy)/rx, v=(-s*dx+c*dy)/ry, depth=1-u*u-v*v;
      if (depth>=0) hit(i,z+rz*Math.sqrt(depth),1,id);
    });
  }
  if (crop==='apple') {
    lobe(x,y,base+.8*vigor,.09,.09,.35);
    for(let j=0;j<8;j++) {
      const angle=phase+j*2.39996, reach=radius*(.32+.16*random());
      lobe(x+reach*Math.cos(angle),y+reach*Math.sin(angle),base+(1.2+.28*random())*vigor,
        .52*radius,.41*radius,(.45+.22*random())*vigor,angle);
    }
    lobe(x,y,base+1.65*vigor,.53*radius,.46*radius,.62*vigor,phase);
  } else if (crop==='grapevine') {
    lobe(x,y,base+.75*vigor,.05,.05,.2);
    for(let j=-3;j<=3;j++) {
      const dx=j*radius*.24;
      lobe(x+dx,y+.05*Math.sin(j+phase),base+(.96+.20*random())*vigor,
        radius*.34,radius*(.24+.08*random()),(.37+.14*random())*vigor);
    }
  } else if (crop==='high-wire-tomato') {
    const height=(1.7+.38*random())*vigor;
    for(let j=0;j<10;j++) {
      const t=(j+1)/10, angle=phase+2.39996*j;
      const cx=x+.065*t*Math.cos(phase), cy=y+.065*t*Math.sin(phase);
      lobe(cx,cy,base+t*height,.024,.024,.07);
      const reach=radius*(.56-.28*t);
      lobe(cx+reach*Math.cos(angle),cy+reach*Math.sin(angle),base+t*height,
        reach*1.15,reach*.39,.05,angle);
    }
  } else {
    for(let j=0;j<15;j++) {
      const t=j/15, angle=phase+2.39996*j, reach=radius*(.55-.40*t);
      lobe(x+reach*Math.cos(angle),y+reach*Math.sin(angle),base+(.03+.09*t)*vigor,
        reach,reach*.5,(.055+.045*t)*vigor,angle);
    }
  }
  return bounds;
}

// Fixtures are non-crop surfaces, class 6 with no plant ID. Their geometry
// stays fixed when a seed skips a plant or the scan changes sampling layout.
export function scanFixtures(crop,rows,terrain,rays,hit,plantArchitecture=1) {
  for(let row=0;row<rows;row++) {
    const y=(row+.5)*10/rows;
    rays(5,y,5,(i,dx,dy)=>{
      const x=5+dx, floor=terrain(x,y+dy);
      if (crop==='bench-lettuce') {
        // The v3 row continues through both tile edges, under the end plants.
        if(Math.abs(dy)<.31 && (plantArchitecture>=3 || Math.abs(dx)<4.78)) hit(i,floor+BENCH_HEIGHT_M,6,0);
      } else if (crop==='grapevine' || crop==='high-wire-tomato') {
        const highWire=crop==='high-wire-tomato', height=highWire?2.45:1.32;
        const lineOffset=highWire?.08:0;
        if(Math.abs(dy-lineOffset)<.009 && Math.abs(dx)<4.7) hit(i,floor+height,6,0);
        const postX=.35+Math.round((x-.35)/3.1)*3.1;
        if(Math.hypot(x-postX,dy-lineOffset)<.047) hit(i,floor+height+.08,6,0);
        if(highWire && Math.abs(dy)<.17 && Math.abs(dx)<4.75) hit(i,floor+TROUGH_HEIGHT_M,6,0);
      }
    });
  }
}
