import {cropProfile} from './crops.js';
import {field} from './field.js?v=coverage1';
import {predict} from './model.js';

export const FIELD_LIMITS={train:256,validation:128};
import {mixedProfiles as SENSORS, getSensor, RAY_BUDGETS, ALTERNATING_BUDGET, DENSITY_BUDGETS} from './sensors.js?v=densitymix1';
const SIZE=200, STEP=.05, DIMS=13, TOL=[.075,.1,.15];
const at=(x,y)=>y*SIZE+x, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pause=()=>new Promise(r=>setTimeout(r,0));
function check(signal){if(signal?.aborted)throw new DOMException('Training stopped','AbortError');}
function mix(n){n=(n^(n>>>16))>>>0;n=Math.imul(n,0x21f0aaad);n=(n^(n>>>15))>>>0;n=Math.imul(n,0x735a2d97);return(n^(n>>>15))>>>0;}
function rand(seed){let i=seed;return()=>mix(i=(i+0x9e3779b9)>>>0)/4294967296;}
function sensorOrder(seed){
 const a=SENSORS.slice(),r=rand(seed);
 for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
export function makeRecipe(seed,ground,sampling,crop='lettuce'){
 const profile=cropProfile(crop);
 const r=rand(seed^0x5c451271), noise=r();
 return{
  seed,ground,crop,points:26000+Math.floor(r()*5)*4000,radius:(.145+.067*r())*profile.radiusFactor,spacing:(.279+.11*r())*profile.spacingFactor,
  weeds:r()<.5,sticks:r()<.35,boards:r()<.28,sampling,
  scanNoise:{seed:mix(seed^0x17b737d0),xy:noise<.25?0:.4+.9*r(),z:noise<.25?0:.25+.9*r(),
    density:noise<.25?0:8+19*r(),gaps:noise<.65?0:1+4*r(),stray:noise<.6?0:.08+.28*r(),cluster:noise<.25?0:7+16*r()}
 };
}
function centers(boxes){return boxes.map(({min,max})=>[(min[0]+max[0])/2,(min[1]+max[1])/2]);}
export function features(tile, minimumHeight=.065){
 // Only XYZ, never the synthetic return classes or supplied training boxes.
 const xy=tile.xyz,N=SIZE*SIZE, max=new Float32Array(N), count=new Uint16Array(N);
 for(let i=0;i<xy.length;i+=3){
  let x=clamp(Math.floor(xy[i]/STEP),0,SIZE-1),y=clamp(Math.floor(xy[i+1]/STEP),0,SIZE-1),j=at(x,y);
  max[j]=Math.max(max[j],xy[i+2]);count[j]++;
 }
 const smooth=new Float32Array(N);
 for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++){
  let j=at(x,y);smooth[j]=(max[j]*4+(max[j-1]+max[j+1]+max[j-SIZE]+max[j+SIZE])*2+max[j-SIZE-1]+max[j-SIZE+1]+max[j+SIZE-1]+max[j+SIZE+1])/16;
 }
 const vec=[],pos=[];
 for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++){
  const j=at(x,y),h=smooth[j];if(h<minimumHeight)continue;
  let peak=true;
  for(let dy=-1;dy<=1&&peak;dy++)for(let dx=-1;dx<=1;dx++){
   const k=at(x+dx,y+dy);if(smooth[k]>h||(k<j&&smooth[k]===h)){peak=false;break;}
  }
  if(!peak)continue;
  const ring=[0,0,0], n=[0,0,0], occupied=[0,0,0], high=[0,0,0];
  let wx=0,wy=0,w=0,extreme=0,crossX=0,crossY=0,nums=0,bg=0;
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const u=x+dx,v=y+dy,k=at(u,v);if(u<0||u>=SIZE||v<0||v>=SIZE)continue;
   const d2=dx*dx+dy*dy;if(d2>17)continue;
   const b=d2<=2?0:d2<=8?1:2,z=max[k];
   ring[b]+=z;n[b]++;occupied[b]+=count[k]>0;high[b]+=z>Math.max(.07,h*.65);
   nums+=count[k]; if(b===2)bg+=Math.min(z,.08);
   extreme=Math.max(extreme,z);
   if(d2<=4){const m=Math.max(0,smooth[k]-h*.36);wx+=dx*m;wy+=dy*m;w+=m;crossX+=dx*dx*m;crossY+=dy*dy*m;}
  }
  const f=ring.map((a,i)=>a/Math.max(1,n[i]));
  pos.push([(x+.5+clamp(wx/(w||1),-1,1))*STEP,(y+.5+clamp(wy/(w||1),-1,1))*STEP]);
  vec.push(h,max[j],f[0],f[1],f[2],h-f[2],high[1]/Math.max(1,n[1]),
    high[2]/Math.max(1,n[2]),occupied[0]/Math.max(1,n[0]),occupied[2]/Math.max(1,n[2]),
    Math.log1p(nums),Math.abs(crossX-crossY)/(w||1),extreme-bg/Math.max(1,n[2]));
 }
 return{X:Float32Array.from(vec),pos};
}
export async function buildDataset({seed=27,crop='lettuce',trainFields=6,valFields=3,sensorMode='reference',validationSensorMode=sensorMode,trainingRayBudget=0,validationRayBudget=0,minimumHeight=.065,onProgress=()=>{},signal}={}){
 if(![.035,.065].includes(minimumHeight))throw new Error('Choose a supported minimum peak height.');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(trainFields)||trainFields<2||trainFields>FIELD_LIMITS.train||!Number.isInteger(valFields)||valFields<1||valFields>FIELD_LIMITS.validation)throw new Error('Use a valid seed and the available field count limits.');
 if (trainingRayBudget !== ALTERNATING_BUDGET && trainingRayBudget !== 0 && !RAY_BUDGETS.includes(trainingRayBudget)) throw new Error('Choose a supported training ray budget.');
 if (validationRayBudget !== 0 && !RAY_BUDGETS.includes(validationRayBudget)) throw new Error('Choose a supported validation ray budget.');
 const fixedSensors = [sensorMode, validationSensorMode].map(mode => mode === 'mixed' ? null : getSensor(mode));
 const total=2*(trainFields+valFields), training=[],validation=[], trainSeeds=[],valSeeds=[];
 const orders=[sensorOrder(seed^0xe50d735b),sensorOrder(seed^0x75a89521)];
 for(let k=0;k<trainFields+valFields;k++){
  const trainingField=k<trainFields,slot=trainingField?k:1024+k-trainFields;
  const id=mix((seed+Math.imul(slot,0x9e3779b9))>>>0);
  (trainingField?trainSeeds:valSeeds).push(id);
  const idx=trainingField?k:k-trainFields;
  const split = trainingField ? 0 : 1;
  const profile = fixedSensors[split] ?? orders[split][idx % SENSORS.length];
  let rayBudget = trainingField ? trainingRayBudget : validationRayBudget;
  if (rayBudget === ALTERNATING_BUDGET) rayBudget = DENSITY_BUDGETS[(seed + idx) % 2];
  for(let v=0;v<2;v++){
   check(signal);
   const recipe = makeRecipe(id, v === 0, profile, crop);
   if (rayBudget) recipe.points = rayBudget;
   const t=field(recipe), f=features(t,minimumHeight), truth=centers(t.labels.boxes), points=[];
   if(!trainingField){const n=t.xyz.length/3,inc=Math.max(1,Math.ceil(n/1500));for(let i=0;i<n;i+=inc)points.push([t.xyz[3*i],t.xyz[3*i+1]]);}
   const item={...f,truth,coverage:t.coverage,seed:id,ground:v===0,recipe:t.p,sampledRays:t.sampledRays,tile_id:t.labels.tile_id,returnCount:t.labels.num_points,points};
   if (!trainingField) item.plantReturns = t.plantReturns;
   (trainingField?training:validation).push(item);
   onProgress({done:2*k+v+1,total,stage:'data'});await pause();
  }
 }
 const pos=[],neg=[];
 for(const [tileIndex,t] of training.entries()){
  check(signal);
  for(let i=0;i<t.pos.length;i++){
  const [x,y]=t.pos[i];let d2=Infinity;
  for(const [a,b] of t.truth)d2=Math.min(d2,(a-x)**2+(b-y)**2);
  if(d2<.095**2)pos.push([t.X,i]);else if(d2>.15**2)neg.push([t.X,i]);
  }
  if((tileIndex+1)%4===0||tileIndex+1===training.length){
   onProgress({done:tileIndex+1,total:training.length,stage:'labels'});await pause();
  }
 }
 check(signal);
 if(Math.min(pos.length,neg.length)<12)throw new Error('Not enough positive and negative candidates. Try another seed.');
 const r=rand(seed^0xaa320f63);
 for(const a of [pos,neg])for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 const n=Math.min(pos.length,neg.length,24000);
 const X=new Float32Array(n*2*DIMS),Y=new Float32Array(n*2);
 for(let i=0;i<n;i++){
  for(const [a,j] of [[pos,0],[neg,1]]){
   const [z,k]=a[i];X.set(z.subarray(k*DIMS,(k+1)*DIMS),(2*i+j)*DIMS);
   Y[2*i+j]=j===0?1:0;
  }
 }
 let means=new Float64Array(DIMS),std=new Float64Array(DIMS);
 for(let i=0;i<X.length;i++)means[i%DIMS]+=X[i];
 for(let j=0;j<DIMS;j++)means[j]/=Y.length;
 for(let i=0;i<X.length;i++)std[i%DIMS]+=(X[i]-means[i%DIMS])**2;
 for(let j=0;j<DIMS;j++)std[j]=Math.max(.00001,Math.sqrt(std[j]/Y.length));
 const normalize=a=>{for(let i=0;i<a.length;i++){const j=i%DIMS;a[i]=(a[i]-means[j])/std[j];}};
 normalize(X);for(const t of validation)normalize(t.X);
 return{X,Y,dims:DIMS,validation,scaling:{means:Array.from(means),std:Array.from(std)},
  stats:{crop,trainFields,valFields,trainTiles:training.length,valTiles:validation.length,minimumHeight,samples:Y.length,sampleLimit:48000,sensorMode,validationSensorMode,trainingRayBudget,validationRayBudget,fieldSeeds:{training:trainSeeds,validation:valSeeds},generator:'crop-trainer-v1'},
  manifest:[...training,...validation].map((t,i)=>({split:i<training.length?'train':'validation',seed:t.seed,tile_id:t.tile_id,returnCount:t.returnCount,sampledRays:t.sampledRays,recipe:t.recipe}))};
}
function matchCenters(pins, truth, radius) {
 const radiusSquared = radius ** 2;
 const candidates = pins.map(([x, y]) => {
  const boxes = [];
  for (let box = 0; box < truth.length; box++) {
   const [tx, ty] = truth[box];
   if ((tx-x)**2 + (ty-y)**2 <= radiusSquared + 1e-12) boxes.push(box);
  }
  return boxes;
 });
 const pinByBox = new Int32Array(truth.length).fill(-1);
 const visited = new Int32Array(truth.length).fill(-1);
 function assign(pin, visit) {
  for (const box of candidates[pin]) {
   if (visited[box] === visit) continue;
   visited[box] = visit;
   if (pinByBox[box] === -1 || assign(pinByBox[box], visit)) {
    pinByBox[box] = pin;
    return true;
   }
  }
  return false;
 }
 let count = 0;
 for (let pin = 0; pin < pins.length; pin++) {
  if (assign(pin, pin)) count++;
 }
 return {count, pinByBox};
}
export function matchedCount(pred, truth, radius) {
 return matchCenters(pred, truth, radius).count;
}
export function detectionStages(tile, probabilities, threshold=.5){
 const ordered=Array.from(probabilities.keys())
  .filter(i=>probabilities[i]>=threshold)
  .sort((a,b)=>probabilities[b]-probabilities[a]||a-b);
 const accepted=ordered.map(i=>tile.pos[i]);
 const selected=[];
 const separation=cropProfile(tile.recipe?.crop).pinSeparation;
 for(const [x,y] of accepted){
  if(selected.every(([a,b])=>(a-x)**2+(b-y)**2>=separation**2))selected.push([x,y]);
 }
 return {proposals:tile.pos,accepted,selected};
}

