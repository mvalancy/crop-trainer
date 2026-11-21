// Oblique botanical sketch of one generated specimen. The scan viewer handles
// sampled LiDAR returns; this view draws organ descriptions before occlusion.
import {growOrgans} from './index.js';
import {plantTraits} from './traits.js';

export function paintSpecimen(canvas, crop, forms, settings) {
  const ctx = canvas.getContext('2d');
  const traits = plantTraits(settings.seed, 1, forms, settings.form, settings.condition);
  const shapes = [];
  const azimuth=.66, pitch=.24, ca=Math.cos(azimuth), sa=Math.sin(azimuth);
  const project = (x,y,z) => [ca*x-sa*y, pitch*(sa*x+ca*y)-.97*z, sa*x+ca*y+.3*z];
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
    for(let k=0;k<=16;k++) {
      const t=k/16, wave=4*t*(1-t);
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
  growOrgans(crop,{...traits,x:0,y:0,z:0,radius:settings.radius,stem,leaf,ellipsoid},settings.canopy);
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  let xmin=0,xmax=0,ymin=0,ymax=0;
  for(const {points} of shapes) for(const [x,y] of points) {
    xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
  }
  const scale=Math.min((w-36)/Math.max(.01,xmax-xmin),(h-20)/Math.max(.01,ymax-ymin));
  ctx.save();ctx.translate((w-(xmax+xmin)*scale)/2,h-10-ymax*scale);ctx.scale(scale,scale);
  for(const {points,color} of shapes.sort((a,b)=>a.depth-b.depth)) {
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(const [x,y] of points) ctx.lineTo(x,y);
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  ctx.restore();
  return traits;
}
