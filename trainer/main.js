import {scanSession} from './scan-session.js?v=plants3';
import {setupPlantControls, plantSettings} from './plant-version.js?v=plants3';
import {createLiveScene} from './live-scene.js';
import {initFieldTest} from './field-test-ui.js?v=peak1';
import {initSandbox, modelSettings, duration, trainInWorker, inspectWeights, runPresets, startingPreset} from './sandbox.js?v=field-practice1';
import {MAX_SANDBOX_EPOCHS, trainerId, weightArtifact} from './network.js?v=peak1';
import {returnBand,sampleCloud} from './field.js?v=plants3';
import {cropProfile} from './crops.js?v=systems1';
import {allProfiles, sensorOptions, validationSensorOptions, sensorDetails, rayBudgetOptions, trainingRayOptions, trainingRayValue, ALTERNATING_BUDGET} from './sensors.js?v=dense1';
if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embed');
const $=id=>document.getElementById(id);
const sceneHost=$('trainingScene'),live=createLiveScene(sceneHost,{zoomControl:true});
const narrow=matchMedia('(max-width: 54rem)');
const params = new URLSearchParams(location.search);
function applyRunPreset(name) {
 const plan=runPresets[name];
 $('train').value=plan.train;
 $('validation').value=plan.validation;
 $('stopMode').value=plan.stopMode;
 $(plan.stopMode==='time'?'minutes':'epochs').value=plan.length;
 setStopMode();
}
const initialPlan = startingPreset(params);
applyRunPreset(initialPlan);
trainingRayOptions($('trainingRayBudget'), params.get('trainingRayBudget'));
rayBudgetOptions($('validationRayBudget'), params.get('validationRayBudget'));
$('scanOptions').open = ['sensor', 'validationSensor', 'trainingRayBudget', 'validationRayBudget'].some(key => params.has(key));
const sampledPeaks = params.get('peakAveraging') === 'occupied';
if (sampledPeaks) $('peakAveraging').value = 'occupied';
$('detectorOptions').open = sampledPeaks || params.has('threshold') || params.has('minimumHeight');
const seedParam = params.get('seed');
if (/^\d+$/.test(seedParam) && Number(seedParam) <= 0xffffffff) $('seed').value = String(Number(seedParam));
const cropParam = params.get('crop');
if ([...$('crop').options].some(option => option.value === cropParam)) $('crop').value = cropParam;
const readPlantControls = setupPlantControls($('crop'), $('plantArchitecture'), $('plantForm'), $('plantCondition'), params, initialPlan === 'practice' ? 3 : 1);
function selectCropDefault() { $('peakHeight').value = String(cropProfile($('crop').value).peakHeight); }
$('crop').addEventListener('change', selectCropDefault);
selectCropDefault();
const requestedHeight = params.get('minimumHeight');
if ([...$('peakHeight').options].some(option => option.value === requestedHeight)) $('peakHeight').value = requestedHeight;
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
 for (const [id, comparison] of [['cutoffBench', 'cutoffs'], ['epochBench', 'epochs'], ['densityBench', 'density'], ['heightBench','heights'], ['averagingBench','averaging']]) {
  const query = new URLSearchParams({comparison, crop:$('crop').value, ...readPlantControls(), sensor:$('scanner').value, seed});
  if (comparison !== 'averaging' && $('peakAveraging').value === 'occupied') query.set('peakAveraging', 'occupied');
  if (comparison !== 'heights') query.set('minimumHeight', $('peakHeight').value);
  if (comparison === 'density' && $('trainingRayBudget').value === ALTERNATING_BUDGET) query.set('includeMixed', '1');
  if (comparison !== 'density' && trainingRayValue($('trainingRayBudget'))) query.set('trainingRayBudget', $('trainingRayBudget').value);
  if (Number($('validationRayBudget').value)) query.set('validationRayBudget', $('validationRayBudget').value);
  if ($('validationSensor').value !== 'follow') query.set('validationSensor', $('validationSensor').value);
  const link = $(id);
  const fixedEpochs = $('stopMode').value === 'epochs' && $('epochs').validity.valid && $('epochs').valueAsNumber <= 5000;
  link.hidden = !validSeed || (comparison !== 'epochs' && comparison !== 'averaging' && !fixedEpochs);
  if (comparison === 'averaging') {
   link.textContent = fixedEpochs ? 'Compare both peak rules on matched scans' : 'Compare both peak rules at 40 epochs';
  }
  if (comparison !== 'epochs') query.set('epochs', comparison === 'averaging' && !fixedEpochs ? '40' : $('epochs').value);
  link.href = '../benchmark/?'+query;
 }
}
$('crop').addEventListener('change', updateBenchmarkLinks);
$('plantArchitecture').addEventListener('change', updateBenchmarkLinks);
for (const id of ['plantForm','plantCondition','peakHeight','peakAveraging','scanner','validationSensor','trainingRayBudget','validationRayBudget','seed','epochs','stopMode']) $(id).addEventListener('input', updateBenchmarkLinks);
// File uploads work independently of training imports and GPU discovery.
const setFieldTestModel=initFieldTest(downloadJSON);
initSandbox(params);
let finishTraining=null, calibration=null;
let controller=null,losses=[],lastPreview=null,backendReady=false,deps,webgpuAvailable=null,lastRun=null,lastPaint=0;
function updateRunAvailability() {
 backendReady = !!deps && ($('engine').value === 'cpu' || webgpuAvailable !== null);
 if (!controller) {
  $('run').disabled = !backendReady;
  $('estimate').disabled = !backendReady;
 }
}
async function checkAdapter() {
 let adapter, message;
 try {
  adapter=await navigator.gpu?.requestAdapter();
  message=adapter ? 'WebGPU available · '+deps[1].describeAdapter(adapter).kind :
   (navigator.gpu ? 'Ready to train on CPU · no WebGPU adapter found' : 'Ready to train on CPU · this browser has no WebGPU');
 } catch { message='Ready to train on CPU · WebGPU check failed'; }
 webgpuAvailable=!!adapter;
 $('engine').querySelector('[value="webgpu"]').disabled=!adapter;
 if (!adapter && $('engine').value==='webgpu') $('engine').value='auto';
 $('gpu').textContent=message;
 updateRunAvailability();
}
try {
 deps=await Promise.all([import('./data.js?v=peak1'),import('./model.js?v=benchmark1'),import('./neural.js?v=live1')]);
 $('epochs').max=MAX_SANDBOX_EPOCHS;
 const epochsParam = params.get('epochs');
 if (/^\d+$/.test(epochsParam) && Number(epochsParam) >= 1 && Number(epochsParam) <= MAX_SANDBOX_EPOCHS) {
  $('epochs').value = Number(epochsParam);
 }
 const thresholdParam = params.get('threshold');
 if (thresholdParam?.trim() && Number.isFinite(Number(thresholdParam)) && Number(thresholdParam) >= 0 && Number(thresholdParam) <= 1) {
  $('threshold').value = Number(thresholdParam);
 }
 updateBenchmarkLinks();
 const engineParam=params.get('engine');
 if (engineParam==='cpu' || engineParam==='webgpu') $('engine').value=engineParam;
 $('train').max=deps[0].FIELD_LIMITS.train;
 $('validation').max=deps[0].FIELD_LIMITS.validation;
 $('gpu').textContent='Checking WebGPU · CPU training is ready';
 $('engine').addEventListener('change', updateRunAvailability);
 updateRunAvailability();
 void checkAdapter();
 $('status').textContent='Watch the pins as the detector learns. The results map lets you inspect a plant it found or missed.';
}catch(e){
 $('gpu').textContent='Training unavailable';$('stage').textContent='Training not ready';$('status').textContent=e.message;
}
function status(stage,detail,value){
 if($('stage').textContent!==stage)$('stage').textContent=stage;
 $('status').textContent=detail||'';
 if(Number.isFinite(value))$('progress').value=Math.min(100,Math.max(0,value));else $('progress').removeAttribute('value');
}
const requestedBand = params.get('missBand');
const replayMisses = [...$('missBand').options].some(option => option.value === requestedBand);
let auditTiles=[],fieldViews=new Map(),auditThreshold=.5, auditRayBudget=0, auditPeakAveraging;
function showField(){
 const field=auditTiles[Number($('auditField').value)];
 lastPreview=fieldViews.get(field?.tile_id);
 if(!lastPreview)return;
 const stage=$('overlayStage').value;
 const inspectingMisses = stage === 'misses';
 $('missControls').hidden = !inspectingMisses;
 $('peakTrace').hidden = true;
 if (inspectingMisses) {
  const {cm,withCropReturns} = selectedMisses();
  const boxIndices = visibleMisses();
  const band = $('missBand').value;
  if (band === 'all') {
   $('previewText').textContent = boxIndices.length+' missed at '+cm+' cm. '+withCropReturns+' had crop returns (red rings). '+(boxIndices.length-withCropReturns)+' had none (dark squares).';
  } else {
   const total = field.coverage[band];
   const description = $('missBand').selectedOptions[0].textContent;
   $('previewText').textContent = description+' · '+(total
    ? boxIndices.length+' of '+total+' plants missed at '+cm+' cm ('+(100*boxIndices.length/total).toFixed(1)+'%).'
    : 'No plants in this scan had that number of returns.');
  }
  $('inspectBox').hidden = true;
  $('missBox').disabled = !boxIndices.length;
  $('missBox').replaceChildren(new Option(boxIndices.length ? 'Show all listed misses' : 'No missed plants in this group',''), ...boxIndices.map(box => {
   const [x,y] = lastPreview.truth[box], returns = lastPreview.plantReturns[box];
   return new Option('Box '+box+' · x '+x.toFixed(2)+' m, y '+y.toFixed(2)+' m · '+returns+' crop returns', String(box));
  }));
  draw();
  return;
 }
 const count=lastPreview.stages[stage].length;
 $('previewText').textContent=field.seed+' · ground '+(field.ground?'present':'removed')+' · '+lastPreview.truth.length+' labeled plants (green rings) · '+count+' centers at this stage (red dots).';
 draw();
}
function selectedMisses(){
 return lastPreview.missesByTolerance.find(row => row.cm === Number($('missDistance').value));
}
function visibleMisses() {
 const boxes = selectedMisses().boxIndices;
 const band = $('missBand').value;
 return band === 'all' ? boxes : boxes.filter(box => returnBand(lastPreview.plantReturns[box]) === band);
}
function showPeakTrace(box) {
 const cm = Number($('missDistance').value);
 const {proposals, accepted, selected, bestScore} = deps[0].nearbyPeaks(lastPreview, box, cm);
 $('peakTitle').textContent = 'Box '+box+' · within '+cm+' cm of its center';
 $('nearProposals').textContent = proposals.length;
 $('nearAccepted').textContent = accepted.length;
 $('nearSelected').textContent = selected.length;
 const [cx,cy] = lastPreview.truth[box];
 const scale = 80 / (cm / 100);
 const marks = [];
 for (const [symbol, points] of [['peakDot',proposals], ['passedSquare',accepted], ['pinRing',selected]]) {
  for (const [x,y] of points) {
   const mark = document.createElementNS('http://www.w3.org/2000/svg', 'use');
   mark.setAttribute('href', '#'+symbol);
   mark.setAttribute('x', (x-cx)*scale);
   mark.setAttribute('y', (cy-y)*scale);
   marks.push(mark);
  }
 }
 $('peakMarks').replaceChildren(...marks);
 let message;
 if (!proposals.length) message = 'No peak lies within this distance. Changing the score cutoff alone cannot place a pin here.';
 else if (!accepted.length) message = 'Every nearby peak scored below the '+auditThreshold+' cutoff.';
 else if (!selected.length) message = 'Nearby peaks passed the cutoff, but the spacing filter removed them all.';
 else message = 'The scorer assigned every nearby final pin to another plant.';
 if (bestScore !== null) message += ' The highest nearby score rounds to '+bestScore.toFixed(3)+'.';
 $('traceText').textContent = message;
 $('peakTrace').hidden = false;
}
$('missBand').addEventListener('change',showField);
$('missBox').addEventListener('change', () => {
 const box = $('missBox').value;
 const link = $('inspectBox');
 link.hidden = box === '';
 const url = new URL($('inspectScan').href);
 if (box !== '') {
  url.searchParams.set('box', box);
  showPeakTrace(Number(box));
 } else $('peakTrace').hidden = true;
 link.href = url.href;
 draw();
});
$('missDistance').addEventListener('change',showField);
$('overlayStage').addEventListener('change',showField);
function scanViewerLink(tile, budget = auditRayBudget) {
 const scanQuery = new URLSearchParams({crop:tile.crop, ...plantSettings(tile), seed:tile.seed, sensor:tile.sensor, ground:tile.ground, tile:tile.tile_id});
 if (budget) scanQuery.set('budget', budget);
 if (auditPeakAveraging === 'occupied') scanQuery.set('peakAveraging', 'occupied');
 return '../?'+scanQuery+'#field';
}
function showStages(){
 const tile=auditTiles[Number($('auditField').value)];
 if(!tile)return;
 const totals=tile.byTolerance.at(-1);
 const labels=totals.tp+totals.fn;
 $('inspectScan').href = scanViewerLink(tile);
 $('scanCounts').textContent = tile.requestedRays.toLocaleString()+' rays requested · '+tile.sampledRays.toLocaleString()+' sampled · '+tile.returnCount.toLocaleString()+' scan returns · '+labels+' labeled plants · tile '+tile.tile_id;
 const pins = totals.tp + totals.fp;
 const delta = pins - labels;
 const difference = delta === 0 ? 'exact total' : Math.abs(delta)+' too '+(delta > 0 ? 'many' : 'few');
 $('scanPlantCount').textContent = pins+' final pins for '+labels+' plants ('+difference+'). At 15 cm, '+totals.fp+' pins were extra and '+totals.fn+' plants were missed.';
 const {zero, oneToFour, fiveOrMore} = tile.coverage;
 $('plantCoverage').textContent = 'Of '+labels+' labeled plants, '+zero+' had no crop returns, '+oneToFour+' had 1–4, and '+fiveOrMore+' had at least 5.';
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
 $('firstRun').hidden=true;$('scored').hidden=true;$('runReview').hidden=true;$('reviewLink').hidden=true;
 $('charts').hidden = false;
 $('groundStudy').hidden = true;
 $('groundStudy').open = false;

 $('peakTrace').hidden = true; $('missControls').hidden = true; $('missDistance').value = '15'; $('missBand').value = replayMisses ? requestedBand : 'all'; $('missBox').replaceChildren();
 $('harvest').textContent='';auditTiles=[];fieldViews.clear();$('overlayStage').value=replayMisses ? 'misses' : 'selected';$('stageAudit').hidden=true;
 losses=[];$('weightInspector').hidden=true;$('weightInspector').open=false;$('downloadWeights').hidden=true;lastPreview=null;lastRun=null;lastPaint=0;$('downloadRun').hidden=true;$('downloadSettings').hidden=true;$('benchmark').hidden=true;$('exportText').hidden=true;$('exportText').open=false;$('reportText').value='';$('copyReport').textContent='Copy JSON';
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
 if (losses.length) {
  const hi = Math.max(1e-9,...losses.map(p=>p.loss));
  const x = epoch => b+(epoch-1)*(w-2*b)/Math.max(1,losses.at(-1).epoch-1);
  const y = loss => h-b-loss/hi*(h-2*b);
  g.strokeStyle='#2d5738';g.lineWidth=2;g.beginPath();
  losses.forEach((p,i)=>i?g.lineTo(x(p.epoch),y(p.loss)):g.moveTo(x(p.epoch),y(p.loss)));g.stroke();
  const last=losses.at(-1);g.fillStyle='#2d5738';g.beginPath();g.arc(x(last.epoch),y(last.loss),3,0,2*Math.PI);g.fill();
 }
 [g,w,h]=frame('preview');
 const side=Math.max(1,Math.min(w-18,h-18)), left=(w-side)/2,top=(h-side)/2;
 g.strokeStyle='#c5d0c0';g.strokeRect(left,top,side,side);
 if(lastPreview){
 const plot=(list,color,r,ring=false)=>{g.fillStyle=g.strokeStyle=color;g.lineWidth=1.1;for(const v of list||[]){const c=coords(v);if(!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))continue;g.beginPath();g.arc(left+c[0]*side/10,top+side-c[1]*side/10,r,0,2*Math.PI);if(ring)g.stroke();else g.fill()}};
 plot(lastPreview.points,'#acbba8',.65);
 const stage = $('overlayStage').value;
 if (stage === 'misses') {
  const selectedBox = $('missBox').value;
  for (const box of visibleMisses()) {
   const [x,y] = lastPreview.truth[box];
   const px = left+x*side/10, py = top+side-y*side/10;
   if (String(box) === selectedBox) {
    g.strokeStyle = '#152c62'; g.lineWidth = 2; g.beginPath(); g.arc(px,py,8,0,2*Math.PI); g.stroke();
   }
   g.lineWidth = 1.2;
   if (lastPreview.plantReturns[box] > 0) {
    g.strokeStyle = '#b92e35'; g.beginPath(); g.arc(px,py,3,0,2*Math.PI); g.stroke();
   } else {
    g.strokeStyle = '#26334e'; g.strokeRect(px-3,py-3,6,6);
   }
  }
 } else {
  plot(lastPreview.truth,'#386b46',3,true);plot(lastPreview.stages[stage],'#b92e35',1.6);
 }
 }
}
new ResizeObserver(draw).observe(document.querySelector('.viz'));draw();
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
function showFitData(set,weightCount,epochs) {
 const {stats} = set;
 const fields = stats.trainingExamplesByField;
 const plantingScans = new Map(set.manifest.filter(t=>t.split==='train' && t.recipe.ground).map(t=>[t.seed,t]));
 const counts = fields.map(f=>f.usedPositive+f.usedNegative);
 const maxCount = Math.max(...counts);
 $('fieldBars').replaceChildren(...counts.map(n=>{
   const bar = document.createElement('i');
   bar.style.height = (100*n/maxCount)+'%';
   return bar;
 }));
 $('fieldRange').textContent = 'One bar per practice field · '+Math.min(...counts).toLocaleString()+'–'+maxCount.toLocaleString()+' examples per field';
 const used = fields.filter(f=>f.usedPositive + f.usedNegative > 0).length;
 $('fitCounts').textContent = used+' of '+stats.trainFields+' practice fields contributed '+stats.samples.toLocaleString()+
   ' examples per epoch. Each example has 13 measurements around one height peak. The model fitted '+weightCount.toLocaleString()+
   ' weights and biases over '+(epochs*stats.samples).toLocaleString()+' example visits. '+stats.valFields+' separate fields were reserved for scoring.';
 $('fieldContributions').open = false;
 $('fitFields').replaceChildren(...fields.map(field=>{
   const row = document.createElement('tr');
   const seed = document.createElement('th');
   seed.scope = 'row';
   const tile = plantingScans.get(field.seed);
   const link = document.createElement('a');
   const budget = stats.trainingRayBudget ? tile.recipe.points : 0;
   link.href = scanViewerLink({crop:stats.crop,...plantSettings(stats),seed:field.seed,sensor:tile.recipe.sampling.key,ground:true,tile_id:tile.tile_id},budget);
   link.textContent = field.seed;
   link.target = '_blank';
   link.rel = 'noopener';
   link.setAttribute('aria-label','Open field '+field.seed+' in a new tab');
   seed.append(link);
   row.append(seed);
   for (const n of [field.usedPositive,field.usedNegative,field.usedPositive+field.usedNegative]) {
     const cell = document.createElement('td');
     cell.textContent = n.toLocaleString();
     row.append(cell);
   }
   return row;
 }));
}
function pickScore(scores,key,index){
 const x=Array.isArray(scores)?scores[index]:scores?.[key]??scores?.[String(key*100)]??scores?.[String(key*100)+'cm'];
 return typeof x==='number'?x:x?.f1??x?.fScore;
}
const requestedSoilMetric = params.get('soilMetric');
if ([...$('soilMetric').options].some(option => option.value === requestedSoilMetric)) {
 $('soilMetric').value = requestedSoilMetric;
}

