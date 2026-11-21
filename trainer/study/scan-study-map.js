import {ORCHARD_GRID_SIDE} from '../models/orchard.js?v=orchard-ranking1';

const inset=12;
const measured={returns:p=>p.returns>0,peaks:p=>p.peak,pins:p=>p.height,sampledPins:p=>p.sampledHeight,orchard:p=>p.orchard};
const pinLists={pins:'heightPins',sampledPins:'sampledHeightPins',orchard:'orchardPins'};
const displayedPatches = new WeakMap();

export function reached(plant,metric) {return measured[metric](plant);}

// The field and the close-up share +Y upwards. Read the grid from top to bottom.
export function drawLowPatch(host, cellId, lowCellIds) {
  const previous = displayedPatches.get(host);
  if (host.firstChild && previous?.cellId === cellId && previous.ids === lowCellIds) return;
  const centerCol=cellId%ORCHARD_GRID_SIDE, centerRow=Math.floor(cellId/ORCHARD_GRID_SIDE);
  const occupied=new Set(lowCellIds);
  const grid=document.createElement('div');
  grid.className='lowPatchGrid';grid.setAttribute('role','img');
  const positions=[];
  for(const dy of [1,0,-1]) for(const dx of [-1,0,1]) {
    const cell=document.createElement('span'), col=centerCol+dx, row=centerRow+dy;
    const inside=col>=0 && row>=0 && col<ORCHARD_GRID_SIDE && row<ORCHARD_GRID_SIDE;
    if(!inside)cell.className='outside';
    else if(occupied.has(row*ORCHARD_GRID_SIDE+col)) {
      cell.className='occupied';
      const vertical=['bottom','','top'][dy+1],horizontal=['left','','right'][dx+1];
      positions.push([vertical,horizontal].filter(Boolean).join(' ') || 'center');
    }
    if(dx===0 && dy===0)cell.textContent='+';
    cell.setAttribute('aria-hidden','true');grid.append(cell);
  }
  grid.setAttribute('aria-label','View from above. The candidate is at the center. '+
    (positions.length?'Occupied cells: '+positions.join(', ')+'.':'There are no low returns in this neighborhood.'));
  const words=document.createElement('div'),title=document.createElement('strong'),text=document.createElement('p');
  title.textContent='Low returns around this candidate';
  const count=positions.length, bonus=Math.min(2,count);
  text.textContent=count+' of 9 cells occupied. This adds '+bonus+(bonus===1?' priority point.':' priority points.')+
    ' Each square is 5 cm wide. The + marks the candidate.';
  words.append(title,text);host.replaceChildren(grid,words);host.hidden=false;
  displayedPatches.set(host, {cellId, ids:lowCellIds});
}

export function studyMap(canvas) {
  const ctx=canvas.getContext('2d');
  let span=10,left=0,top=10;
  function geometry(){
    const width=canvas.clientWidth||280, height=canvas.clientHeight||200;
    const size=Math.min(width-2*inset,height-2*inset);
    return {width,height,size,x:(width-size)/2,y:(height-size)/2};
  }
  function draw({cloud,result,metric='returns',selected=-1,focused=false,lowCellIds}={}) {
    const plant=result?.plants[selected];
    const close=focused && Boolean(plant);
    span=close?2.5:10;
    left=close?Math.max(0,Math.min(10-span,plant.x-span/2)):0;
    top=close?Math.max(span,Math.min(10,plant.y+span/2)):10;
    const g=geometry(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
    canvas.width=Math.round(g.width*dpr);canvas.height=Math.round(g.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#142f28';ctx.fillRect(0,0,g.width,g.height);
    const x=m=>g.x+(m-left)*g.size/span,y=m=>g.y+(top-m)*g.size/span;
    ctx.save();
    ctx.beginPath();ctx.rect(g.x,g.y,g.size,g.size);ctx.clip();
    ctx.strokeStyle='#335344';ctx.lineWidth=1;
    const gridStep = close ? .5 : 2;
    for(let n=0;n<=10;n+=gridStep) {
      ctx.beginPath();ctx.moveTo(x(0),y(n));ctx.lineTo(x(10),y(n));ctx.moveTo(x(n),y(0));ctx.lineTo(x(n),y(10));ctx.stroke();
    }
    if(cloud) {
      for(let i=0;i<cloud.length;i+=4) {
        ctx.fillStyle=cloud[i+3]===1?'#94b988':'#456452';ctx.fillRect(x(cloud[i]),y(cloud[i+1]),1.3,1.3);
      }
    }
    if(lowCellIds?.length) {
      // The worker sends the full detector mask for this height band, even if
      // the ordinary preview sampled no returns from the selected tree.
      const meters=10/ORCHARD_GRID_SIDE;
      const side=meters*g.size/span;
      ctx.fillStyle='#64deea';
      for(const id of lowCellIds) {
        const col=id%ORCHARD_GRID_SIDE,row=Math.floor(id/ORCHARD_GRID_SIDE);
        ctx.fillRect(x(col*meters),y((row+1)*meters),side,side);
      }
    }
    const pins=result?.[pinLists[metric]];
    if(close && pins?.length){
      let nearest, best=Infinity;
      for(const pin of pins){
        const d=(pin[0]-plant.x)**2+(pin[1]-plant.y)**2;
        if(d<best){best=d;nearest=pin;}
      }
      ctx.strokeStyle='#f4db73';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(x(plant.x),y(plant.y));ctx.lineTo(x(nearest[0]),y(nearest[1]));ctx.stroke();
    }
    for(const [i,p] of (result?.plants ?? []).entries()){
      const cx=x(p.x),cy=y(p.y);
      ctx.beginPath();
      if(reached(p,metric)){
        ctx.fillStyle='#c1ed8d';ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fill();
      }else{
        ctx.strokeStyle='#fdaf8e';ctx.lineWidth=1.55;
        ctx.moveTo(cx-2,cy-2);ctx.lineTo(cx+2,cy+2);ctx.moveTo(cx+2,cy-2);ctx.lineTo(cx-2,cy+2);ctx.stroke();
      }
      if(i===selected){
        ctx.beginPath();ctx.strokeStyle='white';ctx.lineWidth=1.6;
        const radius = close ? .15*g.size/span : 5.5;
        ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
      }
    }
    if(pins){
      ctx.strokeStyle='#f4db73';ctx.lineWidth=1;
      for(const [px,py] of pins){ctx.beginPath();ctx.arc(x(px),y(py),3.5,0,Math.PI*2);ctx.stroke();}
    }
    ctx.restore();
  }
  function pick(event,plants) {
    const g=geometry(),rect=canvas.getBoundingClientRect();
    const x=left+(event.clientX-rect.left-g.x)*span/g.size,y=top-(event.clientY-rect.top-g.y)*span/g.size;
    let id=-1,best=(14*span/g.size)**2;
    plants?.forEach((p,i)=>{const d=(p.x-x)**2+(p.y-y)**2;if(d<best){best=d;id=i;}});
    return id;
  }
  return {draw,pick};
}
