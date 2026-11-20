// An orthographic orbit camera for a 10 × 10 m plot. Points retain their XYZ
// coordinates. Camera controls affect only the drawing, never exported data.
export function createViewer(canvas, controls) {
  const context = canvas.getContext('2d');
  const pointers = new Map();
  let panX, panY, yaw, pitch, zoom, scan, projected = [], order = [], sorted = false;
  const fieldCenter = [5, 5, 0];
  let pivot = fieldCenter, elevationScale = 80;
  let frame = 0, spinning = false, previousTime = 0;
  const colors = ['#667d70', '#badf74', '#58ae81', '#ca9763', '#f1b674', '#acbce0', '#86b8dc'];
  const elevation = Array.from({length:64}, (_, i) => 'hsl('+(175-i*1.65)+' 53% '+(34+i*.48)+'%)');
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  function fit(view = 'oblique') {
    yaw = view === 'oblique' ? -.62 : 0;
    pitch = view === 'top' ? Math.PI/2 : view === 'side' ? .08 : .72;
    pivot = fieldCenter;
    zoom = 1; panX = 0; panY = 0; sorted = false; schedule();
  }
  function orbit(dx, dy) {
    controls.view.value = 'custom';
    yaw += dx * .009; pitch = clamp(pitch + dy * .008, .025, Math.PI/2);
    sorted = false; schedule();
  }
  function magnify(factor, px = 0, py = 0) {
    const next = clamp(zoom * factor, .3, 12);
    panX = px + (panX-px)*next/zoom; panY = py + (panY-py)*next/zoom;
    zoom = next; schedule();
  }
  function draw(time) {
    frame = 0;
    if (!scan) return;
    if (spinning && previousTime) { yaw += Math.min(time-previousTime,80)*.00025; sorted=false; }
    previousTime=time;
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(!w||!h)return;
    const ratio=Math.min(devicePixelRatio || 1,2);
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){
      canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    }
    context.setTransform(ratio,0,0,ratio,0,0);
    context.fillStyle='#142e27';context.fillRect(0,0,w,h);
    const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const scale=Math.min(w/15,h/12)*zoom, ox=w/2+panX, oy=h/2+panY;
    function project(x,y,z){
      x -= pivot[0]; y -= pivot[1]; z -= pivot[2];
      const across=c*x-s*y, along=s*x+c*y;
      return [across,along*sp-z*cp,along*cp+z*sp];
    }
    context.strokeStyle='#315044';context.lineWidth=1;
    for(let k=0;k<=10;k++){
      for(const [a,b] of [[[k,0,0],[k,10,0]],[[0,k,0],[10,k,0]]]){
        const p=project(...a),q=project(...b);
        context.beginPath();context.moveTo(ox+p[0]*scale,oy+p[1]*scale);
        context.lineTo(ox+q[0]*scale,oy+q[1]*scale);context.stroke();
      }
    }
    const size=clamp(scale*.043,1.25,5);
    if(!sorted){
      for(let i=0;i<order.length;i++){
        const j=3*i,[px,py,depth]=project(scan.xyz[j],scan.xyz[j+1],scan.xyz[j+2]);
        projected[j]=px;projected[j+1]=py;projected[j+2]=depth;
      }
      // Equal-depth returns keep their acquisition order when a view is revisited.
      order.sort((a,b)=>projected[3*a+2]-projected[3*b+2] || a-b);
      sorted=true;
    }
    for(const i of order){
      const j=i*3;
      context.fillStyle=controls.color.value==='class'?colors[scan.cls[i]]:elevation[clamp(Math.round(scan.xyz[j+2]*elevationScale),0,63)];
      context.fillRect(ox+projected[j]*scale,oy+projected[j+1]*scale,size,size);
    }
    if(controls.pins.checked){
      context.lineWidth=1.5;
      for(const [index, {min,max}] of scan.labels.boxes.entries()){
        const xy = scan.labels.boxes[index].base_xy_m ?? [(min[0]+max[0])/2,(min[1]+max[1])/2];
        const [px,py]=project(...xy,max[2]);
        const x = ox+px*scale, y = oy+py*scale, radius = clamp(scale*.07,2,6);
        context.beginPath();
        if (scan.plantReturns[index] === 0) {
          context.strokeStyle = '#ffdd75';
          context.moveTo(x-radius, y-radius); context.lineTo(x+radius, y+radius);
          context.moveTo(x-radius, y+radius); context.lineTo(x+radius, y-radius);
        } else {
          context.strokeStyle = '#ff8769';
          context.arc(x, y, radius, 0, 2*Math.PI);
        }
        context.stroke();
      }
    }
    if (controls.highlight.value !== '') {
      const {min,max} = scan.labels.boxes[Number(controls.highlight.value)];
      const xy = scan.labels.boxes[Number(controls.highlight.value)].base_xy_m ?? [(min[0]+max[0])/2,(min[1]+max[1])/2];
      const [px,py] = project(...xy,max[2]);
      const x = ox+px*scale, y = oy+py*scale;
      context.strokeStyle = '#9ffaff';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(x, y, clamp(scale*.11, 8, 15), 0, 2*Math.PI);
      context.stroke();
    }
    if(spinning)schedule();
  }
  function focusPlant() {
    if (!scan || controls.highlight.value === '') return;
    const {min, max} = scan.labels.boxes[Number(controls.highlight.value)];
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    spin(false);
    controls.view.value = 'custom';
    pivot = [(min[0]+max[0])/2, (min[1]+max[1])/2, max[2]];
    const diameter = Math.hypot(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
    zoom = clamp(.35*Math.min(w,h) / (diameter*Math.min(w/15,h/12)), 1, 12);
    panX = 0; panY = 0; sorted = false; schedule();
  }
  function spin(on){
    if (on) controls.view.value='custom';
    spinning=on;previousTime=0;controls.spin.textContent=on?'Pause spin':'Auto spin';
    controls.spin.setAttribute('aria-pressed',String(on));schedule();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1&&e.button!==2)return;
    spin(false);canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button!==0||controls.mode.value==='pan'});
  });
  canvas.addEventListener('pointermove',e=>{
    const old=pointers.get(e.pointerId);if(!old)return;
    const dx=e.clientX-old.x,dy=e.clientY-old.y;
    const other=[...pointers].find(([id])=>id!==e.pointerId)?.[1];
    if(other){
      const a=Math.hypot(old.x-other.x,old.y-other.y),b=Math.hypot(e.clientX-other.x,e.clientY-other.y);
      const rect=canvas.getBoundingClientRect();
      if(a>2&&b>2)magnify(b/a,(old.x+other.x)/2-rect.left-rect.width/2,(old.y+other.y)/2-rect.top-rect.height/2);
      panX+=dx/2;panY+=dy/2;schedule();
    }else if(old.pan||e.shiftKey){panX+=dx;panY+=dy;schedule();}
    else orbit(dx,dy);
    old.x=e.clientX;old.y=e.clientY;
  });
  for(const name of ['lostpointercapture','pointercancel','pointerup'])canvas.addEventListener(name,e=>pointers.delete(e.pointerId));
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();const box=canvas.getBoundingClientRect();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?box.height:1);
    magnify(Math.exp(-clamp(delta,-400,400)*.0015),e.clientX-box.left-box.width/2,e.clientY-box.top-box.height/2);
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    const arrows={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};
    if(arrows[e.key]){const [dx,dy]=arrows[e.key];if(e.shiftKey){panX+=dx;panY+=dy;schedule();}else orbit(dx,dy);}
    else if(['+','='].includes(e.key))magnify(1.2);
    else if(e.key==='-')magnify(1/1.2);
    else if(e.key.toLowerCase()==='r')reset();
    else if(e.key.toLowerCase()==='f' && controls.highlight.value!=='')focusPlant();
    else return;
    e.preventDefault();
  });
  const reset=()=>{spin(false);controls.view.value='oblique';fit();};
  canvas.addEventListener('dblclick',reset);
  controls.focus.onclick=focusPlant;
  controls.reset.onclick=reset;controls.zoomIn.onclick=()=>magnify(1.3);controls.zoomOut.onclick=()=>magnify(1/1.3);
  controls.spin.onclick=()=>spin(!spinning);controls.view.onchange=()=>{spin(false);fit(controls.view.value);};
  controls.highlight.onchange=controls.pins.onchange=controls.color.onchange=schedule;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)spin(false);});
  new ResizeObserver(schedule).observe(canvas);
  fit();
  return {
    setScan(value) {
      const newPlanting = scan && (scan.p.seed !== value.p.seed || scan.p.crop !== value.p.crop);
      if (newPlanting && pivot !== fieldCenter) reset();
      scan = value;
      elevationScale = value.labels.growing_system ? 63 / Math.max(.8,...value.labels.boxes.map(b=>b.max[2])) : 80;
      projected = new Float32Array(scan.xyz.length);
      order = Uint32Array.from({length:scan.cls.length}, (_, i) => i);
      sorted = false;
      schedule();
    }
  };
}