function displayGroundStudy({byGround, tiles}) {
 const present = byGround.find(group => group.ground);
 const removed = byGround.find(group => !group.ground);
 const count = present.tileCount;
 $('groundSummary').textContent = 'Both columns use the same fitted model and the same '+count+' held-out '+(count === 1 ? 'field' : 'fields')+'.';
 const metric = $('soilMetric').value;
 const isCount = metric === 'meanAbsolute' || metric === 'meanSigned';
 const descriptions = {
  recall: 'Recall measures the share of labeled plants the detector found.',
  precision: 'Precision measures the share of predicted centers that matched a plant.',
  f1: 'F1 is the harmonic mean of precision and recall.',
  meanAbsolute: 'Distance between the final pin count and the labeled plant count. A negative change means removing soil improved the count.',
  meanSigned: 'Final pins minus labeled plants. A positive number means overcounting. The change shows how many pins soil removal added or removed per scan.'
 };
 $('soilMetricHelp').textContent = descriptions[metric];
 $('soilRowHeading').textContent = isCount ? 'Field seed' : 'Match distance';
 const values = [];
 if (isCount) {
  const bareBySeed = new Map(tiles.filter(tile => !tile.ground).map(tile => [tile.seed, tile]));
  const error = tile => {
   const {fp, fn} = tile.byTolerance[0];
   return metric === 'meanAbsolute' ? Math.abs(fp - fn) : fp - fn;
  };
  for (const tile of tiles.filter(tile => tile.ground)) {
   values.push([String(tile.seed), error(tile), error(bareBySeed.get(tile.seed)), tile]);
  }
  values.push(['Mean per scan', present.countError[metric], removed.countError[metric]]);
 } else {
  present.scores.forEach((score, i) => values.push([score.cm+' cm', 100*score[metric], 100*removed.scores[i][metric]]));
 }
 const body = $('groundRows');
 body.replaceChildren();
 for (const [label, withSoil, withoutSoil, tile] of values) {
  const row = body.insertRow();
  const heading = document.createElement('th');
  heading.scope = 'row';
  if (tile) {
   const link = document.createElement('a');
   link.href = scanViewerLink(tile);
   link.textContent = label;
   link.target = '_blank';
   link.rel = 'noopener';
   link.setAttribute('aria-label', 'Inspect planting '+label+' in 3D (new tab)');
   heading.append(link);
  } else heading.textContent = label;
  row.append(heading);
  const change = withoutSoil - withSoil;
  const digits = isCount && label !== 'Mean per scan' ? 0 : 1;
  for (const value of [withSoil, withoutSoil]) row.insertCell().textContent = value.toFixed(digits)+(isCount ? '' : '%');
  row.insertCell().textContent = (change > 0 ? '+' : '')+change.toFixed(digits)+(isCount ? '' : ' pp');
 }
 $('soilUnits').textContent = isCount ? 'Counts are in plants per scan. Select a field seed to compare its scans in the 3D viewer.' : 'Changes are in percentage points.';
 $('groundStudy').hidden = false;
}
$('soilMetric').addEventListener('change', () => {
 if (lastRun) displayGroundStudy(lastRun);
});
function display(v,threshold,validationRayBudget,peakAveraging){
 $('runReview').hidden=false;$('reviewLink').hidden=false;$('scored').hidden=false;
 auditRayBudget=validationRayBudget;
 auditPeakAveraging=peakAveraging;
 auditThreshold=threshold;
 displayGroundStudy(v);
 if (requestedSoilMetric === $('soilMetric').value) $('groundStudy').open = true;
 for(const [i,k,id] of [[0,.075,'s75'],[1,.10,'s10'],[2,.15,'s15']]){
  const x=pickScore(v?.scores??v?.metrics??v,i===0?.075:k,i);
  if(Number.isFinite(x))$(id).textContent=(x*100).toFixed(1)+'%';
  const row=v?.scores?.[i],pc=n=>Number.isFinite(n)?(n*100).toFixed(0)+'%':'—';
  if(row)$('d'+id.slice(1)).textContent='Precision '+pc(row.precision)+' · Recall '+pc(row.recall);
 }
 const {tp,fp,fn}=v.scores.find(score=>score.cm===15);
 $('matchStory').textContent='Across '+v.tiles.length+' new synthetic scans, your detector placed a pin within 15 cm of '+
  tp.toLocaleString()+' of '+(tp+fn).toLocaleString()+' labeled centers. That left '+fp.toLocaleString()+' extra pins and '+fn.toLocaleString()+' missed centers.';
 const recall=t=>{const {tp,fn}=t.byTolerance.at(-1);return tp/(tp+fn||1)};
 fieldViews=v.previews;
 auditTiles=[...v.tiles].sort((a,b)=>recall(a)-recall(b));
 $('auditField').replaceChildren(...auditTiles.map((t,i)=>new Option(
  t.seed+' · '+t.sensor+' · ground '+(t.ground?'present':'removed'),String(i))));
 showStages();$('stageAudit').hidden=false;
 $('resultNote').textContent='Across '+v.tiles.length+' held-out synthetic scans, the final pin count differed from the labeled plant count by '+v.countError.meanAbsolute.toFixed(1)+' plants per scan on average (absolute error).';draw();
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
$('downloadWeights').onclick=()=>{
 if(lastRun)downloadJSON(weightArtifact(lastRun),'crop-weights-'+lastRun.settings.crop+'-'+lastRun.seed+'.json');
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
function readSettings() {
 const model = modelSettings();
 return {...model,crop:$('crop').value,...readPlantControls(),
  ...($('peakAveraging').value === 'occupied' ? {peakAveraging:'occupied'} : {}),seed:$('seed').valueAsNumber,
  trainFields:$('train').valueAsNumber,valFields:$('validation').valueAsNumber,sensorMode:$('scanner').value,
  validationSensorMode:$('validationSensor').value === 'follow' ? undefined : $('validationSensor').value,
  trainingRayBudget:trainingRayValue($('trainingRayBudget')),validationRayBudget:Number($('validationRayBudget').value),
  minimumHeight:Number($('peakHeight').value),threshold:$('threshold').valueAsNumber};
}
function selectedBackend() {
 return $('engine').value==='webgpu' || ($('engine').value==='auto' && webgpuAvailable) ? 'WebGPU' : 'CPU';
}
function workload() {
 const settings=readSettings(), backend=selectedBackend(), timed=$('stopMode').value==='time';
 const epochs=$('epochs').valueAsNumber, ms=$('minutes').valueAsNumber*60000;
 if (![settings.trainFields,settings.valFields,timed?ms:epochs].every(n=>Number.isFinite(n)&&n>0)) {
  $('workload').textContent='';$('estimateText').textContent='Enter field counts and a run length to estimate the time.';return;
 }
 $('workload').textContent=settings.trainFields+' practice fields + '+settings.valFields+' test fields · '+
   (2*(settings.trainFields+settings.valFields)).toLocaleString()+' scans · '+
   (timed?duration(ms)+' of training':epochs.toLocaleString()+' epochs');
 const key=JSON.stringify([settings,backend]);
 if(calibration?.key === key){
  const fit=timed?ms:epochs*calibration.perEpoch;
  $('estimateText').textContent='Estimated total '+duration(calibration.overhead+fit)+' on '+backend+
    ' · '+duration(calibration.overhead)+' setup and scoring. Based on this device’s last measurement.';
 }else{
  $('estimateText').textContent=timed?'Field generation and scoring take extra time. Time a trial for an estimate on this device.':
    'Time a 16-epoch trial to estimate this run on your device.';
 }
}
function setStopMode(){
 const timed=$('stopMode').value==='time';
 $('epochsLabel').hidden=timed;$('epochs').disabled=timed;
 $('minutesLabel').hidden=!timed;$('minutes').disabled=!timed;
}
function syncRunPreset() {
 const mode=$('stopMode').value;
 const length=$(mode==='time'?'minutes':'epochs').valueAsNumber;
 const selected=Object.keys(runPresets).find(name=>{
  const plan=runPresets[name];
  return plan.stopMode===mode && plan.length===length && plan.train===$('train').valueAsNumber &&
    plan.validation===$('validation').valueAsNumber;
 });
 $('runPreset').value=selected ?? 'custom';
}
$('runPreset').addEventListener('change',()=>{
 if($('runPreset').value==='custom'){
  $('fitOptions').open=true;
  $('datasetOptions').open=true;
  $('stopMode').focus();
  return;
 }
 applyRunPreset($('runPreset').value);
 updateBenchmarkLinks();
 workload();
});
$('stopMode').addEventListener('input',setStopMode);
for(const id of ['stopMode','epochs','minutes','train','validation']) $(id).addEventListener('input',syncRunPreset);
syncRunPreset();
$('controls').addEventListener('input',workload);
$('controls').addEventListener('invalid',event=>{
 for(let node=event.target.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
},true);
$('stress').onclick=()=>{
 $('train').value=128;$('validation').value=64;$('epochs').value=5000;$('stopMode').value='epochs';
 setStopMode();syncRunPreset();$('scanner').value='mixed';describeScanner();updateBenchmarkLinks();workload();
};
$('finish').onclick=()=>{finishTraining?.();$('finish').disabled=true;};
$('estimate').onclick=()=>{if($('controls').reportValidity()) runFit(true);};
$('controls').onsubmit=e=>{e.preventDefault();runFit(false);};
workload();
async function runFit(trial){
 if(controller||!backendReady)return;
 const [{buildDataset,validateModel,detectionStages},,{trainNetworkGPU,predictNetwork}]=deps;
 const settings=readSettings(), backend=selectedBackend(), requestedBackend=$('engine').value;
 const {crop,seed,threshold,validationRayBudget,minimumHeight,sensorMode}=settings;
 const targetEpochs=trial?16:$('epochs').valueAsNumber;
 const timeLimitMs=!trial && $('stopMode').value==='time'?$('minutes').valueAsNumber*60000:0;
 const key=JSON.stringify([settings,backend]);
 controller=new AbortController();const {signal}=controller;
 const locked=[...$('controls').querySelectorAll('input,select,button')].filter(el=>!el.disabled && !sceneHost.contains(el));
 locked.forEach(el=>el.disabled=true);
 $('cancel').disabled=false;
 if(!trial)clear();
 live.reset();
 live.show({title:'Growing '+cropProfile(crop).name,metric:'Preparing terrain',detail:'Seed '+seed,legend:'Sampled laser returns',fraction:0});
 if(narrow.matches && sceneHost.getBoundingClientRect().bottom>innerHeight)sceneHost.scrollIntoView({block:'end'});
 let previewCloud, lastFrame=-Infinity;

 status(trial?'Timing a trial':'Generating fields','Building separate training and validation fields.',0);
 try{
  const start=performance.now();
  const scans=scanSession(signal);
  const set=await buildDataset({...settings,signal,generate:(recipe,step)=>{
   const showRows=step.done===1 || recipe.points>100000;
   return scans.generate(recipe,showRows ? frame=>live.show({title:step.split+' field',cloud:frame.cloud,
    metric:'Row '+frame.row+' / '+frame.rows,legend:'Building the canopy',detail:'Seed '+recipe.seed,
    fraction:(step.done-1+frame.row/frame.rows)/step.total}) : undefined);
  },onScan:(scan,step)=>{
   if(!step.firstValidation && step.done!==step.total && performance.now()-lastFrame<150)return;
   const cloud=sampleCloud(scan.xyz,scan.cls);
   if(step.firstValidation) previewCloud=cloud;
   live.show({title:step.split+' field',cloud,metric:step.done+' / '+step.total+' scans',
    legend:'Green · crop returns',detail:scan.labels.num_points.toLocaleString()+' returns · seed '+scan.p.seed,fraction:step.done/step.total});
   lastFrame=performance.now();
  },onProgress:(a,b)=>{
   if(signal.aborted)return;
   if(a.stage==='labels'){status('Labeling training examples',a.done+' / '+a.total+' training scans labeled',27+3*a.done/a.total);return;}
   const current=typeof a==='object'?a.current??a.completed??a.done:a,total=typeof a==='object'?a.total:b;
   status('Generating fields',Number.isFinite(current)&&Number.isFinite(total)?current+' / '+total+' scan variants':'Preparing examples…',total>0&&Number.isFinite(current)?27*current/total:undefined);
  }}).finally(scans.close);
  const generated=performance.now();
  signal.throwIfAborted();status('Training on '+backend,'Starting '+backend+' training…',30);
  const tile=set.validation[0];
  const fieldsUsed=set.stats.trainingExamplesByField.filter(field=>field.usedPositive+field.usedNegative>0).length;
  live.show({title:'Fitting on '+fieldsUsed+' of '+set.stats.trainFields+' fields',cloud:previewCloud,metric:'Starting '+backend,
   detail:'Held-out field · seed '+tile.seed,legend:'Fixed preview · test field 1 of '+set.stats.valFields+' · predicted pins',fraction:0});
  const checkpoint=(epoch,weights)=>{
   if(signal.aborted)return;
   const scores=predictNetwork(tile.X,weights,set.dims,settings.hiddenLayers,settings.activation);
   const pins=detectionStages(tile,scores,threshold).selected;
   live.show({pins,detail:pins.length+' predicted · epoch '+epoch.toLocaleString()+' · seed '+tile.seed});
  };
  let finish=false, warm=null, latest=null;
  const options={...settings,dims:set.dims,lr:settings.learningRate,epochs:timeLimitMs?40:targetEpochs,timeLimitMs};
  const ready=fn=>{finishTraining=fn;$('finish').hidden=trial;$('finish').disabled=trial;};
  const progress=p=>{
   latest=p;
   if(p.epoch===4)warm=p;
   if(signal.aborted || (!p.done && p.epoch!==1 && performance.now()-lastPaint<180))return;
   lastPaint=performance.now();
   const rate=warm && p.epoch>warm.epoch?(p.elapsedMs-warm.elapsedMs)/(p.epoch-warm.epoch):p.elapsedMs/p.epoch;
   const remaining=timeLimitMs?Math.max(0,timeLimitMs-p.elapsedMs):Math.max(0,targetEpochs-p.epoch)*rate;
   const fraction=timeLimitMs?p.elapsedMs/timeLimitMs:p.epoch/targetEpochs;
   live.show({metric:'Epoch '+p.epoch.toLocaleString()+' · loss '+p.loss.toFixed(3),fraction,loss:{epoch:p.epoch,loss:p.loss}});
   status(trial?'Timing '+backend+' trial':'Training on '+backend,set.stats.samples.toLocaleString()+' examples per epoch · Epoch '+p.epoch.toLocaleString()+
    (timeLimitMs?'':' / '+targetEpochs.toLocaleString())+' · '+duration(p.elapsedMs)+' elapsed · '+
    (p.epoch<4 && !timeLimitMs?'measuring speed…':'about '+duration(remaining)+' of training left'),30+55*Math.min(1,fraction));
   if(!trial){
    losses.push({epoch:p.epoch,loss:p.loss});
    if(losses.length>1024)losses=losses.filter((_,i)=>i%2===0);
    $('lossText').textContent='Epoch '+p.epoch.toLocaleString()+' · loss '+p.loss.toPrecision(4);
    draw();
   }
  };
  let fit;
  if(backend==='WebGPU'){
   ready(()=>{finish=true;});
   fit=await trainNetworkGPU(set.X,set.Y,{...options,signal,onEpoch:progress,onCheckpoint:checkpoint,shouldFinish:()=>finish});
  }else{
   fit=await trainInWorker(set.X,set.Y,options,signal,progress,ready,checkpoint);
  }
  const epochs=fit.epochsCompleted;
  finishTraining=null;$('finish').hidden=true;
  const trained=performance.now();
  signal.throwIfAborted();status('Validating held-out fields','Matching predicted centers to ground truth…',88);
  await new Promise(r=>setTimeout(r,0));
  const scores=await validateModel(set,fit.weights,{threshold,signal,predictScores:(x,w,d)=>predictNetwork(x,w,d,settings.hiddenLayers,settings.activation),onProgress:(a)=>{
   if(signal.aborted)return;
   live.show({title:'Checking plant centers',metric:a.done+' / '+a.total+' scans',
    cloud:null,flat:true,points:a.tile.points,pins:a.predictions,misses:a.missed.map(i=>a.tile.truth[i]),
    legend:'○ Prediction   × Missed at 15 cm',detail:'Top view · seed '+a.tile.seed,fraction:a.done/a.total});
   if(a?.total)status('Validating held-out fields',a.done+' / '+a.total+' scan variants scored',88+11*a.done/a.total);
  }});
  const finished=performance.now();
  signal.throwIfAborted();
  const perEpoch=warm && epochs>warm.epoch?(latest.elapsedMs-warm.elapsedMs)/(epochs-warm.epoch):latest.elapsedMs/epochs;
  calibration={key,perEpoch,overhead:Math.max(0,finished-start-latest.elapsedMs)};
  live.show({title:trial?'Trial harvest':'Harvest complete',metric:(100*scores.meanF1).toFixed(1)+'% mean F1',fraction:1});
  if(trial){
   status('Trial complete','Timed 16 training epochs and scored the validation fields. See the estimate in Run setup.',100);
   return;
  }
  losses=fit.loss.map((loss,i)=>({epoch:fit.lossEpochs[i],loss}));
  if(losses.length>1024){const skip=Math.ceil(losses.length/1024);losses=losses.filter((_,i)=>i%skip===0||i===losses.length-1);}
  display(scores,threshold,validationRayBudget,settings.peakAveraging);
  const timings={generationMs:generated-start,trainingMs:trained-generated,validationMs:finished-trained,totalMs:finished-start};
  displayBenchmark(timings,fit.backend,epochs,set.stats.samples);
  showFitData(set,fit.weights.length,epochs);
  settings.epochs=epochs;
  const trainer=trainerId(settings);
  lastRun={schema:3,settings,trainer,domain:'synthetic',backend:fit.backend,adapter:fit.adapter,requestedBackend,webgpuAvailable,sensorMode,
   runPlan:timeLimitMs?{mode:'time',minutes:timeLimitMs/60000}:{mode:'epochs',epochs:targetEpochs},
   samplePasses:epochs*set.stats.samples,timings,epochsPerSecond:epochs*1000/timings.trainingMs,seed,epochs,
   learningRate:settings.learningRate,threshold,minimumHeight,stats:set.stats,recipeManifest:set.manifest,scaling:set.scaling,
   weights:Array.from(fit.weights),loss:fit.loss,lossEpochs:fit.lossEpochs,meanF1:scores.meanF1,scores:scores.scores,
   countError:scores.countError,byGround:scores.byGround,byField:scores.byField,tiles:scores.tiles};
  let earned=[];
  try{
   const farm=JSON.parse(localStorage.getItem('crop-trainer-farm-v1')||'{"seeds":[],"mixed":false}');
   farm.seeds=[...new Set([...farm.seeds,seed])];farm.mixed||=sensorMode==='mixed';
   localStorage.setItem('crop-trainer-farm-v1',JSON.stringify(farm));
   earned=['First harvest',...(farm.mixed?['Field scout']:[]),...(farm.seeds.length>=2?['Seed saver']:[])];
  }catch{}
  $('harvest').textContent=earned.length?'Farm journal · '+earned.join(' / '):'Harvest complete';
  setFieldTestModel(weightArtifact(lastRun),seed);
  inspectWeights(lastRun.weights,settings.hiddenLayers);
  $('downloadWeights').hidden=false;$('downloadRun').hidden=false;$('downloadSettings').hidden=false;$('exportText').hidden=false;
  status('Run complete',backend+' training · '+(scores.meanF1*100).toFixed(1)+'% mean F1 on held-out synthetic scans.',100);
 }catch(err){
  live.show({title:signal.aborted?'Run canceled':'Run interrupted',metric:'Last preview'});
  if(signal.aborted){status('Canceled',trial?'Timing trial stopped.':'Training stopped.',0);if(!trial)$('resultNote').textContent='This run was canceled.'}
  else{status('Run failed',String(err?.message||err)+(backend==='WebGPU'?' Choose CPU to retry.':''),0);if(!trial)$('resultNote').textContent='No validation result was produced.'}
 }finally{controller=null;finishTraining=null;locked.forEach(el=>el.disabled=false);$('cancel').disabled=true;$('finish').hidden=true;workload()}
};
