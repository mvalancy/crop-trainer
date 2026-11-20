import {DENSITY_HISTORY_KEY, densitySnapshot, pairDensityScores} from './density.js';
import {buildDataset, validateModel, compareMatchedBoxes} from '../trainer/data.js?v=densitymix1';
import {trainNetworkCPU, trainNetworkGPU, predictNetwork} from '../trainer/neural.js';
import {trainCPU, MAX_EPOCHS} from '../trainer/model.js';
import {cropProfile} from '../trainer/crops.js';
import {sensorOptions, validationSensorOptions, rayBudgetOptions, trainingRayOptions, trainingRayValue, ALTERNATING_BUDGET, DENSITY_BUDGETS} from '../trainer/sensors.js?v=densitymix1';

const $ = id => document.getElementById(id);
const formatTime = ms => (ms/1000).toFixed(2)+' s';
let controller, report, gpuAvailable = false;
sensorOptions($('sensor'), true);
validationSensorOptions($('validationSensor'));
const requested = new URLSearchParams(location.search);
$('includeMixed').checked = requested.get('includeMixed') === '1';
for (const id of ['comparison', 'crop', 'sensor', 'validationSensor']) {
  const value = requested.get(id);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
trainingRayOptions($('trainingRayBudget'), requested.get('trainingRayBudget'));
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
  const compareDensity = $('comparison').value === 'density';
  $('mixedControl').hidden = !compareDensity;
  $('includeMixed').disabled = !compareDensity;
  $('trainingBudgetControl').hidden = compareDensity;
  $('trainingRayBudget').disabled = compareDensity;
  const compareDurations = $('comparison').value === 'epochs';
  $('epochControl').hidden = compareDurations;
  $('fitEpochs').disabled = compareDurations;
  const descriptions = {
    density: 'Compare CPU neural fits trained on the same plantings at 12,000 and 60,000 rays. Include a mixed fit to alternate budgets between training fields. Every fit scores the same held-out scans.',
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
  if (comparison === 'density') return row.trainingRayBudget === ALTERNATING_BUDGET ? 'Alternating 12k / 60k' : row.trainingRayBudget.toLocaleString()+' training rays';
  if (comparison === 'epochs') return row.epochs+' epochs';
  if (comparison === 'cutoffs') return 'Cutoff '+row.threshold;
  if (comparison === 'models') return row.model === 'linear' ? 'Logistic' : 'Neural';
  return row.backend;
}
function appendRow(row, comparison, settings) {
  const tr=document.createElement('tr');
  const widest=row.scores.at(-1);
  tr.insertCell().textContent = row.seed;
  const modelCell = tr.insertCell();
  const modelLabel = comparison === 'density' ? contenderLabel(row, comparison) : row.model+' / '+row.backend;
  modelCell.textContent = modelLabel;
  const duration = tr.insertCell();
  const cutoff = tr.insertCell();
  duration.textContent = row.epochs;
  cutoff.textContent = row.threshold;
  if (['density','epochs','cutoffs'].includes(comparison)) {
    const query = new URLSearchParams({
      crop:settings.crop, sensor:settings.sensorMode, seed:row.seed, epochs:row.epochs, threshold:row.threshold, engine:'cpu'
    });
    if (row.trainingRayBudget) query.set('trainingRayBudget', row.trainingRayBudget);
    if (settings.validationRayBudget) query.set('validationRayBudget', settings.validationRayBudget);
    if (settings.validationSensorMode) query.set('validationSensor', settings.validationSensorMode);
    const link = document.createElement('a');
    link.href = '../trainer/?'+query;
    const cell = {density:modelCell, epochs:duration, cutoffs:cutoff}[comparison];
    link.textContent = cell.textContent;
    link.setAttribute('aria-label', 'Replay '+modelLabel+' on seed '+row.seed+' with '+row.epochs+' epochs and cutoff '+row.threshold);
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
    for (const value of [row.seed, modelLabel, row.epochs, row.threshold, score.cm+' cm',
      score.precision.toFixed(4), score.recall.toFixed(4), score.f1.toFixed(4),
      score.tp, score.fp, score.fn]) {
      detail.insertCell().textContent = value;
    }
  }
}
function displayDensityStudy() {
  const body = $('densityRows');
  body.replaceChildren();
  const trainingCounts = new Map();
  let sampledCountChanged = false;
  for (const row of report.rows) {
    const dataset = report.datasets[row.datasetIndex];
    const sampled = dataset.recipeManifest.filter(tile => tile.split === 'train').map(tile => tile.sampledRays);
    const previous = trainingCounts.get(row.seed);
    if (previous && sampled.some((count, i) => count !== previous[i])) sampledCountChanged = true;
    trainingCounts.set(row.seed, sampled);
    const low = Math.min(...sampled), high = Math.max(...sampled);
    const range = low === high ? low.toLocaleString() : low.toLocaleString()+'–'+high.toLocaleString();
    const tr = body.insertRow();
    const requestedRays = row.trainingRayBudget === ALTERNATING_BUDGET ? '12k / 60k by field' : row.trainingRayBudget.toLocaleString();
    for (const value of [row.seed, requestedRays, range, dataset.stats.samples.toLocaleString(), row.meanF1.toFixed(4)]) {
      tr.insertCell().textContent = value;
    }
  }
  $('densityRepeats').replaceChildren();
  for (const budget of [12000, 60000]) {
    if (budget === report.settings.validationRayBudget) continue;
    const url = new URL(report.replayUrl);
    url.searchParams.set('validationRayBudget', budget);
    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Repeat with '+budget.toLocaleString()+' validation rays';
    $('densityRepeats').append(link);
  }
  $('mixedNote').hidden = !report.rows.some(row => row.trainingRayBudget === ALTERNATING_BUDGET);
  $('densityCapNote').hidden = sampledCountChanged;
  if (sampledCountChanged) {
    try { localStorage.setItem('crop-trainer-ray-scout', 'earned'); } catch {}
  }
  const snapshot = densitySnapshot(report);
  $('densityRepeatHelp').textContent = snapshot
    ? 'Run the other validation budget in this tab to compare each fit on sparse and dense scans.'
    : 'Run both fixed validation budgets below in this tab to compare each fit on sparse and dense scans.';
  let paired = [];
  if (snapshot) {
    try {
      const saved = sessionStorage.getItem(DENSITY_HISTORY_KEY);
      if (saved) paired = pairDensityScores(snapshot, JSON.parse(saved));
    } catch {}
    try { sessionStorage.setItem(DENSITY_HISTORY_KEY, JSON.stringify(snapshot)); } catch {}
  }
  const pairedRows = $('robustnessRows');
  pairedRows.replaceChildren();
  for (const row of paired) {
    const tr = pairedRows.insertRow();
    const budget = row.trainingRayBudget === ALTERNATING_BUDGET ? 'Alternating' : row.trainingRayBudget.toLocaleString();
    for (const value of [row.seed, budget, row.sparse.toFixed(4), row.dense.toFixed(4), row.lower.toFixed(4)]) {
      tr.insertCell().textContent = value;
    }
  }
  $('robustnessTable').hidden = !paired.length;
  $('densityStudy').hidden = false;
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
  const seedDatasets = new Map(datasets.map(dataset => [dataset.seed, dataset]));
  for (const dataset of seedDatasets.values()) {
    const contenders = new Map(rows.filter(row => row.seed === dataset.seed).map(row =>
      [contender(row), new Map(row.byField.map(field => [field.seed, field]))]));
    for (const seed of dataset.stats.fieldSeeds.validation) {
      const tr = $('fieldRows').insertRow();
      const field = contenders.get(columns[0]).get(seed);
      tr.insertCell().textContent = dataset.seed;
      const link = document.createElement('a');
      const scan = dataset.recipeManifest.find(tile => tile.split === 'validation' && tile.seed === seed && tile.recipe.ground);
      const query = new URLSearchParams({crop:settings.crop, seed, sensor:field.sensor, ground:true, tile:scan.tile_id});
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
function displayModelBoxes() {
  const [seed, tileId] = JSON.parse($('pairScan').value);
  const rows = report.rows.filter(row => row.seed === seed);
  const cm = Number($('pairDistance').value);
  const tileFor = model => rows.find(row => row.model === model).tiles.find(tile => tile.tile_id === tileId);
  const logistic = tileFor('linear'), neural = tileFor('neural');
  const {both, firstOnly:logisticOnly, secondOnly:neuralOnly, neither, firstFP, secondFP} = compareMatchedBoxes(logistic, neural, cm);
  $('pairCounts').replaceChildren();
  for (const count of [both, logisticOnly.length, neuralOnly.length, neither]) {
    $('pairCounts').insertCell().textContent = count;
  }
  $('pairExtras').textContent = 'Extra pins at '+cm+' cm · Logistic '+firstFP+' · Neural '+secondFP;
  const boxOptions = (boxes, model) => boxes.map(box => new Option(model+' only · box '+box, String(box)));
  $('pairBox').replaceChildren(new Option('Whole scan', ''), ...boxOptions(logisticOnly,'Logistic'), ...boxOptions(neuralOnly,'Neural'));
  $('pairBox').disabled = !logisticOnly.length && !neuralOnly.length;
  const query = new URLSearchParams({crop:report.settings.crop, seed:logistic.seed, sensor:logistic.sensor, ground:logistic.ground, tile:tileId});
  if (report.settings.validationRayBudget) query.set('budget', report.settings.validationRayBudget);
  $('pairViewer').href = '../?'+query+'#field';
  $('pairViewer').textContent = 'Open scan in 3D';
}
$('pairScan').addEventListener('change',displayModelBoxes);
$('pairDistance').addEventListener('change',displayModelBoxes);
$('pairViewer').addEventListener('click', () => {
  if ($('pairBox').value !== '') {
    try { localStorage.setItem('crop-trainer-model-scout', 'earned'); } catch {}
  }
});
$('pairBox').addEventListener('change', () => {
  const url = new URL($('pairViewer').href);
  const box = $('pairBox').value;
  if (box === '') url.searchParams.delete('box');
  else url.searchParams.set('box', box);
  $('pairViewer').href = url.href;
  $('pairViewer').textContent = box === '' ? 'Open scan in 3D' : 'Inspect box '+box+' in 3D';
});

$('benchForm').onsubmit = async event => {
  event.preventDefault(); if(controller)return;
  controller = new AbortController();
  const {signal} = controller;
  const seed=Number($('seed').value), crop=$('crop').value, sensorMode=$('sensor').value;
  const validationSensorMode = $('validationSensor').value === 'follow' ? undefined : $('validationSensor').value;
  const comparison=$('comparison').value;
  const trainingRayBudget = comparison === 'density' ? undefined : trainingRayValue($('trainingRayBudget'));
  const validationRayBudget = Number($('validationRayBudget').value);
  const settings={seed,crop,sensorMode,validationSensorMode,trainingRayBudget,validationRayBudget,trainFields:6,valFields:3,minimumHeight:cropProfile(crop).peakHeight};
  if (comparison !== 'epochs') settings.epochs = $('fitEpochs').valueAsNumber;
  const neuralCPU = {model:'neural', backend:'CPU', train:trainNetworkCPU};
  const includeMixed = comparison === 'density' && $('includeMixed').checked;
  const trainingBudgets = includeMixed ? [...DENSITY_BUDGETS, ALTERNATING_BUDGET] : DENSITY_BUDGETS;
  const comparisons = {
    backend: [neuralCPU, {model:'neural', backend:'WebGPU', train:trainNetworkGPU}],
    models: [{model:'linear', backend:'CPU', train:trainCPU}, neuralCPU],
    cutoffs: [neuralCPU],
    density: trainingBudgets.map(trainingRayBudget => ({...neuralCPU, trainingRayBudget})),
    epochs: [10, 40, 100].map(epochs => ({...neuralCPU, epochs}))
  };
  const contenders = comparisons[comparison];
  const thresholds = comparison === 'cutoffs' ? [.35, .5, .65] : [.5];
  const rows=[],datasets=[];
  $('replay').hidden = true;
  $('densityStudy').hidden = true;
  $('cutoffChanges').hidden = true;
  $('cutoffChanges').open = false;
  $('fieldDetails').hidden = true;
  $('fieldDetails').open = false;
  $('modelBoxes').hidden = true;
  $('modelBoxes').open = false;
  report=null;$('export').disabled=true;$('summary').textContent='';$('results').replaceChildren();
  $('scoreDetails').hidden = true;
  $('scoreRows').replaceChildren();
  for(const input of $('benchForm').elements)input.disabled=input.id!=='cancel';
  try {
    for(const offset of [0,1]){
      const runSeed=seed+offset;
      let set, generationMs, datasetIndex, validationIds;
      const order=offset?[...contenders].reverse():contenders;
      for(const contender of order){
        signal.throwIfAborted();
        const {model, backend, train, epochs = settings.epochs, trainingRayBudget = settings.trainingRayBudget} = contender;
        if (!set || comparison === 'density') {
          $('status').textContent='Growing fields for seed '+runSeed+'…';
          const start=performance.now();
          set=await buildDataset({...settings,seed:runSeed,trainingRayBudget,signal});
          generationMs=performance.now()-start;
          const ids=set.validation.map(tile => tile.tile_id);
          if (validationIds && (ids.length !== validationIds.length || ids.some((id,i) => id !== validationIds[i]))) {
            throw new Error('The two fits have different validation scans.');
          }
          validationIds=ids;
          datasetIndex=datasets.length;
          datasets.push({seed:runSeed,stats:set.stats,recipeManifest:set.manifest});
        }
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
            model, backend:fit.backend, datasetIndex, trainingRayBudget, epochs, trainingLoss:fit.loss.at(-1), threshold, seed:runSeed, generationMs, trainingMs,
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
    const seedCount = new Set(rows.map(row => row.seed)).size;
    const means = [...groups].map(([label, sum]) => label+' '+(sum/seedCount).toFixed(4));
    const adapter = rows.find(row => row.adapter)?.adapter;
    const device = adapter ? ' WebGPU adapter: '+[adapter.kind, adapter.description || adapter.architecture].filter(Boolean).join(' · ')+'.' : '';
    $('summary').textContent='Average mean F1 across both seeds: '+means.join(' · ')+'.'+device;
    const replay = new URL(location.pathname, location.origin);
    replay.search = new URLSearchParams({comparison, crop, sensor:sensorMode, seed});
    if (includeMixed) replay.searchParams.set('includeMixed', '1');
    if (trainingRayBudget) replay.searchParams.set('trainingRayBudget', trainingRayBudget);
    if (validationRayBudget) replay.searchParams.set('validationRayBudget', validationRayBudget);
    if (validationSensorMode) replay.searchParams.set('validationSensor', validationSensorMode);
    if (settings.epochs !== undefined && settings.epochs !== 40) replay.searchParams.set('epochs', settings.epochs);
    $('replay').href = replay.href;
    $('replay').hidden = false;
    report={schema:1,domain:'synthetic',comparison,thresholds,settings,replayUrl:replay.href,datasets,rows};
    if (comparison === 'density') displayDensityStudy();
    if (comparison === 'models') {
      const options = rows.filter(row => row.model === 'linear').flatMap(row => row.tiles.map(tile =>
        new Option('Run '+row.seed+' · field '+tile.seed+' · soil '+(tile.ground?'present':'removed'), JSON.stringify([row.seed,tile.tile_id]))));
      $('pairScan').replaceChildren(...options);
      displayModelBoxes();
      $('modelBoxes').hidden = false;
    }
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
