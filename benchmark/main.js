import {buildDataset, validateModel} from '../trainer/data.js?v=rays1';
import {trainNetworkCPU, trainNetworkGPU, predictNetwork} from '../trainer/neural.js';
import {trainCPU, MAX_EPOCHS} from '../trainer/model.js';
import {cropProfile} from '../trainer/crops.js';
import {sensorOptions, validationSensorOptions, rayBudgetOptions} from '../trainer/sensors.js?v=rays1';

const $ = id => document.getElementById(id);
const formatTime = ms => (ms/1000).toFixed(2)+' s';
let controller, report, gpuAvailable = false;
sensorOptions($('sensor'), true);
validationSensorOptions($('validationSensor'));
const requested = new URLSearchParams(location.search);
for (const id of ['comparison', 'crop', 'sensor', 'validationSensor']) {
  const value = requested.get(id);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
rayBudgetOptions($('validationRayBudget'), requested.get('validationRayBudget'));
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= Number($('seed').max)) {
  $('seed').value = String(Number(requestedSeed));
}
const requestedEpochs = requested.get('epochs');
$('fitEpochs').max = MAX_EPOCHS;
if (/^\d+$/.test(requestedEpochs) && Number(requestedEpochs) >= 1 && Number(requestedEpochs) <= MAX_EPOCHS) {
  $('fitEpochs').value = Number(requestedEpochs);
}
try { gpuAvailable = Boolean(await navigator.gpu?.requestAdapter()); } catch {}
if (!gpuAvailable) {
  $('comparison').querySelector('[value="backend"]').disabled = true;
  if ($('comparison').value === 'backend') $('comparison').value = 'models';
}
$('status').textContent = gpuAvailable ? 'WebGPU adapter available.' : 'CPU comparisons are available. This browser has no available WebGPU adapter.';
if (!gpuAvailable && requested.get('comparison') === 'backend') {
  $('status').textContent = 'This link requests CPU vs WebGPU. This browser has no available WebGPU adapter. The form is set to compare models on CPU.';
}
function explainComparison() {
  const compareDurations = $('comparison').value === 'epochs';
  $('epochControl').hidden = compareDurations;
  $('fitEpochs').disabled = compareDurations;
  const descriptions = {
    epochs: 'An epoch is one pass over the training examples. Fit the same CPU neural model from identical starting weights for 10, 40 and 100 epochs. Compare training loss with F1 on unseen fields.',
    cutoffs: 'Fit one CPU neural network per seed, then score the same weights at cutoffs of 0.35, 0.50 and 0.65. Select a cutoff in the results to replay that fit.',
    models: 'Fit logistic and neural models on CPU for the chosen number of epochs. Both use the same training examples and held-out fields.',
    backend: 'Fit the same neural model for the chosen number of epochs on CPU and WebGPU. Only training uses the selected backend.'
  };
  $('comparisonHelp').textContent = descriptions[$('comparison').value];
}
$('comparison').addEventListener('change', explainComparison);
explainComparison();
$('run').disabled = false;
$('cancel').onclick = () => controller?.abort();
$('export').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url;
  link.download = 'crop-benchmark-'+report.settings.crop+'-'+report.settings.seed+'.json';
  link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
};
function contenderLabel(row, comparison) {
  if (comparison === 'epochs') return row.epochs+' epochs';
  if (comparison === 'cutoffs') return 'Cutoff '+row.threshold;
  if (comparison === 'models') return row.model === 'linear' ? 'Logistic' : 'Neural';
  return row.backend;
}
function appendRow(row, comparison, settings) {
  const tr=document.createElement('tr');
  const widest=row.scores.at(-1);
  tr.insertCell().textContent = row.seed;
  tr.insertCell().textContent = row.model+' / '+row.backend;
  const duration = tr.insertCell();
  const cutoff = tr.insertCell();
  duration.textContent = row.epochs;
  cutoff.textContent = row.threshold;
  if (comparison === 'epochs' || comparison === 'cutoffs') {
    const query = new URLSearchParams({
      crop:settings.crop, sensor:settings.sensorMode, seed:row.seed, epochs:row.epochs, threshold:row.threshold, engine:'cpu'
    });
    if (settings.validationRayBudget) query.set('validationRayBudget', settings.validationRayBudget);
    if (settings.validationSensorMode) query.set('validationSensor', settings.validationSensorMode);
    const link = document.createElement('a');
    link.href = '../trainer/?'+query;
    const cell = comparison === 'epochs' ? duration : cutoff;
    link.textContent = cell.textContent;
    link.setAttribute('aria-label', 'Replay seed '+row.seed+' with '+row.epochs+' epochs and cutoff '+row.threshold);
    cell.replaceChildren(link);
  }
  for(const text of [formatTime(row.generationMs),
    formatTime(row.trainingMs),formatTime(row.scoringMs),row.trainingLoss.toFixed(4),row.meanF1.toFixed(4),
    (100*widest.precision).toFixed(1)+'% / '+(100*widest.recall).toFixed(1)+'%']){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
  }
  $('results').append(tr);
  $('scoreDetails').hidden = false;
  for (const score of row.scores) {
    const detail = $('scoreRows').insertRow();
    for (const value of [row.seed, row.model+' / '+row.backend, row.epochs, row.threshold, score.cm+' cm',
      score.precision.toFixed(4), score.recall.toFixed(4), score.f1.toFixed(4),
      score.tp, score.fp, score.fn]) {
      detail.insertCell().textContent = value;
    }
  }
}
function displayCutoffChanges() {
  const cm = Number($('cutoffDistance').value);
  const signed = count => count > 0 ? '+'+count : String(count);
  const scoreAtDistance = row => row.scores.find(score => score.cm === cm);
  $('cutoffRows').replaceChildren();
  for (const dataset of report.datasets) {
    const rows = report.rows.filter(row => row.seed === dataset.seed);
    const baseline = scoreAtDistance(rows.find(row => row.threshold === 0.5));
    for (const row of rows.sort((a, b) => a.threshold - b.threshold)) {
      if (row.threshold === 0.5) continue;
      const score = scoreAtDistance(row);
      const tr = $('cutoffRows').insertRow();
      for (const value of [row.seed, row.threshold, signed(score.tp - baseline.tp), signed(score.fp - baseline.fp)]) {
        tr.insertCell().textContent = value;
      }
    }
  }
}
$('cutoffDistance').addEventListener('change', displayCutoffChanges);
function displayFields() {
  const {comparison, datasets, rows, settings} = report;
  const contender = row => contenderLabel(row, comparison);
  const columns = rows.filter(row => row.seed === datasets[0].seed).map(contender);
  const headings = ['Dataset seed', 'Field seed', 'Layout', ...columns];
  $('fieldHeading').replaceChildren(...headings.map(label => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    return th;
  }));
  $('fieldRows').replaceChildren();
  const metric = $('fieldMetric').value;
  for (const dataset of datasets) {
    const contenders = new Map(rows.filter(row => row.seed === dataset.seed).map(row =>
      [contender(row), new Map(row.byField.map(field => [field.seed, field]))]));
    for (const seed of dataset.stats.fieldSeeds.validation) {
      const tr = $('fieldRows').insertRow();
      const field = contenders.get(columns[0]).get(seed);
      tr.insertCell().textContent = dataset.seed;
      const link = document.createElement('a');
      const query = new URLSearchParams({crop:settings.crop, seed, sensor:field.sensor, ground:true});
      if (settings.validationRayBudget) query.set('budget', settings.validationRayBudget);
      link.href = '../?'+query+'#field';
      link.textContent = seed;
      tr.insertCell().append(link);
      tr.insertCell().textContent = field.sensor;
      for (const column of columns) {
        const result = contenders.get(column).get(seed);
        const value = metric === 'mean' ? result.meanF1 : result.scores.find(score => score.cm === Number(metric)).f1;
        tr.insertCell().textContent = value.toFixed(4);
      }
    }
  }
}
$('fieldMetric').addEventListener('change', displayFields);
$('benchForm').onsubmit = async event => {
  event.preventDefault(); if(controller)return;
  controller = new AbortController();
  const {signal} = controller;
  const seed=Number($('seed').value), crop=$('crop').value, sensorMode=$('sensor').value;
  const validationSensorMode = $('validationSensor').value === 'follow' ? undefined : $('validationSensor').value;
  const validationRayBudget = Number($('validationRayBudget').value);
  const settings={seed,crop,sensorMode,validationSensorMode,validationRayBudget,trainFields:6,valFields:3,minimumHeight:cropProfile(crop).peakHeight};
  const comparison=$('comparison').value;
  if (comparison !== 'epochs') settings.epochs = $('fitEpochs').valueAsNumber;
  const neuralCPU = {model:'neural', backend:'CPU', train:trainNetworkCPU};
  const comparisons = {
    backend: [neuralCPU, {model:'neural', backend:'WebGPU', train:trainNetworkGPU}],
    models: [{model:'linear', backend:'CPU', train:trainCPU}, neuralCPU],
    cutoffs: [neuralCPU],
    epochs: [10, 40, 100].map(epochs => ({...neuralCPU, epochs}))
  };
  const contenders = comparisons[comparison];
  const thresholds = comparison === 'cutoffs' ? [.35, .5, .65] : [.5];
  const rows=[],datasets=[];
  $('replay').hidden = true;
  $('cutoffChanges').hidden = true;
  $('cutoffChanges').open = false;
  $('fieldDetails').hidden = true;
  $('fieldDetails').open = false;
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
        const {model, backend, train, epochs = settings.epochs} = contender;
        $('status').textContent='Training '+model+' on '+backend+' · '+epochs+' epochs · seed '+runSeed;
        const before=performance.now();
        const fit=await train(set.X,set.Y,{dims:set.dims,epochs,lr:.25,signal});
        const trained=performance.now();
        const trainingMs = trained - before;
        const cuts = offset ? [...thresholds].reverse() : thresholds;
        for (const threshold of cuts) {
          signal.throwIfAborted();
          $('status').textContent = 'Scoring seed '+runSeed+' at cutoff '+threshold+'…';
          const scoringStart = performance.now();
          const result = await validateModel(set, fit.weights, {
            threshold, predictScores:model === 'neural' ? predictNetwork : undefined, signal
          });
          const row = {
            model, backend:fit.backend, epochs, trainingLoss:fit.loss.at(-1), threshold, seed:runSeed, generationMs, trainingMs,
            scoringMs:performance.now()-scoringStart, adapter:fit.adapter,
            meanF1:result.meanF1, scores:result.scores, byGround:result.byGround, byField:result.byField, tiles:result.tiles
          };
          rows.push(row);
          appendRow(row, comparison, settings);
        }
      }
    }
    const groups = new Map();
    for (const row of rows) {
      const label = contenderLabel(row, comparison);
      groups.set(label, (groups.get(label) || 0) + row.meanF1);
    }
    const means = [...groups].map(([label, sum]) => label+' '+(sum/datasets.length).toFixed(4));
    const adapter = rows.find(row => row.adapter)?.adapter;
    const device = adapter ? ' WebGPU adapter: '+[adapter.kind, adapter.description || adapter.architecture].filter(Boolean).join(' · ')+'.' : '';
    $('summary').textContent='Average mean F1 across both seeds: '+means.join(' · ')+'.'+device;
    const replay = new URL(location.pathname, location.origin);
    replay.search = new URLSearchParams({comparison, crop, sensor:sensorMode, seed});
    if (validationRayBudget) replay.searchParams.set('validationRayBudget', validationRayBudget);
    if (validationSensorMode) replay.searchParams.set('validationSensor', validationSensorMode);
    if (settings.epochs !== undefined && settings.epochs !== 40) replay.searchParams.set('epochs', settings.epochs);
    $('replay').href = replay.href;
    $('replay').hidden = false;
    report={schema:1,domain:'synthetic',comparison,thresholds,settings,replayUrl:replay.href,datasets,rows};
    displayFields();
    $('fieldDetails').hidden = false;
    $('export').disabled=false;
    let stamp = '';
    if (comparison === 'cutoffs') {
      displayCutoffChanges();
      $('cutoffChanges').hidden = false;
      try {
        localStorage.setItem('crop-trainer-cutoff-scout', 'earned');
        stamp = ' Cutoff scout stamp earned.';
      } catch {}
    }
    $('status').textContent='Benchmark complete · '+rows.length+' scored results.'+stamp;
  }catch(error){
    $('status').textContent=signal.aborted?'Canceled. Completed rows remain in Results.':'Benchmark failed. '+error.message;
  }finally{
    for(const input of $('benchForm').elements)input.disabled=input.id==='cancel';
    explainComparison();
    controller=null;
  }
};
