import {enableViewerFullscreen} from './fullscreen.js';

// Frames are bounded display samples in plot coordinates (metres). Keep rendering
// off the optimizer's clock when several measurements arrive in one browser frame.
export function createLiveScene(host, {zoomControl=false}={}) {
  host.innerHTML = `<figcaption><strong></strong><span class="sceneMetric"></span></figcaption>
    <canvas role="img"></canvas><div class="sceneLoss" hidden><span>Training loss</span>
    <svg viewBox="0 0 160 24" preserveAspectRatio="none" aria-hidden="true"><polyline/></svg></div><div class="sceneFooter"><span class="sceneLegend"></span>
    <span class="sceneDetail"></span></div><div class="sceneTrack"><i></i></div>`;
  const canvas = host.querySelector('canvas'), ctx = canvas.getContext('2d');
  const title = host.querySelector('strong'), metric = host.querySelector('.sceneMetric');
  const detail = host.querySelector('.sceneDetail'), legend = host.querySelector('.sceneLegend');
  const track = host.querySelector('i'), lossBox = host.querySelector('.sceneLoss');
  const curve = lossBox.querySelector('polyline');
  let history = [], zoom = 1;
  if(zoomControl){
    const lens=document.createElement('button');
    lens.type='button';lens.className='sceneLens';lens.textContent='Close-up';
    lens.setAttribute('aria-pressed','false');
    lens.onclick=()=>{
      zoom=zoom===1?2.5:1;
      lens.setAttribute('aria-pressed',String(zoom>1));
      schedule();
    };
    host.append(lens);
  }
  // The generator's transient scan preview already sits inside its fullscreen viewer.
  const leaveFullscreen = zoomControl ? enableViewerFullscreen(host,'live scan') : null;
  let state = {}, pending = false;

  function paint() {
    pending = false;
    if (host.hidden || !ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    ctx.scale(dpr,dpr);
    const scale = zoom*Math.min(w/14.2,h/(state.flat ? 11.5 : 8.6));
    const originY = h*(state.flat ? .5 : .56);
    function px(x,y) {return w/2 + scale*(state.flat ? x-5 : .9*(x-5)-.42*(y-5));}
    function py(x,y,z=0) {return originY + scale*(state.flat ? y-5 : .26*(x-5)+.55*(y-5)-.95*z);}
    function line(x,y,a,b) {
      ctx.moveTo(px(x,y),py(x,y));ctx.lineTo(px(a,b),py(a,b));
    }
    const soil=ctx.createLinearGradient(0,0,w,h);
    soil.addColorStop(0,'#305541');soil.addColorStop(1,'#19352c');
    ctx.fillStyle=soil;ctx.beginPath();
    ctx.moveTo(px(0,0),py(0,0));
    for(const [x,y] of [[10,0],[10,10],[0,10]])ctx.lineTo(px(x,y),py(x,y));
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='#709380';ctx.lineWidth=1;ctx.stroke();
    ctx.strokeStyle='#3b6457';ctx.lineWidth=.65;ctx.beginPath();
    for(let i=0;i<=10;i++){line(i,0,i,10);line(0,i,10,i);}
    ctx.stroke();
    const cloud=state.cloud;
    if(cloud){
      const colors=['#52766b','#c6fc83','#79bf74','#c79d69','#ecba76','#bfaec5','#91c7cb'];
      for(let i=0;i<cloud.length;i+=4){
        const kind=cloud[i+3], size=kind===0 ? 1.05 : 1.85;
        ctx.fillStyle=colors[kind] || colors[6];
        ctx.fillRect(px(cloud[i],cloud[i+1]),py(cloud[i],cloud[i+1],cloud[i+2]),size*Math.sqrt(zoom),size*Math.sqrt(zoom));
      }
    }
    if(state.points){
      ctx.fillStyle='#648b7c';
      for(const [x,y] of state.points)ctx.fillRect(px(x,y),py(x,y),1.5,1.5);
    }
    function marks(points,color,cross){
      ctx.strokeStyle=color;ctx.lineWidth=1.25;ctx.beginPath();
      for(const [x,y] of points || []){
        const a=px(x,y),b=py(x,y),r=w<450?2.3:3;
        if(cross){ctx.moveTo(a-r,b-r);ctx.lineTo(a+r,b+r);ctx.moveTo(a-r,b+r);ctx.lineTo(a+r,b-r);}
        else{ctx.moveTo(a+r,b);ctx.arc(a,b,r,0,2*Math.PI);}
      }
      ctx.stroke();
    }
    marks(state.pins,'#ffd07c',false);marks(state.misses,'#fa99ac',true);
  }
  function schedule(){
    if (!pending && !host.hidden) {pending=true;requestAnimationFrame(paint);}
  }
  new ResizeObserver(schedule).observe(canvas);
  return {
    show(frame){
      host.hidden=false;state={...state,...frame};
      title.textContent=state.title;metric.textContent=state.metric;
      detail.textContent=state.detail;legend.textContent=state.legend;
      canvas.setAttribute('aria-label',[state.title,state.metric,state.legend,state.detail].filter(Boolean).join('. '));
      track.style.width=(100*Math.min(1,Math.max(0,state.fraction || 0)))+'%';
      if(frame.loss){
        history.push(frame.loss);
        if(history.length>96)history=history.filter((_,i)=>i%2===0);
        const max=Math.max(...history.map(p=>p.loss),.001), last=history.at(-1).epoch;
        curve.setAttribute('points',history.map(p=>[1+158*(p.epoch-1)/Math.max(1,last-1),23-22*p.loss/max].join(',')).join(' '));
        lossBox.hidden=false;
      }else if(frame.flat)lossBox.hidden=true;
      schedule();
    },
    reset(){leaveFullscreen?.();state={};history=[];lossBox.hidden=true;host.hidden=true;}
  };
}