export function measureStages(stages,truth,finalMatches){
 return Object.entries(stages).map(([stage,points])=>({
  stage,count:points.length,
  matched:stage==='selected'&&finalMatches!==undefined?finalMatches:matchedCount(points,truth,.15)
 }));
}
export function checkScoreThreshold(value) {
 if (!Number.isFinite(value) || value < 0 || value > 1) {
  throw new RangeError('The detection score cutoff must be a number between 0 and 1.');
 }
}
function summarizeTiles(tiles) {
 const scores = TOL.map((radius, index) => {
  let tp = 0, fp = 0, fn = 0;
  for (const tile of tiles) {
   const counts = tile.byTolerance[index];
   tp += counts.tp;
   fp += counts.fp;
   fn += counts.fn;
  }
  return {
   cm: radius * 100, tp, fp, fn,
   precision: tp / (tp + fp || 1),
   recall: tp / (tp + fn || 1),
   f1: 2 * tp / (2 * tp + fp + fn || 1)
  };
 });
 // Each final pin and each label contributes once at every matching distance.
 let absolute = 0, signed = 0;
 for (const tile of tiles) {
  const {fp, fn} = tile.byTolerance[0];
  signed += fp - fn;
  absolute += Math.abs(fp - fn);
 }
 const countError = tiles.length ? {meanAbsolute:absolute / tiles.length, meanSigned:signed / tiles.length} : null;
 return {scores, countError, meanF1: scores.reduce((sum, score) => sum + score.f1, 0) / scores.length};
}

