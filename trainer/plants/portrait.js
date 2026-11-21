// These two illustrations draw the generator's organs before the LiDAR samples them.
import {growOrgans} from './index.js?v=field-desk1';
import {plantTraits} from './traits.js';

export function specimenPair(crop, forms, settings) {
  function specimen(condition) {
    const traits = plantTraits(settings.seed, 1, forms, settings.form, condition);
    const organs = [];
    growOrgans(crop, {...traits, x:0, y:0, z:0, radius:settings.radius, plantArchitecture:settings.plantArchitecture,
      stem(...args) { organs.push(['stem', args]); },
      leaf(...args) { organs.push(['leaf', args]); },
      ellipsoid(...args) { organs.push(['ellipsoid', args]); }
    }, settings.canopy);
    return {form:traits.form, organs};
  }
  const intact = specimen('healthy'), damaged = specimen('damaged');
  return {crop, form:intact.form, intact:intact.organs, damaged:damaged.organs};
}

function projectOrgans(crop, organs, degrees) {
  const shapes = [];
  const azimuth = degrees * Math.PI / 180;
  const elevation = ['apple','grapevine','high-wire-tomato'].includes(crop) ? .26 : .63;
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const ce = Math.cos(elevation), se = Math.sin(elevation);
  const project = (x,y,z) => [ca*x-sa*y, se*(sa*x+ca*y)-ce*z, ce*(sa*x+ca*y)+se*z];
  function polygon(points, color) {
    shapes.push({points,color,depth:points.reduce((sum,p)=>sum+p[2],0)/points.length});
  }
  function stem(ax,ay,az,bx,by,bz,base,tip) {
    const a=project(ax,ay,az), b=project(bx,by,bz), length=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    const ex=(a[1]-b[1])/length, ey=(b[0]-a[0])/length;
    polygon([[a[0]+ex*base,a[1]+ey*base,a[2]],[b[0]+ex*tip,b[1]+ey*tip,b[2]],
      [b[0]-ex*tip,b[1]-ey*tip,b[2]],[a[0]-ex*base,a[1]-ey*base,a[2]]],
      ['apple','grapevine'].includes(crop)?'#785333':'#747f3c');
  }
  function leaf(ax,ay,az,bx,by,bz,width,arch=0,lobes=0) {
    const dx=bx-ax,dy=by-ay,span=Math.hypot(dx,dy)||1, ex=-dy/span,ey=dx/span;
    const left=[],right=[],rib=[];
    const steps=Math.max(16,8*lobes);
    for(let k=0;k<=steps;k++) {
      const t=k/steps, wave=4*t*(1-t);
      const w=width*Math.sin(Math.PI*t)**.72*(1-.27*Math.sin(lobes*Math.PI*t)**2);
      const x=ax+t*dx,y=ay+t*dy,z=az+t*(bz-az)+arch*wave;
      left.push(project(x+w*ex,y+w*ey,z+.12*width*wave));
      right.push(project(x-w*ex,y-w*ey,z+.12*width*wave));rib.push(project(x,y,z));
    }
    polygon(left.concat(rib.slice().reverse()),'#5e944d');
    polygon(right.concat(rib.slice().reverse()),'#8bb567');
  }
  function ellipsoid(x,y,z,rx,ry,rz,rotation=0) {
    // Project the three rotated semi-axes to find the ellipse on the page.
    const c=Math.cos(rotation),s=Math.sin(rotation);
    const axes=[project(rx*c,rx*s,0),project(-ry*s,ry*c,0),project(0,0,rz)];
    const xx=axes.reduce((n,a)=>n+a[0]*a[0],0),xy=axes.reduce((n,a)=>n+a[0]*a[1],0);
    const yy=axes.reduce((n,a)=>n+a[1]*a[1],0),angle=.5*Math.atan2(2*xy,xx-yy);
    const difference=Math.hypot(xx-yy,2*xy), major=Math.sqrt((xx+yy+difference)/2),minor=Math.sqrt(Math.max(0,(xx+yy-difference)/2));
    const center=project(x,y,z),points=[];
    for(let i=0;i<16;i++) {
      const u=major*Math.cos(i*Math.PI/8),v=minor*Math.sin(i*Math.PI/8);
      points.push([center[0]+u*Math.cos(angle)-v*Math.sin(angle),center[1]+u*Math.sin(angle)+v*Math.cos(angle),center[2]]);
    }
    const color = crop==='grapevine'?'#665070':crop==='high-wire-tomato'?'#c97845':'#71a45c';
    polygon(points,color);
  }
  const projectors = {stem,leaf,ellipsoid};
  for (const [type,args] of organs) projectors[type](...args);
  return shapes.sort((a,b) => a.depth - b.depth);
}

