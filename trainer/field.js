import {layoutDimensions, MAX_SCAN_RAYS} from './sensors.js?v=dense1';
import {cropProfile, bladeWidth, bladeHeight} from './crops.js?v=systems1';
import {canopyPlant,scanFixtures} from './growing-systems.js';
import {formsFor,checkPlantForm,checkPlantCondition} from './plants/forms.js';
import {plantTraits, seededRandom} from './plants/traits.js';
import {structuredPlant} from './plants/index.js';
import {checkPlantArchitecture} from './plant-version.js';
export function returnBand(count) {
 if (count === 0) return 'zero';
 return count < 5 ? 'oneToFour' : 'fiveOrMore';
}

// One actual return from each index interval. Sampling never consumes the field RNG.
export function sampleCloud(xyz, classes, ground = true) {
 const bins = Math.min(classes.length, 9000), sample = new Float32Array(bins * 4);
 let used = 0;
 for (let bin = 0; bin < bins; bin++) {
  const first = Math.floor(bin * classes.length / bins);
  const end = Math.floor((bin + 1) * classes.length / bins);
  const i = first + (Math.imul(bin + 1, 2654435761) >>> 0) % (end - first);
  if (!ground && classes[i] === 0) continue;
  sample[used++] = xyz[3*i]; sample[used++] = xyz[3*i+1];
  sample[used++] = xyz[3*i+2]; sample[used++] = classes[i];
 }
 return sample.subarray(0, used);
}

