import {cropProfile} from '../generator/crops.js?v=systems1';
import {field, returnBand} from '../generator/field.js?v=board-placement1';
import {plantSettings} from '../generator/plant-version.js?v=plants3';
import {predict} from './model.js';
import {checkFeatureMode,localSurfaceFeatures} from './terrain-features.js';

export const PEAK_HEIGHTS = [0.065, 0.035];
export const FIELD_LIMITS={train:256,validation:128};
const SAMPLE_LIMIT = 48_000;
import {mixedProfiles as SENSORS, getSensor, RAY_BUDGETS, ALTERNATING_BUDGET, DENSITY_BUDGETS} from '../generator/sensors.js?v=dense1';
const SIZE=200, STEP=.05, DIMS=13, TOL=[.075,.1,.15];
export {TOL as MATCH_RADII_METERS};
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
export function makeRecipe(seed,ground,sampling,crop='lettuce',plantArchitecture=1,plantForm='mixed',plantCondition='healthy'){
 const geometry = plantSettings({crop,plantArchitecture,plantForm,plantCondition});
 const profile=cropProfile(crop);
 const r=rand(seed^0x5c451271), noise=r();
 return{
  seed,ground,crop,...geometry,...(profile.fixtures?{infrastructure:true}:{}),points:26000+Math.floor(r()*5)*4000,radius:(.145+.067*r())*profile.radiusFactor,spacing:(.279+.11*r())*profile.spacingFactor,
  weeds:r()<.5,sticks:r()<.35,boards:r()<.28,sampling,
  scanNoise:{seed:mix(seed^0x17b737d0),xy:noise<.25?0:.4+.9*r(),z:noise<.25?0:.25+.9*r(),
    density:noise<.25?0:8+19*r(),gaps:noise<.65?0:1+4*r(),stray:noise<.6?0:.08+.28*r(),cluster:noise<.25?0:7+16*r()}
 };
}
export function targetCenters(boxes){return boxes.map(({min,max,base_xy_m})=>base_xy_m ?? [(min[0]+max[0])/2,(min[1]+max[1])/2]);}
function checkPeakAveraging(averaging) {
 if (averaging !== 'zero-filled' && averaging !== 'occupied') throw new Error('Choose zero-filled or occupied peak averaging.');
}
export function features(tile, minimumHeight=.065, averaging='zero-filled', featureMode='absolute'){
 // Only XYZ, never the synthetic return classes or supplied training boxes.
 checkPeakAveraging(averaging);
 checkFeatureMode(featureMode);
 const xy=tile.xyz,N=SIZE*SIZE, max=new Float32Array(N), count=new Uint32Array(N);
 const minima=featureMode==='local-ground' ? new Float32Array(N).fill(Infinity) : null;
 for(let i=0;i<xy.length;i+=3){
  let x=clamp(Math.floor(xy[i]/STEP),0,SIZE-1),y=clamp(Math.floor(xy[i+1]/STEP),0,SIZE-1),j=at(x,y);
  max[j]=Math.max(max[j],xy[i+2]);count[j]++;
  if(minima) minima[j]=Math.min(minima[j],xy[i+2]);
 }
 // The sampled-cell rule averages only the bins the scan visited.
 // A measured ground return still contributes its weight to the denominator.
 const observed=averaging==='occupied' ? new Uint8Array(N) : null;
 if(observed)for(let j=0;j<N;j++)observed[j]=count[j]>0;
 const kernelSum=(values,j)=>values[j]*4+
  (values[j-1]+values[j+1]+values[j-SIZE]+values[j+SIZE])*2+
  values[j-SIZE-1]+values[j-SIZE+1]+values[j+SIZE-1]+values[j+SIZE+1];
 const smooth=new Float32Array(N);
 for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++){
  const j=at(x,y);
  if(observed && !observed[j])continue;
  smooth[j]=kernelSum(max,j)/(observed?kernelSum(observed,j):16);
 }
 const vec=[],pos=[];
 for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++){
  const j=at(x,y),h=smooth[j];if(h<minimumHeight || (observed && !observed[j]))continue;
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
  const local=minima ? localSurfaceFeatures(minima,max,SIZE,x,y) : null;
  vec.push(h,local ? local[0] : max[j],f[0],f[1],f[2],h-f[2],high[1]/Math.max(1,n[1]),
    high[2]/Math.max(1,n[2]),occupied[0]/Math.max(1,n[0]),occupied[2]/Math.max(1,n[2]),
    Math.log1p(nums),Math.abs(crossX-crossY)/(w||1),local ? local[1] : extreme-bg/Math.max(1,n[2]));
 }
 return{X:Float32Array.from(vec),pos};
}
function prepareScan(scan, minimumHeight, validation, peakAveraging, featureMode) {
 const {p:recipe, labels, sampledRays, coverage} = scan;
 const tile = {...features(scan, minimumHeight, peakAveraging, featureMode), truth:targetCenters(labels.boxes), coverage,
  seed:recipe.seed, ground:recipe.ground, recipe, sampledRays, tile_id:labels.tile_id, returnCount:labels.num_points, points:[]};
 if (validation) {
  tile.plantReturns = scan.plantReturns;
  const n = scan.xyz.length / 3, stride = Math.max(1, Math.ceil(n / 1500));
  for (let i=0; i<n; i+=stride) tile.points.push([scan.xyz[3*i],scan.xyz[3*i+1]]);
 }
 return tile;
}
function normalizeFeatures(values, means, std) {
 for (let i=0; i<values.length; i++) {
  const column = i % DIMS;
  values[i] = (values[i] - means[column]) / std[column];
 }
}
function manifestTile(tile, split) {
 const {seed, tile_id, returnCount, sampledRays, recipe} = tile;
 return {split, seed, tile_id, returnCount, sampledRays, recipe};
}
// Keep unversioned and same-form exports byte-compatible with older settings.
export function validationFormSettings({crop,plantArchitecture=1,plantForm='mixed',validationPlantForm}) {
 if (validationPlantForm===undefined || validationPlantForm==='follow') return {};
 plantSettings({crop,plantArchitecture,plantForm:validationPlantForm});
 return validationPlantForm===plantForm ? {} : {validationPlantForm};
}
export async function buildDataset({seed=27,crop='lettuce',plantArchitecture=1,plantForm='mixed',plantCondition='healthy',validationPlantForm,trainFields=6,valFields=3,sensorMode='reference',validationSensorMode=sensorMode,trainingRayBudget=0,validationRayBudget=0,minimumHeight=.065,peakAveraging='zero-filled',featureMode='absolute',sampleLimit=SAMPLE_LIMIT,selectPositiveRows,generate,onScan,onProgress=()=>{},signal}={}){
 const geometry = plantSettings({crop,plantArchitecture,plantForm,plantCondition});
 const holdout = validationFormSettings({crop,plantArchitecture,plantForm,validationPlantForm});
 checkPeakAveraging(peakAveraging);
 checkFeatureMode(featureMode);
 if (!Number.isInteger(sampleLimit) || sampleLimit<24 || sampleLimit>SAMPLE_LIMIT || sampleLimit%2) {
  throw new Error('Choose an even training sample limit from 24 to 48,000.');
 }
 if(!PEAK_HEIGHTS.includes(minimumHeight))throw new Error('Choose a supported minimum peak height.');
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
   const recipe = makeRecipe(id, v === 0, profile, crop, plantArchitecture,
    trainingField ? plantForm : (holdout.validationPlantForm ?? plantForm), plantCondition);
   if (rayBudget) recipe.points = rayBudget;
   const step={split:trainingField?'Training':'Validation',done:2*k+v+1,total,firstValidation:k===trainFields && v===0};
   const t=generate ? await generate(recipe,step) : field(recipe);
   const item=prepareScan(t,minimumHeight,!trainingField,peakAveraging,featureMode);
   if(onScan) onScan(t,step);
   (trainingField?training:validation).push(item);
   onProgress({done:2*k+v+1,total,stage:'data'});await pause();
  }
 }
 // Keep the originating tile through the class shuffles so field totals describe
 // the exact rows used by the fit, including both soil variants for each seed.
 const bySeed = new Map(trainSeeds.map(seed => [seed,{
  seed,availablePositive:0,availableNegative:0,ambiguous:0,usedPositive:0,usedNegative:0
 }]));
 const pos=[],neg=[];
 for(const [tileIndex,t] of training.entries()){
  check(signal);
  const counts = bySeed.get(t.seed);
  for(let i=0;i<t.pos.length;i++){
   const [x,y]=t.pos[i];let d2=Infinity;
   for(const [a,b] of t.truth)d2=Math.min(d2,(a-x)**2+(b-y)**2);
   if(d2<.095**2){
    pos.push([t,i]);
    counts.availablePositive++;
   }else if(d2>.15**2){
    neg.push([t,i]);
    counts.availableNegative++;
   }else counts.ambiguous++;
  }
  if((tileIndex+1)%4===0||tileIndex+1===training.length){
   onProgress({done:tileIndex+1,total:training.length,stage:'labels'});await pause();
  }
 }
 check(signal);
 if(Math.min(pos.length,neg.length)<12)throw new Error('Not enough positive and negative candidates. Try another seed.');
 const r=rand(seed^0xaa320f63);
 for(const a of [pos,neg])for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 const n=Math.min(pos.length,neg.length,sampleLimit/2);
 // Research studies may stratify the shuffled positives using training labels.
 // Local indices keep every selected row inside this split and leave negatives paired.
 let positiveRows=pos;
 if (selectPositiveRows) {
  const indices=selectPositiveRows(pos.map(([tile,i])=>({tileId:tile.tile_id,xy:tile.pos[i]})),n);
  if (!Array.isArray(indices) || indices.length!==n || new Set(indices).size!==n ||
      Array.from(indices).some(i=>!Number.isInteger(i) || i<0 || i>=pos.length)) {
   throw Error('Select exactly the requested number of distinct positive training row indices.');
  }
  positiveRows=indices.map(i=>pos[i]);
 }
 const X=new Float32Array(n*2*DIMS),Y=new Float32Array(n*2);
 for(const [pool,label,used] of [[positiveRows,1,'usedPositive'],[neg,0,'usedNegative']]){
  for(let i=0;i<n;i++){
   const [tile,peak] = pool[i];
   const row = i*2 + (1-label);
   X.set(tile.X.subarray(peak*DIMS,(peak+1)*DIMS),row*DIMS);
   Y[row]=label;
   bySeed.get(tile.seed)[used]++;
  }
 }
 let means=new Float64Array(DIMS),std=new Float64Array(DIMS);
 for(let i=0;i<X.length;i++)means[i%DIMS]+=X[i];
 for(let j=0;j<DIMS;j++)means[j]/=Y.length;
 for(let i=0;i<X.length;i++)std[i%DIMS]+=(X[i]-means[i%DIMS])**2;
 for(let j=0;j<DIMS;j++)std[j]=Math.max(.00001,Math.sqrt(std[j]/Y.length));
 normalizeFeatures(X,means,std);for(const t of validation)normalizeFeatures(t.X,means,std);
 return{X,Y,dims:DIMS,validation,scaling:{means:Array.from(means),std:Array.from(std)},
  stats:{crop,...geometry,...holdout,...(peakAveraging==='occupied'?{peakAveraging}:{}),...(featureMode==='local-ground'?{featureMode}:{}),trainFields,valFields,trainTiles:training.length,valTiles:validation.length,minimumHeight,samples:Y.length,sampleLimit,trainingExamplesByField:[...bySeed.values()],sensorMode,validationSensorMode,trainingRayBudget,validationRayBudget,fieldSeeds:{training:trainSeeds,validation:valSeeds},generator:'crop-trainer-v1'},
  manifest:[...training.map(t=>manifestTile(t,'train')),...validation.map(t=>manifestTile(t,'validation'))]};
}
// Change only the held-out layout. Preserve the fitted feature scale and
// verify plant centers before scoring either view as a matched planting.
export async function rescanValidation(set, validationSensorMode, {generate, onScan, signal}={}) {
 const sampling = getSensor(validationSensorMode), validation = [];
 for (const [index, original] of set.validation.entries()) {
  check(signal);
  const recipe = {...original.recipe, sampling};
  const step = {split:'Validation', done:index+1, total:set.validation.length};
  const scan = generate ? await generate(recipe,step) : field(recipe);
  const tile = prepareScan(scan,set.stats.minimumHeight,true,set.stats.peakAveraging,set.stats.featureMode);
  if (tile.truth.length !== original.truth.length || tile.truth.some(([x,y],i) =>
      x !== original.truth[i][0] || y !== original.truth[i][1])) {
   throw new Error('A second scan changed a labeled plant center.');
  }
  normalizeFeatures(tile.X,set.scaling.means,set.scaling.std);
  validation.push(tile);
  onScan?.(scan,step);
  await pause();
 }
 check(signal);
 return {...set, validation, stats:{...set.stats,validationSensorMode},
  manifest:[...set.manifest.filter(t=>t.split==='train'),...validation.map(t=>manifestTile(t,'validation'))]};
}
const matchingSlack = 1e-12;
export function matchCenters(pins, truth, radius) {
 const radiusSquared = radius ** 2;
 const candidates = pins.map(([x, y]) => {
  const boxes = [];
  for (let box = 0; box < truth.length; box++) {
   const [tx, ty] = truth[box];
   if ((tx-x)**2 + (ty-y)**2 <= radiusSquared + matchingSlack) boxes.push(box);
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
export function detectionStages(tile, probabilities, threshold=.5, separation=cropProfile(tile.recipe?.crop).pinSeparation){
 const ordered=Array.from(probabilities.keys())
  .filter(i=>probabilities[i]>=threshold)
  .sort((a,b)=>probabilities[b]-probabilities[a]||a-b);
 const accepted=ordered.map(i=>tile.pos[i]);
 const selected=[];
 for(const point of accepted){
  const [x,y]=point;
  if(selected.every(([a,b])=>(a-x)**2+(b-y)**2>=separation**2))selected.push(point);
 }
 return {proposals:tile.pos,accepted,selected};
}

// Proximity to one label, independent of the scorer's one-to-one assignments.
export function nearbyPeaks(preview, box, cm) {
 const [x,y] = preview.truth[box];
 const limit = (cm / 100) ** 2 + matchingSlack;
 const withinRange = ([px,py]) => (px-x)**2 + (py-y)**2 <= limit;
 const proposals = [];
 let bestScore = null;
 for (const [i, point] of preview.stages.proposals.entries()) {
  if (withinRange(point)) {
   proposals.push(point);
   const score = preview.proposalScores[i];
   if (bestScore === null || score > bestScore) bestScore = score;
  }
 }
 return {proposals, accepted:preview.stages.accepted.filter(withinRange), selected:preview.stages.selected.filter(withinRange), bestScore};
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
  const proposalScores=predictScores(t.X,weights,set.dims);
  const stages=detectionStages(t,proposalScores,threshold);
  const predictions=stages.selected;
  const missesByTolerance = [];
  const byTolerance = TOL.map(radius => {
   const {count:tp, pinByBox} = matchCenters(predictions, t.truth, radius);
   const boxIndices = [];
   for (const [box, pin] of pinByBox.entries()) {
    if (pin === -1) boxIndices.push(box);
   }
   let missedByCoverage, withCropReturns;
   if (t.plantReturns) {
    missedByCoverage = {zero:0, oneToFour:0, fiveOrMore:0};
    for (const box of boxIndices) missedByCoverage[returnBand(t.plantReturns[box])]++;
    withCropReturns = missedByCoverage.oneToFour + missedByCoverage.fiveOrMore;
   }
   missesByTolerance.push({cm:100 * radius, boxIndices, withCropReturns, missedByCoverage});
   return {cm: 100 * radius, tp, fp: predictions.length - tp, fn: t.truth.length - tp};
  });
  tiles.push({seed:t.seed,ground:t.ground,tile_id:t.tile_id,crop:t.recipe.crop,...plantSettings(t.recipe),requestedRays:t.recipe.points,sampledRays:t.sampledRays,returnCount:t.returnCount,sensor:t.recipe.sampling.key,coverage:t.coverage,byTolerance,missesByTolerance,stages15cm:measureStages(stages,t.truth,byTolerance[2].tp)});
  previews.set(t.tile_id,{truth:t.truth,proposalScores,plantReturns:t.plantReturns,missesByTolerance,predictions,ground:t.ground,seed:t.seed,points:t.points,stages});
  onProgress({done:i+1,total:set.validation.length,stage:'validation',tile:t,predictions,missed:missesByTolerance[2].boxIndices});await pause();
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

// Pool labeled plants before computing recall. Callers choose the soil variants.
export function coverageAtDistance(tiles, cm) {
 if (![7.5,10,15].includes(cm)) throw new Error('Choose a matching distance of 7.5, 10 or 15 cm.');
 const groups = {
  zero:{plants:0, matched:0}, oneToFour:{plants:0, matched:0}, fiveOrMore:{plants:0, matched:0}
 };
 let extraPins = 0;
 for (const tile of tiles) {
  const misses = tile.missesByTolerance?.find(row => row.cm === cm)?.missedByCoverage;
  if (!misses || !tile.coverage) throw new Error('Replay this tile to obtain crop return counts for missed plants.');
  for (const [band, group] of Object.entries(groups)) {
   group.plants += tile.coverage[band];
   group.matched += tile.coverage[band] - misses[band];
  }
  extraPins += tile.byTolerance.find(row => row.cm === cm).fp;
 }
 return {groups, extraPins};
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