export async function validateModel(set,weights,{threshold=.5,predictScores=predict,signal,onProgress=()=>{}}={}){
 checkScoreThreshold(threshold);
 const tiles=[],previews=new Map();
 for(const [i,t] of set.validation.entries()){
  check(signal);
  const stages=detectionStages(t,predictScores(t.X,weights,set.dims),threshold);
  const predictions=stages.selected;
  const missesByTolerance = [];
  const byTolerance = TOL.map(radius => {
   const {count:tp, pinByBox} = matchCenters(predictions, t.truth, radius);
   const boxIndices = [];
   for (const [box, pin] of pinByBox.entries()) {
    if (pin === -1) boxIndices.push(box);
   }
   const withCropReturns = t.plantReturns && boxIndices.filter(box => t.plantReturns[box] > 0).length;
   missesByTolerance.push({cm:100 * radius, boxIndices, withCropReturns});
   return {cm: 100 * radius, tp, fp: predictions.length - tp, fn: t.truth.length - tp};
  });
  tiles.push({seed:t.seed,ground:t.ground,tile_id:t.tile_id,crop:t.recipe.crop,requestedRays:t.recipe.points,sampledRays:t.sampledRays,returnCount:t.returnCount,sensor:t.recipe.sampling.key,coverage:t.coverage,byTolerance,missesByTolerance,stages15cm:measureStages(stages,t.truth,byTolerance[2].tp)});
  previews.set(t.tile_id,{truth:t.truth,plantReturns:t.plantReturns,missesByTolerance,predictions,ground:t.ground,seed:t.seed,points:t.points,stages});
  onProgress({done:i+1,total:set.validation.length,stage:'validation'});await pause();
 }
 const byGround = [true, false].map(ground => {
  const subset = tiles.filter(tile => tile.ground === ground);
  return {ground, tileCount: subset.length, ...summarizeTiles(subset)};
 });
 const fields = new Map();
 for (const tile of tiles) {
  if (!fields.has(tile.seed)) fields.set(tile.seed, []);
  fields.get(tile.seed).push(tile);
 }
 const byField = Array.from(fields, ([seed, scans]) => ({
  seed, sensor: scans[0].sensor, tileIds: scans.map(tile => tile.tile_id),
  ...summarizeTiles(scans)
 }));
 return {...summarizeTiles(tiles), byGround, byField, preview:previews.values().next().value, previews, tiles};
}

// Box indices refer to one exact scan and its ordered label array.
export function compareMatchedBoxes(first, second, cm) {
 if (!first.tile_id || first.tile_id !== second.tile_id) throw new Error('Choose results for the same tile.');
 if (![7.5,10,15].includes(cm)) throw new Error('Choose a matching distance of 7.5, 10 or 15 cm.');
 const misses = tile => {
  const group = tile.missesByTolerance?.find(group => group.cm === cm);
  if (!group) throw new Error('Replay this run to obtain missed box indices at the selected distance.');
  return new Set(group.boxIndices);
 };
 const firstMisses = misses(first), secondMisses = misses(second);
 const firstOnly = [...secondMisses].filter(box => !firstMisses.has(box));
 const secondOnly = [...firstMisses].filter(box => !secondMisses.has(box));
 const a = first.byTolerance.find(group => group.cm === cm);
 const b = second.byTolerance.find(group => group.cm === cm);
 return {both:a.tp-firstOnly.length, firstOnly, secondOnly, neither:a.fn-secondOnly.length, firstFP:a.fp, secondFP:b.fp};
}