export function field(p,onRow){
const crop = p.crop ?? 'lettuce';
const profile = cropProfile(crop);
const structured = checkPlantArchitecture(p.plantArchitecture ?? 1) === 2;
const form = structured ? checkPlantForm(crop,p.plantForm) : undefined;
const condition = structured ? checkPlantCondition(p.plantCondition) : undefined;
const forms = structured ? formsFor(crop) : [];
if (!structured && ((p.plantForm && p.plantForm !== 'mixed') || (p.plantCondition && p.plantCondition !== 'healthy'))) {
  throw Error('Plant forms and damage require structured plants.');
}
if (p.appleCanopy != null && (crop !== 'apple' || !structured || !['leafy','dormant'].includes(p.appleCanopy))) {
  throw Error('Choose leafy or dormant foliage for a structured apple orchard.');
}
let seed=p.seed>>>0; const rng=seededRandom;
let r=rng(seed),o=rng(seed^54321),s=rng(seed^737373), sensor=p.sampling;
const dimensions=layoutDimensions(sensor), active=dimensions!==null, [nx,ny]=dimensions ?? [0,0];
if(!Number.isSafeInteger(p.points) || p.points<1 || p.points>MAX_SCAN_RAYS) throw Error('Choose a ray budget from 1 to 1,000,000.');
let n=active?Math.min(p.points,nx*ny):p.points, g=Math.ceil(Math.sqrt(n)), xyz=new Float32Array(n*3), cls=new Uint8Array(n), ids=new Uint16Array(n), boxes=[],centers=[],tau=2*Math.PI,sz=10;
const parts = structured ? new Uint8Array(n) : null;
const skeleton = structured ? [] : null;
let terrain=profile.system==='greenhouse'?()=>0:(x,y)=>.016*Math.sin(1.3*x+.4*y)+.016*Math.sin(1.7*y)+.004*x+.005*Math.cos(12*y);
let at=new Int32Array(g*g).fill(-1), next=active?new Int32Array(n):null, noise=new Float32Array(n);
if(!active){
 const cells=new Uint32Array(g*g);
 for(let i=0;i<cells.length;i++)cells[i]=i;
 for(let j=0;j<n;j++){let k=j+Math.floor(s()*(cells.length-j));[cells[j],cells[k]]=[cells[k],cells[j]]}
 for(let i=0;i<n;i++){let c=cells[i],x=((c%g)+s())*sz/g,y=((c/g|0)+s())*sz/g;at[c]=i;xyz.set([x,y,terrain(x,y)+(s()+s()-1)*.012],3*i);noise[i]=(s()+s()-1)*.004}
}else{
 const phase=s()*tau, qx=s(),qy=s(), max=nx*ny, frac=x=>x-Math.floor(x), clip=x=>Math.max(0,Math.min(9.99999,x));
 for(let i=0;i<n;i++){
  let x,y,t=((i+.5)*max/n)|0,j=t%nx,k=t/nx|0,a=tau*j/nx+phase+(k%2)*Math.PI/nx;
  if(sensor.pattern==='lines'){x=(j+.5+.17*(s()-.5)+.25*(k%2))*sz/nx;y=(k+.5+.10*(s()-.5))*sz/ny}
  else if(sensor.pattern==='rings'){let rr=(k+.5)*sz/ny/2*(sensor.key==='tight-rings'?.83:1);let c=Math.cos(a),h=Math.sin(a),scale=Math.max(Math.abs(c),Math.abs(h))**.55;x=sz/2+rr*c/scale;y=sz/2+rr*h/scale}
  else{let u=frac(qx+i*.7548776662466927),v=frac(qy+i*.5698402909980532),anis=Math.max(-1,Math.min(1,Math.log(nx/ny)));x=sz*frac(u+(.06+.035*anis)*Math.sin(tau*(3*v+qx)));y=sz*frac(v+(.06-.035*anis)*Math.sin(tau*(2*u+qy)))}
  x=clip(x);y=clip(y); xyz.set([x,y,terrain(x,y)+(s()+s()-1)*.012],3*i);noise[i]=(s()+s()-1)*.004;
  let c=(y*g/sz|0)*g+(x*g/sz|0);next[i]=at[c];at[c]=i;
 }
}
function rays(cx,cy,R,fn){for(let y=Math.max(0,(cy-R)*g/sz|0);y<=Math.min(g-1,(cy+R)*g/sz|0);y++)for(let x=Math.max(0,(cx-R)*g/sz|0);x<=Math.min(g-1,(cx+R)*g/sz|0);x++)for(let i=at[y*g+x];i>=0;i=next?next[i]:-1)fn(i,xyz[3*i]-cx,xyz[3*i+1]-cy)}
function hit(i,h,c,id,part=0){if(h>xyz[3*i+2]){xyz[3*i+2]=h;cls[i]=c;ids[i]=id;if(parts)parts[i]=part}}
function plant(x,y,R,weed){
if(structured && !weed){
  const id=boxes.length+1;
  const traits=plantTraits(seed,id,forms,form,condition);
  const box=structuredPlant(crop,{...traits,x,y,soil:terrain(x,y),radius:R,rays,skeleton,
    canopy:p.appleCanopy,write:(i,h,part)=>hit(i,h,1,id,part)});
  box.plant_form=traits.form;
  box.plant_condition=traits.damaged?'damaged':'healthy';
  if(profile.system)box.base_xy_m=[x,y];
  boxes.push(box);centers.push([x,y]);return;
}
if(profile.system && !weed){
  boxes.push(canopyPlant(crop,x,y,R,terrain(x,y),r,rays,hit,boxes.length+1));
  centers.push([x,y]);return;
}
let random=weed?o:r,phase=random()*tau,base=terrain(x,y),id=weed?0:boxes.length+1,L=[],aabb=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];const shaped = !weed && crop !== 'lettuce';
function sample(a,u){
if(shaped) return [bladeWidth(crop,u,a.ang), .08*Math.sin(a.ang)*u*u];
let sin=Math.sin(Math.PI*u),w=(weed?.14:.39)*Math.pow(Math.max(0,sin),.72)*(1+.10*Math.sin(17*u+a.ang)),bend=.13*Math.sin(a.ang)*u*u;return [w,bend]}
function height(a,u,v){
if(shaped) return base + bladeHeight(crop,R,a.f,u,v);
return base+R*(.04+.38*a.f+(.50+.42*a.f)*Math.sin(Math.PI*u*.82)+(.12+.035*Math.cos(16*u+a.ang))*v*v)}
for(let j=0,m=weed?8:profile.leafCount;j<m;j++){let f=j/(m-1),ang=phase+j*2.39996+(random()-.5)*.25,a={ang,f,len:R*(1-.65*f)*(.90+.20*random()),c:Math.cos(ang),s:Math.sin(ang)};L.push(a);if(!weed)for(let k=0;k<=24;k++){let u=k/24,[w,b]=sample(a,u);for(let v of [-1,0,1]){let vx=a.len*u,vy=a.len*(b+v*w),px=x+a.c*vx-a.s*vy,py=y+a.s*vx+a.c*vy,h=height(a,u,v);for(let [j,vv] of [[0,px],[1,py],[2,h]]){aabb[j]=Math.min(aabb[j],vv);aabb[j+3]=Math.max(aabb[j+3],vv)}}}}
if (shaped) {
  // A raised terminal bud sits above the artichoke rosette. The young tomato
  // model has a slim upright growing tip above its compound leaves.
  const artichoke = crop === 'artichoke';
  const capRadius = R * (artichoke ? .21 : .055);
  const shoulder = R * (artichoke ? 1.15 : 1.4);
  const rise = R * (artichoke ? .32 : .08);
  aabb[5] = Math.max(aabb[5], base + shoulder + rise);
  rays(x,y,capRadius,(i,dx,dy)=>{
    const radial = (dx*dx+dy*dy)/(capRadius*capRadius);
    if(radial <= 1) hit(i,base+shoulder+rise*Math.sqrt(1-radial),1,id);
  });
}
if(!weed){boxes.push({min:aabb.slice(0,3).map(v=>v-.002),max:aabb.slice(3).map(v=>v+.002)});centers.push([x,y])}
rays(x,y,R*1.2,(i,dx,dy)=>{for(let a of L){let u=(dx*a.c+dy*a.s)/a.len;if(u<=0||u>=1)continue;let [w,b]=sample(a,u),v=((-dx*a.s+dy*a.c)/a.len-b)/w;if(Math.abs(v)<=1)hit(i,height(a,u,v),weed?2:1,id)}})}
for(let j=0;j<profile.rows;j++){let y=crop==='lettuce'?1.5+(j>>1)*2.1+(j%2)*.36:(j+.5)*sz/profile.rows,ph=r()*tau;
const edge = crop==='lettuce' ? .25 : p.radius*1.45;
for(let x=edge+r()*.12;x<(crop==='lettuce'?9.74:sz-edge);x+=p.spacing){if(r()<.05)continue;plant(x+(r()-.5)*.04,y+.035*Math.sin(x+ph)+(r()-.5)*.024,p.radius*(.8+.4*r()),false)}
 if (onRow) onRow({cloud:sampleCloud(xyz,cls,p.ground),row:j+1,rows:profile.rows});
}
let before=cls.slice();
if(profile.fixtures && p.infrastructure!==false) scanFixtures(crop,profile.rows,terrain,rays,hit);
if(p.weeds)for(let j=0;j<64;j++)plant(.2+o()*9.6,.2+o()*9.6,.08+.13*o(),true);
if(p.sticks)for(let j=0;j<30;j++){let x=o()*10,y=o()*10,a=o()*tau,c=Math.cos(a),s=Math.sin(a),l=.15+.30*o(),w=.012+.018*o();rays(x,y,l+w,(i,dx,dy)=>{let u=c*dx+s*dy,v=-s*dx+c*dy;if(Math.abs(u)<l&&Math.abs(v)<w)hit(i,terrain(x+dx,y+dy)+w+Math.sqrt(w*w-v*v),3,0)})}
if(p.boards && centers.length)for(let j=0;j<9;j++){let [x,y]=centers[Math.floor(o()*centers.length)],a=o()*tau,c=Math.cos(a),s=Math.sin(a),l=.28+.30*o(),w=.09+.1*o();rays(x,y,l+w,(i,dx,dy)=>{let u=c*dx+s*dy,v=-s*dx+c*dy;if(Math.abs(u)<l&&Math.abs(v)<w)hit(i,terrain(x,y)+.34+.025*u,4,0)})}
let lost=0,counts=Array(profile.system?7:5).fill(0);for(let i=0;i<n;i++){lost+=before[i]===1&&cls[i]!==1;counts[cls[i]]++;xyz[3*i+2]+=noise[i]}let outXYZ=xyz,outCls=cls,outIds=ids,outParts=parts, outputN=n;
let q=p.scanNoise, noiseActive=q&&['xy','z','density','gaps','stray','cluster'].some(k=>q[k]>0);
if(noiseActive){
 const base=q.seed>>>0, stream=(salt)=>rng(base^salt), xy=stream(0x948765bc), zz=stream(0x35f620e4), den=stream(0x7caaf129), gap=stream(0xb910cd71), stray=stream(0xdab3a018);
 const cluster=stream(0x1f035610);
 const norm=(r)=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(tau*r()), clip=(x)=>Math.min(9.99999,Math.max(0,x)), outliers=Math.round(n*q.stray/100);
 const ds=[den()*tau,den()*tau], centersGap=Array.from({length:4},()=>[gap()*sz,gap()*sz]), stripAt=1+8*gap(), stripAngle=gap()*tau, stripWave=gap()*tau, gc=Math.cos(stripAngle), gs=Math.sin(stripAngle), gapFraction=q.gaps/100, stripW=gapFraction*1.35, gapRadius=Math.sqrt(gapFraction*sz*sz*.72/(centersGap.length*Math.PI));
 outXYZ=new Float32Array((n+outliers)*3);outCls=new Uint8Array(n+outliers);outIds=new Uint16Array(n+outliers);if(parts)outParts=new Uint8Array(n+outliers);outputN=0;counts=Array(profile.system?7:6).fill(0);
 for(let i=0;i<n;i++){
   const x=xyz[i*3],y=xyz[i*3+1],z=xyz[i*3+2], coarse=(1+Math.sin(.76*x+.51*y+ds[0])*Math.sin(.39*x-.84*y+ds[1]))/2;
   const dx=q.xy?norm(xy)*q.xy/100:0,dy=q.xy?norm(xy)*q.xy/100:0,dz=q.z?norm(zz)*q.z/100:0;
   if(q.density&&den()<q.density/100*coarse*coarse)continue;
   if(q.gaps&&(Math.abs(gc*(x-5)+gs*(y-5)+5-stripAt+.25*Math.sin(y*2+stripWave))<stripW || centersGap.some(([a,b])=>(x-a)**2+(y-b)**2<gapRadius**2)))continue;
   const v=3*outputN++;
   outXYZ[v]=q.xy?clip(x+dx):x;
   outXYZ[v+1]=q.xy?clip(y+dy):y;
   outXYZ[v+2]=q.z?z+dz:z;
   if(parts)outParts[outputN-1]=parts[i];
   outIds[outputN-1]=ids[i];outCls[outputN-1]=cls[i];counts[cls[i]]++;
 }
 if(q.cluster&&outputN>1){
   const index=Uint32Array.from({length:outputN},(_,i)=>i), moved=Math.min(outputN-1,Math.round(outputN*q.cluster/100));
   for(let j=0;j<moved;j++){const k=j+Math.floor(cluster()*(outputN-j)),v=index[j];index[j]=index[k];index[k]=v}
   for(let j=0;j<moved;j++){
     const to=index[j],from=index[moved+Math.floor(cluster()*(outputN-moved))],a=cluster()*tau,rad=.0015+.0045*Math.sqrt(cluster());
     outXYZ[to*3]=clip(outXYZ[from*3]+Math.cos(a)*rad);
     outXYZ[to*3+1]=clip(outXYZ[from*3+1]+Math.sin(a)*rad);
     outXYZ[to*3+2]=outXYZ[from*3+2]+.002*(2*cluster()-1);
     outIds[to]=outIds[from];if(parts)outParts[to]=outParts[from];
     counts[outCls[to]]--;outCls[to]=outCls[from];counts[outCls[to]]++;
   }
 }
 for(let i=0;i<outliers&&outputN<MAX_SCAN_RAYS;i++){
   const x=stray()*sz,y=stray()*sz,offset=(.12+.68*stray())*(stray()<.18?-1:1);
   outXYZ.set([x,y,terrain(x,y)+offset],3*outputN);outCls[outputN++]=5;counts[5]++;
 }
 outXYZ=outXYZ.slice(0,outputN*3);outCls=outCls.slice(0,outputN);if(parts)outParts=outParts.slice(0,outputN);
}
// Positive IDs follow the originating plant through dropout and clustered copies.
const plantReturns = Array(boxes.length).fill(0);
for (let i = 0; i < outputN; i++) {
  if (outIds[i]) plantReturns[outIds[i] - 1]++;
}
const coverage = {zero: 0, oneToFour: 0, fiveOrMore: 0};
for (const count of plantReturns) {
  coverage[returnBand(count)]++;
}
let groundRemoved=0;
if(p.ground===false){
 let keep=0;
 for(let i=0;i<outputN;i++){
   if(outCls[i]===0){groundRemoved++;continue;}
   const src=3*i,dst=3*keep;
   outXYZ[dst]=outXYZ[src];outXYZ[dst+1]=outXYZ[src+1];outXYZ[dst+2]=outXYZ[src+2];
   if(parts)outParts[keep]=outParts[i];
   outCls[keep++]=outCls[i];
 }
 outputN=keep;outXYZ=outXYZ.slice(0,3*keep);outCls=outCls.slice(0,keep);if(parts)outParts=outParts.slice(0,keep);counts[0]=0;
}
let canonical=JSON.stringify(['crop-trainer-v1',...(structured?['plant-architecture-v2',crop,form,condition,...(crop==='apple'?[p.appleCanopy??'leafy']:[])]:[]),...(profile.system?['growing-system-v1',crop,!!profile.fixtures && p.infrastructure!==false]:crop==='lettuce'?[]:['crop-shape-v1',crop]),seed,n,sz,p.spacing,p.radius,8,.36,2.1,.04,.024,.05,.012,.004,!!p.weeds,!!p.sticks,!!p.boards,...(p.ground===false?['ground-removed-v1']:[]),...(active?['sensor-v1',sensor.key,sensor.pattern,nx,ny,sensor.along,sensor.across]:[]),...(noiseActive?['noise-v1',q.seed,q.xy,q.z,q.density,q.gaps,q.stray,...(q.cluster?['cluster-v1',q.cluster]:[])]:[])]);let hash=14695981039346656037n;for(let i=0;i<canonical.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(canonical.charCodeAt(i)))*1099511628211n);let tile_id=hash.toString(16).padStart(16,'0');return {xyz:outXYZ,cls:outCls,...(structured?{parts:outParts,skeleton:Float32Array.from(skeleton)}:{}),counts,plantReturns,coverage,lost,groundRemoved,sampledRays:n,labels:{tile_id,crop,...(structured?{plantArchitecture:2,plantForm:form,plantCondition:condition}:{}),...(profile.system?{center_target:'plant-base-xy',growing_system:profile.system}:{}),tile_size_m:[10,10],num_points:outputN,boxes},p}}
