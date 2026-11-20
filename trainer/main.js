import {cropProfile} from './crops.js';
import {allProfiles, sensorOptions, validationSensorOptions, sensorDetails, rayBudgetOptions} from './sensors.js?v=rays1';
if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embed');
const $=id=>document.getElementById(id);
const params = new URLSearchParams(location.search);
rayBudgetOptions($('validationRayBudget'), params.get('validationRayBudget'));
const seedParam = params.get('seed');
if (/^\d+$/.test(seedParam) && Number(seedParam) <= 0xffffffff) $('seed').value = String(Number(seedParam));
const cropParam = params.get('crop');
if ([...$('crop').options].some(option => option.value === cropParam)) $('crop').value = cropParam;
function selectCropDefault() { $('peakHeight').value = String(cropProfile($('crop').value).peakHeight); }
$('crop').addEventListener('change', selectCropDefault);
selectCropDefault();
sensorOptions($('scanner'), true);
validationSensorOptions($('validationSensor'));
const validationParam = params.get('validationSensor');
if ([...$('validationSensor').options].some(option => option.value === validationParam)) {
 $('validationSensor').value = validationParam;
}
const scannerParam = params.get('sensor');
$('scanner').value = allProfiles.some(profile => profile.key === scannerParam) ? scannerParam : 'mixed';
function describeScanner() { $('scannerInfo').textContent = sensorDetails($('scanner').value); }
$('scanner').addEventListener('change', describeScanner);
describeScanner();
function updateBenchmarkLinks() {
 const seed = $('seed').valueAsNumber;
 const validSeed = Number.isInteger(seed) && seed >= 0 && seed < 0xffffffff;
 for (const [id, comparison] of [['cutoffBench', 'cutoffs'], ['epochBench', 'epochs']]) {
  const query = new URLSearchParams({comparison, crop:$('crop').value, sensor:$('scanner').value, seed});
  if (Number($('validationRayBudget').value)) query.set('validationRayBudget', $('validationRayBudget').value);
  if ($('validationSensor').value !== 'follow') query.set('validationSensor', $('validationSensor').value);
  const link = $(id);
  link.hidden = !validSeed || (comparison === 'cutoffs' && !$('epochs').validity.valid);
  if (comparison === 'cutoffs') query.set('epochs', $('epochs').value);
  link.href = '../benchmark/?'+query;
 }
}
for (const id of ['crop','scanner','validationSensor','validationRayBudget','seed','epochs']) $(id).addEventListener('input', updateBenchmarkLinks);
let controller=null,losses=[],lastPreview=null,backendReady=false,deps,webgpuAvailable=false,lastRun=null,lastPaint=0;
try {
 deps=await Promise.all([import('./data.js?v=rays1'),import('./model.js?v=benchmark1'),import('./neural.js')]);
 $('epochs').max=deps[1].MAX_EPOCHS;
 const epochsParam = params.get('epochs');
 if (/^\d+$/.test(epochsParam) && Number(epochsParam) >= 1 && Number(epochsParam) <= deps[1].MAX_EPOCHS) {
  $('epochs').value = Number(epochsParam);
 }
 const thresholdParam = params.get('threshold');
 if (thresholdParam?.trim() && Number.isFinite(Number(thresholdParam)) && Number(thresholdParam) >= 0 && Number(thresholdParam) <= 1) {
  $('threshold').value = Number(thresholdParam);
 }
 updateBenchmarkLinks();
 if (params.get('engine') === 'cpu') $('engine').value = 'cpu';
 $('train').max=deps[0].FIELD_LIMITS.train;
 $('validation').max=deps[0].FIELD_LIMITS.validation;
 let gpuStatus='WebGPU unavailable · browser API missing';
 try{
  if(navigator.gpu){
   webgpuAvailable=!!(await navigator.gpu.requestAdapter());
   gpuStatus=webgpuAvailable?'WebGPU available · adapter found':'WebGPU unavailable · no adapter';
  }
 }catch{gpuStatus='WebGPU unavailable · adapter check failed'}
 $('engine').querySelector('[value="webgpu"]').disabled=!webgpuAvailable;
 $('gpu').textContent=gpuStatus;
 backendReady=true;$('run').disabled=false;
 $('status').textContent='Ready. Field generation and validation always run on the CPU.';
}catch(e){
 $('gpu').textContent='Training unavailable';$('stage').textContent='Training not ready';$('status').textContent=e.message;
}
function status(stage,detail,value){
 $('stage').textContent=stage;$('status').textContent=detail||'';
 if(Number.isFinite(value))$('progress').value=Math.min(100,Math.max(0,value));else $('progress').removeAttribute('value');
}
let auditTiles=[],fieldViews=new Map(),auditThreshold=.5, auditRayBudget=0;
function showField(){
 const field=auditTiles[Number($('auditField').value)];
 lastPreview=fieldViews.get(field?.tile_id);
 if(!lastPreview)return;
 const stage=$('overlayStage').value;
 const count=lastPreview.stages[stage].length;
 $('previewText').textContent=field.seed+' · ground '+(field.ground?'present':'removed')+' · '+lastPreview.truth.length+' labeled plants (green rings) · '+count+' centers at this stage (red dots).';
 draw();
}
$('overlayStage').addEventListener('change',showField);
function showStages(){
 const tile=auditTiles[Number($('auditField').value)];
 if(!tile)return;
 const totals=tile.byTolerance.at(-1);
 const labels=totals.tp+totals.fn;
 const scanQuery = new URLSearchParams({crop:tile.crop, seed:tile.seed, sensor:tile.sensor, ground:tile.ground, tile:tile.tile_id});
 if (auditRayBudget) scanQuery.set('budget', auditRayBudget);
 $('inspectScan').href = '../?'+scanQuery+'#field';
 $('scanCounts').textContent = tile.requestedRays.toLocaleString()+' rays requested · '+tile.sampledRays.toLocaleString()+' sampled · '+tile.returnCount.toLocaleString()+' scan returns · '+labels+' labeled plants · tile '+tile.tile_id;
 const names={proposals:'Height peaks',accepted:'Score ≥ '+auditThreshold,selected:'After spacing filter'};
 const rows=tile.stages15cm.map(({stage,count,matched})=>{
  const row=document.createElement('tr');
  for(const value of [names[stage],count,matched+' / '+labels,(100*matched/(labels||1)).toFixed(1)+'%']){
   const cell=document.createElement('td');cell.textContent=value;row.append(cell);
  }
  return row;
 });
 $('auditRows').replaceChildren(...rows);showField();
}
$('auditField').addEventListener('change',showStages);
$('pairedScan').addEventListener('click', () => {
 const current = auditTiles[Number($('auditField').value)];
 const pairedIndex = auditTiles.findIndex(tile => tile.seed === current.seed && tile.ground !== current.ground);
 $('auditField').value = String(pairedIndex);
 showStages();
});
function clear(){
 $('groundStudy').hidden = true;
 $('groundStudy').open = false;
 $('soilMetric').value = 'recall';
 $('harvest').textContent='';auditTiles=[];fieldViews.clear();$('overlayStage').value='selected';$('stageAudit').hidden=true;
 losses=[];lastPreview=null;lastRun=null;lastPaint=0;$('downloadRun').hidden=true;$('downloadSettings').hidden=true;$('benchmark').hidden=true;$('exportText').hidden=true;$('exportText').open=false;$('reportText').value='';$('copyReport').textContent='Copy JSON';
 for(const id of ['s75','s10','s15']){$(id).textContent='—';$('d'+id.slice(1)).textContent=''}
 $('resultNote').textContent='Run in progress. Validation uses synthetic fields only.';
 $('lossText').textContent='No epochs yet.';
 $('previewText').textContent='Labeled plants appear as green rings and detections as red dots.';
 draw();
}
function frame(id){
 const c=$(id),w=Math.max(1,c.clientWidth),h=Math.max(1,c.clientHeight),d=Math.min(2,devicePixelRatio||1);
 c.width=w*d;c.height=h*d;const g=c.getContext('2d');g.scale(d,d);return [g,w,h];
}
function coords(x){if(Array.isArray(x)||ArrayBuffer.isView(x))return x;if(x?.center)return x.center;if(x&&Number.isFinite(x.x))return [x.x,x.y];return null}
function draw(){
 let [g,w,h]=frame('loss'),b=12;
 g.strokeStyle='#c5d0c0';for(let i=1;i<4;i++){let y=i*h/4;g.beginPath();g.moveTo(b,y);g.lineTo(w-b,y);g.stroke()}
 if(losses.length){const hi=Math.max(...losses,1e-9);let sx=i=>b+i*(w-2*b)/Math.max(1,losses.length-1),sy=v=>h-b-v/hi*(h-2*b);g.strokeStyle='#2d5738';g.lineWidth=2;g.beginPath();losses.forEach((v,i)=>i?g.lineTo(sx(i),sy(v)):g.moveTo(sx(i),sy(v)));g.stroke();g.fillStyle='#2d5738';g.beginPath();g.arc(sx(losses.length-1),sy(losses.at(-1)),3,0,2*Math.PI);g.fill()}
 [g,w,h]=frame('preview');
 const side=Math.max(1,Math.min(w-18,h-18)), left=(w-side)/2,top=(h-side)/2;
 g.strokeStyle='#c5d0c0';g.strokeRect(left,top,side,side);
 if(lastPreview){
 const plot=(list,color,r,ring=false)=>{g.fillStyle=g.strokeStyle=color;g.lineWidth=1.1;for(const v of list||[]){const c=coords(v);if(!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))continue;g.beginPath();g.arc(left+c[0]*side/10,top+side-c[1]*side/10,r,0,2*Math.PI);if(ring)g.stroke();else g.fill()}};
 plot(lastPreview.points,'#acbba8',.65);plot(lastPreview.truth,'#386b46',3,true);plot(lastPreview.stages[$('overlayStage').value],'#b92e35',1.6);
 }
}
new ResizeObserver(draw).observe(document.querySelector('.viz'));draw();
function updateEpoch({epoch,loss},epochs,backend){
 if(!Number.isFinite(loss))return;
 losses.push(loss);
 const now=performance.now();
 if(epoch!==1&&epoch!==epochs&&now-lastPaint<150)return;
 lastPaint=now;
 $('lossText').textContent='Latest: '+loss.toPrecision(4);
 status('Training on '+backend,'Epoch '+epoch+' / '+epochs,30+55*epoch/epochs);
 draw();
}
function displayBenchmark(t,backend,epochs,samples){
 const format=ms=>ms<1000?ms.toFixed(1)+' ms':(ms/1000).toFixed(2)+' s';
 $('bEngine').textContent=backend;
 $('bGenerate').textContent=format(t.generationMs);
 $('bTrain').textContent=format(t.trainingMs);
 $('bScore').textContent=format(t.validationMs);
 $('bTotal').textContent=format(t.totalMs);
 $('bSpeed').textContent=t.trainingMs>0?(epochs*1000/t.trainingMs).toLocaleString(undefined,{maximumFractionDigits:1})+' epochs/s':'—';
 $('bSamples').textContent=samples.toLocaleString();
 $('benchmark').hidden=false;
}
function pickScore(scores,key,index){
 const x=Array.isArray(scores)?scores[index]:scores?.[key]??scores?.[String(key*100)]??scores?.[String(key*100)+'cm'];
 return typeof x==='number'?x:x?.f1??x?.fScore;
}
function displayGroundStudy(byGround) {
 const present = byGround.find(group => group.ground);
 const removed = byGround.find(group => !group.ground);
 const count = present.tileCount;
 $('groundSummary').textContent = 'Both columns use the same fitted model and the same '+count+' held-out '+(count === 1 ? 'field' : 'fields')+'.';
 const metric = $('soilMetric').value;
 const descriptions = {
  recall: 'Recall measures the share of labeled plants the detector found.',
  precision: 'Precision measures the share of predicted centers that matched a plant.',
  f1: 'F1 is the harmonic mean of precision and recall.'
 };
 $('soilMetricHelp').textContent = descriptions[metric];
 const rows = present.scores.map((score, index) => {
  const other = removed.scores[index];
  const change = (other[metric] - score[metric]) * 100;
  const row = document.createElement('tr');
  const distance = document.createElement('th');
  distance.scope = 'row';
  distance.textContent = score.cm+' cm';
  row.append(distance);
  for (const value of [(score[metric]*100).toFixed(1)+'%', (other[metric]*100).toFixed(1)+'%', (change > 0 ? '+' : '')+change.toFixed(1)+' pp']) {
   const cell = document.createElement('td');
   cell.textContent = value;
   row.append(cell);
  }
  return row;
 });
 $('groundRows').replaceChildren(...rows);
 $('groundStudy').hidden = false;
}
$('soilMetric').addEventListener('change', () => {
 if (lastRun) displayGroundStudy(lastRun.byGround);
});
function display(v,threshold,validationRayBudget){
 auditRayBudget=validationRayBudget;
 auditThreshold=threshold;
 displayGroundStudy(v.byGround);
 for(const [i,k,id] of [[0,.075,'s75'],[1,.10,'s10'],[2,.15,'s15']]){
  const x=pickScore(v?.scores??v?.metrics??v,i===0?.075:k,i);
  if(Number.isFinite(x))$(id).textContent=(x*100).toFixed(1)+'%';
  const row=v?.scores?.[i],pc=n=>Number.isFinite(n)?(n*100).toFixed(0)+'%':'—';
  if(row)$('d'+id.slice(1)).textContent='Precision '+pc(row.precision)+' · Recall '+pc(row.recall);
 }
 const recall=t=>{const {tp,fn}=t.byTolerance.at(-1);return tp/(tp+fn||1)};
 fieldViews=v.previews;
 auditTiles=[...v.tiles].sort((a,b)=>recall(a)-recall(b));
 $('auditField').replaceChildren(...auditTiles.map((t,i)=>new Option(
  t.seed+' · '+t.sensor+' · ground '+(t.ground?'present':'removed'),String(i))));
 showStages();$('stageAudit').hidden=false;
 $('resultNote').textContent='F1 across held-out synthetic fields only. Not a score on real scans.';draw();
}
const reportJSON=()=>JSON.stringify(lastRun,null,2)+'\n';
function downloadJSON(data, filename) {
 const link = document.createElement('a');
 const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], {type:'application/json'});
 const url = URL.createObjectURL(blob);
 link.href = url;
 link.download = filename;
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('downloadRun').onclick = () => {
 if (lastRun) downloadJSON(lastRun, 'crop-trainer-' + lastRun.backend.toLowerCase() + '-' + lastRun.epochs + 'ep-seed' + lastRun.seed + '.json');
};
$('downloadSettings').onclick = () => {
 if (lastRun) downloadJSON(lastRun.settings, 'crop-settings-' + lastRun.seed + '.json');
};
$('exportText').ontoggle=()=>{if(lastRun&&$('exportText').open)$('reportText').value=reportJSON();};
$('copyReport').onclick=async()=>{
 if(!lastRun)return;
 try{await navigator.clipboard.writeText(reportJSON());$('copyReport').textContent='Copied'}
 catch{$('reportText').focus();$('reportText').select();$('reportText').setSelectionRange(0,$('reportText').value.length);$('copyReport').textContent='Selected. Use Copy.'}
};
$('cancel').onclick=()=>{if(controller){controller.abort();$('cancel').disabled=true;status('Canceling…','Waiting for the current operation to stop.')}};
const runInputs=['crop','seed','train','validation','epochs','scanner','validationSensor','validationRayBudget','peakHeight','architecture','threshold','engine','stress'];
function workload(){
 const n=+$('train').value,v=+$('validation').value,e=+$('epochs').value;
 $('workload').textContent=(2*(n+v)).toLocaleString()+' scan variants · '+e.toLocaleString()+' epochs'+(n+v>=64?' · Large run; keep this tab in the foreground.':'.');
}
for(const id of ['train','validation','epochs'])$(id).addEventListener('input',workload);
$('stress').onclick=()=>{
 $('train').value=128;$('validation').value=64;$('epochs').value=5000;$('scanner').value='mixed';describeScanner();updateBenchmarkLinks();workload();
};
workload();
$('controls').onsubmit=async e=>{
 e.preventDefault();if(controller||!backendReady)return;
 const [{buildDataset,validateModel},{trainGPU,trainCPU},{trainNetworkCPU,trainNetworkGPU,predictNetwork}]=deps;
 const crop=$('crop').value;
 const neural=$('architecture').value==='neural';
 const threshold=$('threshold').valueAsNumber;
 const validationRayBudget = Number($('validationRayBudget').value);
 const validationSensorMode = $('validationSensor').value === 'follow' ? undefined : $('validationSensor').value;
 const requestedBackend=$('engine').value,sensorMode=$('scanner').value,minimumHeight=Number($('peakHeight').value);
 const backend=requestedBackend==='webgpu'||(requestedBackend==='auto'&&webgpuAvailable)?'WebGPU':'CPU';
 controller=new AbortController();const {signal}=controller;
 const seed=+$('seed').value,trainFields=+$('train').value,valFields=+$('validation').value,epochs=+$('epochs').value;
 $('run').disabled=true;$('cancel').disabled=false;runInputs.forEach(id=>$(id).disabled=true);clear();status('Generating fields','Building separate training and validation fields.',0);
 try{
  const start=performance.now();
  const set=await buildDataset({crop,seed,trainFields,valFields,sensorMode,validationSensorMode,validationRayBudget,minimumHeight,signal,onProgress:(a,b)=>{
   if(signal.aborted)return;
   if(a.stage==='labels'){status('Labeling training examples',a.done+' / '+a.total+' training scans labeled',27+3*a.done/a.total);return;}
   const current=typeof a==='object'?a.current??a.completed??a.done:a,total=typeof a==='object'?a.total:b;
   status('Generating fields',Number.isFinite(current)&&Number.isFinite(total)?current+' / '+total+' scan variants':'Preparing examples…',total>0&&Number.isFinite(current)?27*current/total:undefined);
  }});
  const generated=performance.now();
  signal.throwIfAborted();status('Training on '+backend,'Starting '+backend+' training…',30);
  const train=neural?(backend==='WebGPU'?trainNetworkGPU:trainNetworkCPU):(backend==='WebGPU'?trainGPU:trainCPU);
  const fit=await train(set.X,set.Y,{dims:set.dims,epochs,signal,onEpoch:(a)=>{if(!signal.aborted)updateEpoch(a,epochs,backend)}});
  const trained=performance.now();
  signal.throwIfAborted();status('Validating held-out fields','Matching predicted centers to ground truth…',88);
  await new Promise(r=>setTimeout(r,0));
  const scores=await validateModel(set,fit.weights,{threshold,signal,predictScores:neural?predictNetwork:undefined,onProgress:(a)=>{
   if(signal.aborted)return;
   if(a?.total)status('Validating held-out fields',a.done+' / '+a.total+' scan variants scored',88+11*a.done/a.total);
  }});
  const finished=performance.now();
  signal.throwIfAborted();display(scores,threshold,validationRayBudget);
  const timings={generationMs:generated-start,trainingMs:trained-generated,validationMs:finished-trained,totalMs:finished-start};
  displayBenchmark(timings,fit.backend,epochs,set.stats.samples);
  const settings = {crop, seed, trainFields, valFields, epochs, model: neural ? 'neural' : 'linear', sensorMode, validationSensorMode, validationRayBudget, minimumHeight, threshold};
  lastRun={schema:3,settings,trainer:neural?'crop-mlp-v1':'crop-peak-logistic-v1',domain:'synthetic',backend:fit.backend,adapter:fit.adapter,requestedBackend,webgpuAvailable,sensorMode,samplePasses:epochs*set.stats.samples,timings,epochsPerSecond:timings.trainingMs>0?epochs*1000/timings.trainingMs:null,seed,epochs,learningRate:.25,threshold,minimumHeight,stats:set.stats,recipeManifest:set.manifest,scaling:set.scaling,weights:Array.from(fit.weights),loss:fit.loss,meanF1:scores.meanF1,scores:scores.scores,byGround:scores.byGround, byField:scores.byField, tiles:scores.tiles};
  let earned=[];
  try{
   const farm=JSON.parse(localStorage.getItem('crop-trainer-farm-v1')||'{"seeds":[],"mixed":false}');
   farm.seeds=[...new Set([...farm.seeds,seed])];farm.mixed||=sensorMode==='mixed';
   localStorage.setItem('crop-trainer-farm-v1',JSON.stringify(farm));
   earned=['First harvest',...(farm.mixed?['Field scout']:[]),...(farm.seeds.length>=2?['Seed saver']:[])];
  }catch{}
  $('harvest').textContent=earned.length?'Farm journal · '+earned.join(' / '):'Harvest complete';
  $('downloadRun').hidden=false;$('downloadSettings').hidden=false;$('exportText').hidden=false;
  status('Run complete',backend+' training · '+(scores.meanF1*100).toFixed(1)+'% mean F1 on held-out synthetic scans.',100);
 }catch(err){
  if(signal.aborted){status('Canceled','No validation result was produced.',0);$('resultNote').textContent='This run was canceled.'}
  else{status('Run failed',String(err?.message||err)+(backend==='WebGPU'?' Choose CPU to retry without WebGPU.':''),0);$('resultNote').textContent='No validation result was produced.'}
 }finally{controller=null;$('run').disabled=!backendReady;$('cancel').disabled=true;runInputs.forEach(id=>$(id).disabled=false)}
};