// The same camera fits both specimens, including any branches lost to damage.
function frame(shapes, width, height) {
  let xmin=0, xmax=0, ymin=0, ymax=0;
  for (const shape of shapes) for (const [x,y] of shape.points) {
    xmin=Math.min(xmin,x); xmax=Math.max(xmax,x);
    ymin=Math.min(ymin,y); ymax=Math.max(ymax,y);
  }
  const scale=Math.min(.88*width/Math.max(.01,xmax-xmin),.88*height/Math.max(.01,ymax-ymin));
  return {scale,x:(width-(xmax+xmin)*scale)/2,y:(height-(ymax+ymin)*scale)/2};
}

function paint(ctx, shapes, camera) {
  ctx.save();
  ctx.translate(camera.x,camera.y);
  ctx.scale(camera.scale,camera.scale);
  for (const {points,color} of shapes) {
    ctx.beginPath();
    ctx.moveTo(points[0][0],points[0][1]);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
  }
  ctx.restore();
}

// Locate the projected material lost from this angle. A small scratch image
// keeps rotation cheap even with a close-up on a touch device.
function damageFrame(mask, healthy, broken, camera, width, height) {
  const w=mask.canvas.width, h=mask.canvas.height, ratio=w/width;
  const small={x:camera.x*ratio,y:camera.y*ratio,scale:camera.scale*ratio};
  mask.clearRect(0,0,w,h);
  paint(mask,healthy,small);
  mask.save();
  mask.globalCompositeOperation='destination-out';
  paint(mask,broken,small);
  mask.restore();
  const pixels=mask.getImageData(0,0,w,h).data;
  let xmin=w,xmax=-1,ymin=h,ymax=-1;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    // Ignore the blended edge left by drawing an identical antialiased path twice.
    if (pixels[(y*w+x)*4+3]<100) continue;
    xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);
    ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
  }
  if (xmax<xmin) return camera;
  const zoom=Math.min(4,.76*w/(xmax-xmin+1),.76*h/(ymax-ymin+1));
  if (zoom<=1) return camera;
  return {scale:camera.scale*zoom,
    x:width/2+(camera.x-(xmin+xmax+1)/2/ratio)*zoom,
    y:height/2+(camera.y-(ymin+ymax+1)/2/ratio)*zoom};
}

export function compareSpecimens(intactCanvas, damagedCanvas) {
  const intact = intactCanvas.getContext('2d'), damaged = damagedCanvas.getContext('2d');
  const patternTile=document.createElement('canvas');
  patternTile.width=patternTile.height=14;
  const pen=patternTile.getContext('2d');
  pen.fillStyle='#f7dfb1';
  pen.fillRect(0,0,14,14);
  pen.strokeStyle='#9c582a';
  pen.lineWidth=3;
  pen.beginPath();
  pen.moveTo(-1,1); pen.lineTo(1,-1);
  pen.moveTo(-1,15); pen.lineTo(15,-1);
  pen.moveTo(13,15); pen.lineTo(15,13);
  pen.stroke();
  const hatch=damaged.createPattern(patternTile,'repeat');
  const maskCanvas=document.createElement('canvas');
  maskCanvas.width=120;
  maskCanvas.height=Math.ceil(120*intactCanvas.height/intactCanvas.width);
  const mask=maskCanvas.getContext('2d',{willReadFrequently:true});
  return (pair, degrees, markGaps, zoom) => {
    const healthyShapes=projectOrgans(pair.crop,pair.intact,degrees);
    const brokenShapes=projectOrgans(pair.crop,pair.damaged,degrees);
    const {width,height}=intactCanvas;
    let camera=frame([...healthyShapes,...brokenShapes],width,height);
    if (zoom) camera=damageFrame(mask,healthyShapes,brokenShapes,camera,width,height);
    intact.clearRect(0,0,width,height);
    damaged.clearRect(0,0,width,height);
    paint(intact,healthyShapes,camera);
    if (markGaps) {
      // Retain only the intact silhouette. Painting the surviving plant over
      // it leaves hatching precisely where geometry is missing at this angle.
      damaged.drawImage(intactCanvas,0,0);
      damaged.save();
      damaged.globalCompositeOperation='source-in';
      damaged.fillStyle=hatch;
      damaged.fillRect(0,0,width,height);
      damaged.restore();
    }
    paint(damaged,brokenShapes,camera);
  };
}
