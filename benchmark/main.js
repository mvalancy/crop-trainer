import {DENSITY_HISTORY_KEY, HEIGHT_HISTORY_KEY, densitySnapshot, pairDensityScores} from './density.js?v=peakpair2';
import {buildDataset, validateModel, compareMatchedBoxes, coverageAtDistance, PEAK_HEIGHTS} from '../trainer/data.js?v=height1';
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
for (const id of ['comparison', 'crop', 'sensor', 'validationSensor', 'minimumHeight', 'fieldMetric', 'cutoffDistance']) {
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
  const compareHeights = $('comparison').value === 'heights';
  $('heightControl').hidden = compareHeights;
  $('minimumHeight').disabled = compareHeights;
  const compareDensity = $('comparison').value === 'density';
  $('mixedControl').hidden = !compareDensity;
  $('includeMixed').disabled = !compareDensity;
  $('trainingBudgetControl').hidden = compareDensity;
  $('trainingRayBudget').disabled = compareDensity;
  const compareDurations = $('comparison').value === 'epochs';
  $('epochControl').hidden = compareDurations;
  $('fitEpochs').disabled = compareDurations;
  const descriptions = {
    heights: 'Use identical raw scans and fit a new CPU neural detector for each minimum height. Lowering the height admits shorter peaks during both training and validation.',
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
  if (comparison === 'heights') return (100 * row.minimumHeight).toFixed(1)+' cm peaks';
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
  const modelLabel = ['density','heights'].includes(comparison) ? contenderLabel(row, comparison) : row.model+' / '+row.backend;
  modelCell.textContent = modelLabel;
  const duration = tr.insertCell();
  const cutoff = tr.insertCell();
  duration.textContent = row.epochs;
  cutoff.textContent = row.threshold;
  if (['density','epochs','cutoffs','heights'].includes(comparison)) {
    const query = new URLSearchParams({
      crop:settings.crop, sensor:settings.sensorMode, seed:row.seed, epochs:row.epochs, threshold:row.threshold, engine:'cpu'
    });
    query.set('minimumHeight', row.minimumHeight);
    if (row.trainingRayBudget) query.set('trainingRayBudget', row.trainingRayBudget);
    if (settings.validationRayBudget) query.set('validationRayBudget', settings.validationRayBudget);
    if (settings.validationSensorMode) query.set('validationSensor', settings.validationSensorMode);
    const link = document.createElement('a');
    link.href = '../trainer/?'+query;
    const cell = {heights:modelCell, density:modelCell, epochs:duration, cutoffs:cutoff}[comparison];
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
function displayValidationBudgets(container) {
  container.replaceChildren();
  for (const budget of DENSITY_BUDGETS) {
    if (budget === report.settings.validationRayBudget) continue;
    const url = new URL(report.replayUrl);
    url.searchParams.set('validationRayBudget', budget);
    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Repeat with '+budget.toLocaleString()+' validation rays';
    container.append(link);
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
  displayValidationBudgets($('densityRepeats'));
  $('mixedNote').hidden = !report.rows.some(row => row.trainingRayBudget === ALTERNATING_BUDGET);
  $('densityCapNote').hidden = sampledCountChanged;
  if (sampledCountChanged) {
    try { localStorage.setItem('crop-trainer-ray-scout', 'earned'); } catch {}
  }
  $('densityStudy').hidden = false;
}
function displayValidationComparison() {
  const heights = report.comparison === 'heights';
  const key = heights ? HEIGHT_HISTORY_KEY : DENSITY_HISTORY_KEY;
  const snapshot = densitySnapshot(report);
  const help = $(heights ? 'heightRepeatHelp' : 'densityRepeatHelp');
  help.textContent = snapshot
    ? 'Run the other validation budget in this tab to compare each fit on sparse and dense scans.'
    : 'Run both fixed validation budgets below in this tab to compare each fit on sparse and dense scans.';
  let paired = [];
  if (snapshot) {
    try {
      const otherBudget = snapshot.budget === 12000 ? 60000 : 12000;
      const saved = sessionStorage.getItem(key+'-'+otherBudget) ?? sessionStorage.getItem(key);
      if (saved) paired = pairDensityScores(snapshot, JSON.parse(saved));
    } catch {}
    try {
      sessionStorage.setItem(key+'-'+snapshot.budget, JSON.stringify(snapshot));
    } catch {
      help.textContent = 'This tab could not save the scores. Download each benchmark JSON to compare the budgets.';
    }
  }
  if (paired.length) {
    report.pairedValidation = {rayBudgets:[12000, 60000], rows:paired};
    $(heights ? 'heightStudy' : 'densityStudy').after($('robustnessTable'));
    help.textContent = 'Both budgets are in the comparison table below and in the JSON download.';
  }
  $('fitSetting').textContent = heights ? 'Minimum peak height' : 'Training rays';
  const pairedRows = $('robustnessRows');
  pairedRows.replaceChildren();
  for (const row of paired) {
    const tr = pairedRows.insertRow();
    let setting;
    if (heights) setting = (row.minimumHeight * 100).toFixed(1)+' cm';
    else setting = row.trainingRayBudget === ALTERNATING_BUDGET ? 'Alternating' : row.trainingRayBudget.toLocaleString();
    for (const value of [row.seed, setting, row.sparse.toFixed(4), row.dense.toFixed(4), row.lower.toFixed(4)]) {
      tr.insertCell().textContent = value;
    }
  }
  $('robustnessTable').hidden = !paired.length;
}
function displayHeightStudy() {
  const seed = report.settings.seed;
  const extraPins = new Map();
  const body = $('heightRows');
  body.replaceChildren();
  for (const row of report.rows) {
    const soil = row.byGround.find(group => group.ground);
    const final = soil.scores.find(score => score.cm === 15);
    if (row.seed === seed) extraPins.set(row.minimumHeight, final.fp);
    let peaks = 0, reachable = 0;
    for (const tile of row.tiles.filter(tile => tile.ground)) {
      const proposals = tile.stages15cm.find(stage => stage.stage === 'proposals');
      peaks += proposals.count;
      reachable += proposals.matched;
    }
    const tr = body.insertRow();
    for (const value of [row.seed, (100 * row.minimumHeight).toFixed(1)+' cm', final.tp+final.fn, peaks, reachable, final.tp, final.fp]) {
      tr.insertCell().textContent = value;
    }
  }
  const tall = extraPins.get(.065), short = extraPins.get(.035);
  const answer = tall === short ? 'tie' : tall < short ? '0.065' : '0.035';
  $('heightQuestion').textContent = 'On seed '+seed+', which height produced fewer extra pins?';
  $('heightAnswer').textContent = '';
  for (const button of $('heightAnswers').querySelectorAll('button')) {
    button.onclick = () => {
      if (button.value !== answer) {
        $('heightAnswer').textContent = 'Compare the two values in the Extra pins column for seed '+seed+' and try again.';
        return;
      }
      let feedback = 'Correct. The 6.5 cm fit had '+tall+' extra pins and the 3.5 cm fit had '+short+'.';
      try {
        localStorage.setItem('crop-trainer-peak-scout', 'earned');
        feedback += ' Peak scout stamp earned.';
      } catch {}
      $('heightAnswer').textContent = feedback;
    };
  }
  displayValidationBudgets($('heightRepeats'));
  $('heightStudy').hidden = false;
}
function displayCutoffCoverage(cm) {
  const summaries = report.thresholds.map(threshold => {
    const tiles = report.rows.filter(row => row.threshold === threshold)
      .flatMap(row => row.tiles.filter(tile => tile.ground));
    return coverageAtDistance(tiles, cm);
  });
  const body = $('coverageRows');
  body.replaceChildren();
  for (const [band, label] of [['zero','0 returns'], ['oneToFour','1–4 returns'], ['fiveOrMore','5 or more returns']]) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    tr.append(th);
    const total = summaries[0].groups[band].plants;
    tr.insertCell().textContent = total;
    for (const result of summaries) {
      const cell = tr.insertCell();
      const matched = result.groups[band].matched;
      cell.textContent = total ? matched : '—';
      if (total) {
        const meter = document.createElement('meter');
        meter.max = total;
        meter.value = matched;
        meter.setAttribute('aria-label', label + ' matched');
        meter.setAttribute('aria-valuetext', matched + ' of ' + total + ' plants');
        meter.title = (100 * matched / total).toFixed(1) + '% matched';
        cell.append(meter);
      }
    }
  }
  $('coverageFoot').replaceChildren();
  const tr = $('coverageFoot').insertRow();
  const th = document.createElement('th');
  th.scope = 'row';
  th.colSpan = 2;
  th.textContent = 'Extra pins';
  tr.append(th);
  for (const result of summaries) tr.insertCell().textContent = result.extraPins;
}
function displayCutoffChanges() {
  const cm = Number($('cutoffDistance').value);
  const signed = count => count > 0 ? '+'+count : String(count);
  const scoreAtDistance = row => row.scores.find(score => score.cm === cm);
  displayCutoffCoverage(cm);
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
$('cutoffDistance').addEventListener('change', () => {
  if (report?.comparison !== 'cutoffs') return;
  displayCutoffChanges();
  const url = new URL(report.replayUrl);
  url.searchParams.set('cutoffDistance', $('cutoffDistance').value);
  report.replayUrl = $('replay').href = url.href;
});
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
  const countMetric = metric === 'meanAbsolute' || metric === 'meanSigned';
  $('countHelp').hidden = !countMetric;
  $('countHelp').textContent = metric === 'meanAbsolute'
    ? 'Average number of plants the count is off by per scan. Lower is better. Each planting contributes a scan with soil and one without.'
    : 'Final pins minus labeled plants, averaged per scan. Positive values mean overcounting. Overcounts and undercounts can cancel.';
  const formatCount = value => (metric === 'meanSigned' && value > 0 ? '+' : '') + value.toFixed(1);
  const seedDatasets = new Map(datasets.map(dataset => [dataset.seed, dataset]));
  for (const dataset of seedDatasets.values()) {
    const group = rows.filter(row => row.seed === dataset.seed);
    const contenders = new Map(group.map(row =>
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
        if (countMetric) tr.insertCell().textContent = formatCount(result.countError[metric]);
        else {
          const f1 = metric === 'mean' ? result.meanF1 : result.scores.find(score => score.cm === Number(metric)).f1;
          tr.insertCell().textContent = f1.toFixed(4);
        }
      }
    }
    if (countMetric) {
      const total = $('fieldRows').insertRow();
      total.className = 'seedAverage';
      const label = document.createElement('th');
      label.scope = 'row';
      label.colSpan = 3;
      label.textContent = 'Seed '+dataset.seed+' · all '+dataset.stats.valTiles+' scans';
      total.append(label);
      for (const column of columns) {
        const row = group.find(row => contender(row) === column);
        total.insertCell().textContent = formatCount(row.countError[metric]);
      }
    }
  }
}
$('fieldMetric').addEventListener('change', () => {
  if (!report) return;
  displayFields();
  const url = new URL(report.replayUrl);
  if ($('fieldMetric').value === 'mean') url.searchParams.delete('fieldMetric');
  else url.searchParams.set('fieldMetric', $('fieldMetric').value);
  report.replayUrl = url.href;
  $('replay').href = url.href;
  for (const link of document.querySelectorAll('#densityRepeats a, #heightRepeats a')) {
    const repeat = new URL(url);
    repeat.searchParams.set('validationRayBudget', new URL(link.href).searchParams.get('validationRayBudget'));
    link.href = repeat.href;
  }
});
// Give each fit a stable column even when execution order reverses on seed two.
function boxFits(seed) {
  const rows = report.rows.filter(row => row.seed === seed);
  if (report.comparison === 'heights') return PEAK_HEIGHTS.map(height => rows.find(row => row.minimumHeight === height));
  return ['linear', 'neural'].map(model => rows.find(row => row.model === model));
}
function displayPairedBoxes() {
  const [seed, tileId] = JSON.parse($('pairScan').value);
  const [first, second] = boxFits(seed);
  const firstTile = first.tiles.find(tile => tile.tile_id === tileId);
  const secondTile = second.tiles.find(tile => tile.tile_id === tileId);
  const cm = Number($('pairDistance').value);
  const {both, firstOnly, secondOnly, neither, firstFP, secondFP} = compareMatchedBoxes(firstTile, secondTile, cm);
  const label = row => contenderLabel(row, report.comparison);
  $('pairFirst').textContent = label(first)+' only';
  $('pairSecond').textContent = label(second)+' only';
  $('pairCounts').replaceChildren();
  for (const count of [both, firstOnly.length, secondOnly.length, neither]) {
    $('pairCounts').insertCell().textContent = count;
  }
  $('pairExtras').textContent = 'Extra pins at '+cm+' cm · '+label(first)+' '+firstFP+' · '+label(second)+' '+secondFP;
  const boxOptions = (boxes, row) => boxes.map(box => new Option(label(row)+' only · box '+box, String(box)));
  $('pairBox').replaceChildren(new Option('Whole scan', ''), ...boxOptions(firstOnly,first), ...boxOptions(secondOnly,second));
  $('pairBox').disabled = !firstOnly.length && !secondOnly.length;
  const query = new URLSearchParams({crop:report.settings.crop, seed:firstTile.seed, sensor:firstTile.sensor, ground:firstTile.ground, tile:tileId});
  if (report.settings.validationRayBudget) query.set('budget', report.settings.validationRayBudget);
  $('pairViewer').href = '../?'+query+'#field';
  updateBoxLinks();
}
function displayHeightTurnover() {
  const cm = Number($('pairDistance').value);
  let fields = 0, gained = 0, lost = 0;
  for (const seed of new Set(report.rows.map(row => row.seed))) {
    const [tall, short] = boxFits(seed);
    for (const tile of tall.tiles.filter(tile => tile.ground)) {
      const paired = short.tiles.find(other => other.tile_id === tile.tile_id);
      const {firstOnly, secondOnly} = compareMatchedBoxes(tile, paired, cm);
      fields++;
      gained += secondOnly.length;
      lost += firstOnly.length;
    }
  }
  $('heightTurnover').textContent = 'Across '+fields+' soil-present fields at '+cm+' cm, lowering the peak height gained '+gained+' plant matches and lost '+lost+'.';
}
$('pairScan').addEventListener('change', displayPairedBoxes);
$('pairDistance').addEventListener('change', () => {
  displayPairedBoxes();
  if (report.comparison === 'heights') displayHeightTurnover();
});
$('pairViewer').addEventListener('click', () => {
  if (report?.comparison === 'models' && $('pairBox').value !== '') {
    try { localStorage.setItem('crop-trainer-model-scout', 'earned'); } catch {}
  }
});
function updateBoxLinks() {
  const url = new URL($('pairViewer').href);
  const box = $('pairBox').value;
  if (box === '') url.searchParams.delete('box');
  else url.searchParams.set('box', box);
  $('pairViewer').href = url.href;
  $('pairViewer').textContent = box === '' ? 'Open scan in 3D' : 'Inspect box '+box+' in 3D';
  const replay = new URL(report.replayUrl);
  replay.searchParams.set('pairSeed', JSON.parse($('pairScan').value)[0]);
  replay.searchParams.set('pairTile', url.searchParams.get('tile'));
  replay.searchParams.set('pairDistance', $('pairDistance').value);
  if (box !== '') replay.searchParams.set('pairBox', box);
  replay.hash = 'modelBoxes';
  $('sharePair').href = replay.href;
}
$('pairBox').addEventListener('change', updateBoxLinks);

$('benchForm').onsubmit = async event => {
  event.preventDefault(); if(controller)return;
  controller = new AbortController();
  const {signal} = controller;
  const seed=Number($('seed').value), crop=$('crop').value, sensorMode=$('sensor').value;
  const validationSensorMode = $('validationSensor').value === 'follow' ? undefined : $('validationSensor').value;
  const comparison=$('comparison').value;
  const trainingRayBudget = comparison === 'density' ? undefined : trainingRayValue($('trainingRayBudget'));
  const validationRayBudget = Number($('validationRayBudget').value);
  const settings={seed,crop,sensorMode,validationSensorMode,trainingRayBudget,validationRayBudget,trainFields:6,valFields:3};
  if (comparison !== 'heights') settings.minimumHeight = Number($('minimumHeight').value) || cropProfile(crop).peakHeight;
  if (comparison !== 'epochs') settings.epochs = $('fitEpochs').valueAsNumber;
  const neuralCPU = {model:'neural', backend:'CPU', train:trainNetworkCPU};
  const includeMixed = comparison === 'density' && $('includeMixed').checked;
  const trainingBudgets = includeMixed ? [...DENSITY_BUDGETS, ALTERNATING_BUDGET] : DENSITY_BUDGETS;
  const comparisons = {
    backend: [neuralCPU, {model:'neural', backend:'WebGPU', train:trainNetworkGPU}],
    models: [{model:'linear', backend:'CPU', train:trainCPU}, neuralCPU],
    cutoffs: [neuralCPU],
    heights: PEAK_HEIGHTS.map(minimumHeight => ({...neuralCPU, minimumHeight})),
    density: trainingBudgets.map(trainingRayBudget => ({...neuralCPU, trainingRayBudget})),
    epochs: [10, 40, 100].map(epochs => ({...neuralCPU, epochs}))
  };
  const contenders = comparisons[comparison];
  const thresholds = comparison === 'cutoffs' ? [.35, .5, .65] : [.5];
  const rows=[],datasets=[];
  $('replay').hidden = true;
  $('robustnessTable').hidden = true;
  $('heightStudy').hidden = true;
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
      let set, generationMs, datasetIndex, pairedIds;
      const order=offset?[...contenders].reverse():contenders;
      for(const contender of order){
        signal.throwIfAborted();
        const {model, backend, train, epochs = settings.epochs, minimumHeight = settings.minimumHeight, trainingRayBudget = settings.trainingRayBudget} = contender;
        if (!set || comparison === 'density' || comparison === 'heights') {
          $('status').textContent='Growing fields for seed '+runSeed+'…';
          const start=performance.now();
          set=await buildDataset({...settings,seed:runSeed,trainingRayBudget,minimumHeight,signal});
          generationMs=performance.now()-start;
          const pairedScans = comparison === 'heights' ? set.manifest : set.validation;
          const ids = pairedScans.map(tile => tile.tile_id);
          if (pairedIds && (ids.length !== pairedIds.length || ids.some((id,i) => id !== pairedIds[i]))) {
            throw new Error('The fits have different scans in their paired comparison.');
          }
          pairedIds=ids;
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
            model, backend:fit.backend, datasetIndex, minimumHeight, trainingRayBudget, epochs, trainingLoss:fit.loss.at(-1), threshold, seed:runSeed, generationMs, trainingMs,
            scoringMs:performance.now()-scoringStart, adapter:fit.adapter,
            meanF1:result.meanF1, scores:result.scores, countError:result.countError, byGround:result.byGround, byField:result.byField, tiles:result.tiles
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
    if ($('fieldMetric').value !== 'mean') replay.searchParams.set('fieldMetric', $('fieldMetric').value);
    if (comparison !== 'heights' && $('minimumHeight').value !== 'default') replay.searchParams.set('minimumHeight', settings.minimumHeight);
    if (includeMixed) replay.searchParams.set('includeMixed', '1');
    if (trainingRayBudget) replay.searchParams.set('trainingRayBudget', trainingRayBudget);
    if (validationRayBudget) replay.searchParams.set('validationRayBudget', validationRayBudget);
    if (validationSensorMode) replay.searchParams.set('validationSensor', validationSensorMode);
    if (settings.epochs !== undefined && settings.epochs !== 40) replay.searchParams.set('epochs', settings.epochs);
    if (comparison === 'cutoffs') replay.searchParams.set('cutoffDistance', $('cutoffDistance').value);
    $('replay').href = replay.href;
    $('replay').hidden = false;
    report={schema:1,domain:'synthetic',comparison,thresholds,settings,replayUrl:replay.href,datasets,rows};
    if (comparison === 'heights') displayHeightStudy();
    if (comparison === 'density') displayDensityStudy();
    if (comparison === 'heights' || comparison === 'density') displayValidationComparison();
    if (comparison === 'models' || comparison === 'heights') {
      const heights = comparison === 'heights';
      $('pairTitle').textContent = heights ? 'Which plants changed match when the peak height dropped?' : 'Which plants did each model find?';
      $('heightTurnover').hidden = !heights;
      const referenceRows = [...new Set(rows.map(row => row.seed))].map(seed => boxFits(seed)[0]);
      const options = referenceRows.flatMap(row => row.tiles.map(tile =>
        new Option('Run '+row.seed+' · field '+tile.seed+' · soil '+(tile.ground?'present':'removed'), JSON.stringify([row.seed,tile.tile_id]))));
      $('pairScan').replaceChildren(...options);
      const selected = options.find(option => {
        const [runSeed, tileId] = JSON.parse(option.value);
        return tileId === requested.get('pairTile') && (!requested.has('pairSeed') || String(runSeed) === requested.get('pairSeed'));
      });
      if (selected) {
        $('pairScan').value = selected.value;
        const distance = requested.get('pairDistance');
        if (['7.5','10','15'].includes(distance)) $('pairDistance').value = distance;
      }
      displayPairedBoxes();
      if (heights) displayHeightTurnover();
      if (selected) {
        const box = requested.get('pairBox');
        if ([...$('pairBox').options].some(option => option.value === box)) $('pairBox').value = box;
        updateBoxLinks();
      }
      $('modelBoxes').hidden = false;
      $('modelBoxes').open = Boolean(selected);
      if (selected && location.hash === '#modelBoxes') $('modelBoxes').scrollIntoView();
    }
    displayFields();
    $('fieldDetails').open = $('fieldMetric').value !== 'mean';
    $('fieldDetails').hidden = false;
    $('export').disabled=false;
    let stamp = '';
    if (comparison === 'cutoffs') {
      displayCutoffChanges();
      $('cutoffChanges').hidden = false;
      $('cutoffChanges').open = requested.has('cutoffDistance');
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
