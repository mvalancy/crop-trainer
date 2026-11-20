import {buildDataset, validateModel} from '../trainer/data.js';
import {trainNetworkCPU, trainNetworkGPU, predictNetwork} from '../trainer/neural.js';
import {trainCPU} from '../trainer/model.js';
import {cropProfile} from '../trainer/crops.js';
import {sensorOptions} from '../trainer/sensors.js';

const $ = id => document.getElementById(id);
const formatTime = ms => (ms/1000).toFixed(2)+' s';
let controller, report, gpuAvailable = false;
sensorOptions($('sensor'), true);
const requested = new URLSearchParams(location.search);
for (const id of ['comparison', 'crop', 'sensor']) {
  const value = requested.get(id);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= Number($('seed').max)) {
  $('seed').value = String(Number(requestedSeed));
}
try { gpuAvailable = Boolean(await navigator.gpu?.requestAdapter()); } catch {}
if (!gpuAvailable) {
  $('comparison').querySelector('[value="backend"]').disabled = true;
  $('comparison').value = 'models';
}
$('status').textContent = gpuAvailable ? 'WebGPU adapter available.' : 'CPU model comparison ready. This browser has no available WebGPU adapter.';
if (!gpuAvailable && requested.get('comparison') === 'backend') {
  $('status').textContent = 'This link requests CPU vs WebGPU. This browser has no available WebGPU adapter. The form is set to compare models on CPU.';
}
$('run').disabled = false;
$('cancel').onclick = () => controller?.abort();
$('export').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url;
  link.download = 'crop-benchmark-'+report.settings.crop+'-'+report.settings.seed+'.json';
  link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
};
function appendRow(row) {
  const tr=document.createElement('tr');
  const widest=row.scores.at(-1);
  for(const text of [row.seed,row.model+' / '+row.backend,formatTime(row.generationMs),
    formatTime(row.trainingMs),formatTime(row.scoringMs),row.meanF1.toFixed(4),
    (100*widest.precision).toFixed(1)+'% / '+(100*widest.recall).toFixed(1)+'%']){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
  }
  $('results').append(tr);
  $('scoreDetails').hidden = false;
  for (const score of row.scores) {
    const detail = $('scoreRows').insertRow();
    for (const value of [row.seed, row.model+' / '+row.backend, score.cm+' cm',
      score.precision.toFixed(4), score.recall.toFixed(4), score.f1.toFixed(4),
      score.tp, score.fp, score.fn]) {
      detail.insertCell().textContent = value;
    }
  }
}
$('benchForm').onsubmit = async event => {
  event.preventDefault(); if(controller)return;
  controller = new AbortController();
  const {signal} = controller;
  const seed=Number($('seed').value), crop=$('crop').value, sensorMode=$('sensor').value;
  const settings={seed,crop,sensorMode,trainFields:6,valFields:3,epochs:40,minimumHeight:cropProfile(crop).peakHeight};
  const comparison=$('comparison').value;
  const contenders=comparison==='backend'
    ? [{model:'neural',backend:'CPU',train:trainNetworkCPU},{model:'neural',backend:'WebGPU',train:trainNetworkGPU}]
    : [{model:'linear',backend:'CPU',train:trainCPU},{model:'neural',backend:'CPU',train:trainNetworkCPU}];
  const rows=[],datasets=[];
  $('replay').hidden = true;
  report=null;$('export').disabled=true;$('summary').textContent='';$('results').replaceChildren();
  $('scoreDetails').hidden = true;
  $('scoreRows').replaceChildren();
  for(const input of $('benchForm').elements)input.disabled=input.id!=='cancel';
  try {
    for(const offset of [0,1]){
      const runSeed=seed+offset;
      $('status').textContent='Growing fields for seed '+runSeed+'…';
      const start=performance.now();
      const set=await buildDataset({...settings,seed:runSeed,signal});
      const generationMs=performance.now()-start;
      datasets.push({seed:runSeed,stats:set.stats,recipeManifest:set.manifest});
      const order=offset?[...contenders].reverse():contenders;
      for(const contender of order){
        signal.throwIfAborted();
        const {model,backend,train}=contender;
        $('status').textContent='Training '+model+' on '+backend+' · seed '+runSeed;
        const before=performance.now();
        const fit=await train(set.X,set.Y,{dims:set.dims,epochs:settings.epochs,lr:.25,signal});
        const trained=performance.now();
        const result=await validateModel(set,fit.weights,{predictScores:model==='neural'?predictNetwork:undefined,signal});
        const row={model,backend:fit.backend,seed:runSeed,generationMs,trainingMs:trained-before,scoringMs:performance.now()-trained,
          adapter:fit.adapter,meanF1:result.meanF1,scores:result.scores,tiles:result.tiles};
        rows.push(row);appendRow(row);
      }
    }
    const means=contenders.map(c=>{
      const subset=rows.filter(r=>r.backend===c.backend&&r.model===c.model);
      return c.model+' / '+c.backend+' '+(subset.reduce((s,r)=>s+r.meanF1,0)/subset.length).toFixed(4);
    });
    const adapter = rows.find(row => row.adapter)?.adapter;
    const device = adapter ? ' WebGPU adapter: '+[adapter.kind, adapter.description || adapter.architecture].filter(Boolean).join(' · ')+'.' : '';
    $('summary').textContent='Average mean F1 across both seeds: '+means.join(' · ')+'.'+device;
    const replay = new URL(location.pathname, location.origin);
    replay.search = new URLSearchParams({comparison, crop, sensor:sensorMode, seed});
    $('replay').href = replay.href;
    $('replay').hidden = false;
    report={schema:1,domain:'synthetic',comparison,settings,replayUrl:replay.href,datasets,rows};
    $('export').disabled=false;$('status').textContent='Benchmark complete · four scored runs.';
  }catch(error){
    $('status').textContent=signal.aborted?'Canceled. Completed rows remain in Results.':'Benchmark failed. '+error.message;
  }finally{
    for(const input of $('benchForm').elements)input.disabled=input.id==='cancel';
    controller=null;
  }
};
