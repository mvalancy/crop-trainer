const inset=12;
const measured={returns:p=>p.returns>0,peaks:p=>p.peak,pins:p=>p.height,sampledPins:p=>p.sampledHeight,orchard:p=>p.orchard};
const pinLists={pins:'heightPins',sampledPins:'sampledHeightPins',orchard:'orchardPins'};

export function reached(plant,metric) {return measured[metric](plant);}

export function studyMap(canvas) {
  const ctx=canvas.getContext('2d');
  let span=10,left=0,top=10;
  function geometry(){
    const width=canvas.clientWidth||280, height=canvas.clientHeight||200;
    const size=Math.min(width-2*inset,height-2*inset);
    return {width,height,size,x:(width-size)/2,y:(height-size)/2};
  }
  function draw({cloud,result,metric='returns',selected=-1,focused=false}={}) {
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
