const inset=12;
const measured={returns:p=>p.returns>0,peaks:p=>p.peak,pins:p=>p.height,sampledPins:p=>p.sampledHeight,orchard:p=>p.orchard};
const pinLists={pins:'heightPins',sampledPins:'sampledHeightPins',orchard:'orchardPins'};

export function reached(plant,metric) {return measured[metric](plant);}

export function studyMap(canvas) {
  const ctx=canvas.getContext('2d');
  function geometry(){
    const width=canvas.clientWidth||280, height=canvas.clientHeight||200;
    const size=Math.min(width-2*inset,height-2*inset);
    return {width,height,size,x:(width-size)/2,y:(height-size)/2};
  }
  function draw({cloud,result,metric='returns',selected=-1}={}) {
    const g=geometry(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
    canvas.width=Math.round(g.width*dpr);canvas.height=Math.round(g.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#142f28';ctx.fillRect(0,0,g.width,g.height);
    const x=m=>g.x+m*g.size/10,y=m=>g.y+(10-m)*g.size/10;
    ctx.strokeStyle='#335344';ctx.lineWidth=1;
    for(let n=0;n<=10;n+=2) {
      ctx.beginPath();ctx.moveTo(x(0),y(n));ctx.lineTo(x(10),y(n));ctx.moveTo(x(n),y(0));ctx.lineTo(x(n),y(10));ctx.stroke();
    }
    if(cloud) {
      for(let i=0;i<cloud.length;i+=4) {
        ctx.fillStyle=cloud[i+3]===1?'#94b988':'#456452';ctx.fillRect(x(cloud[i]),y(cloud[i+1]),1.3,1.3);
      }
    }
    if(!result)return;
    for(const [i,p] of result.plants.entries()){
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
        ctx.arc(cx,cy,5.5,0,Math.PI*2);ctx.stroke();
      }
    }
    const pins=result[pinLists[metric]];
    if(pins){
      ctx.strokeStyle='#f4db73';ctx.lineWidth=1;
      for(const [px,py] of pins){ctx.beginPath();ctx.arc(x(px),y(py),3.5,0,2*Math.PI);ctx.stroke();}
    }
  }
  function pick(event,plants) {
    const g=geometry(),rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left-g.x)*10/g.size,y=10-(event.clientY-rect.top-g.y)*10/g.size;
    let id=-1,best=(14*10/g.size)**2;
    plants?.forEach((p,i)=>{const d=(p.x-x)**2+(p.y-y)**2;if(d<best){best=d;id=i;}});
    return id;
  }
  return {draw,pick};
}
