import {backgroundLabels, backgroundFit, backgroundCutoff, backgroundWeights, prepareBackgroundPair, showBackgroundModels} from './background.js?v=cost1';
import {setupCutoffControls, displayCutoffChanges} from './cutoffs.js';
import {formsFor} from '../trainer/plants/forms.js';
import {samplingLabels, setupSamplingControls, checkSamplingPair, displaySamplingMix} from './sampling.js?v=negative1';
import {benchmarkView} from './watch.js?v=context-help2';
import {scanSession} from '../trainer/generator/scan-session.js?v=plants3';
import {setupPlantControls, setupValidationPlantForm, plantSettings} from '../trainer/generator/plant-version.js?v=orchard4';
import {CLASSIC_TRAINING_PAIR, TRAINING_RAY_PAIRS, DENSITY_HISTORY_KEY, HEIGHT_HISTORY_KEY, densitySnapshot, pairDensityScores} from './density.js?v=sampling1';
import {buildDataset, rescanValidation, validateModel, compareMatchedBoxes, PEAK_HEIGHTS} from '../trainer/models/data.js?v=sampling1';
import {trainNetworkCPU, trainNetworkGPU, predictNetwork} from '../trainer/models/neural.js';
import {trainCPU, MAX_EPOCHS} from '../trainer/models/model.js';
import {cropProfile} from '../trainer/generator/crops.js?v=systems1';
import {sensorOptions, validationSensorOptions, rayBudgetOptions, trainingRayOptions, trainingRayValue, ALTERNATING_BUDGET, DENSITY_BUDGETS} from '../trainer/generator/sensors.js?v=dense1';

const $ = id => document.getElementById(id);
const formatTime = ms => ms < 100 ? ms.toFixed(1)+' ms' : (ms/1000).toFixed(2)+' s';
const featureLabels = new Map([['absolute','Absolute height'],['local-ground','Local ground']]);
const averagingNames = new Map([['zero-filled','All cells'],['occupied','Sampled cells only']]);
const layoutNames = new Map([['reference','Reference grid'],['os1-64','OS1-64 rings']]);
const watch=benchmarkView($('benchWatch'));
$('watchCancel').onclick=()=>controller?.abort();
let controller, report, gpuState = 'checking', showingSetup = true;
sensorOptions($('sensor'), true);
validationSensorOptions($('validationSensor'));
const requested = new URLSearchParams(location.search);
const samplingControls = setupSamplingControls(requested);
const cutoffControls = setupCutoffControls(requested);
const proposedLengths = requested.has('shortEpochs') || requested.has('longEpochs');
$('benchOptions').open = ['plantArchitecture','plantForm','validationPlantForm','plantCondition','seed','sensor','validationSensor','trainingRayBudget','validationRayBudget','epochs','minimumHeight','peakAveraging','featureMode','sampleLimit','positiveSampling','trainingPair','includeMixed'].some(key=>requested.has(key));
// Earlier shared comparisons omit a geometry version. Keep their plantings
// reproducible. A fresh Benchmark uses the current plant architecture.
const replayKeys = ['comparison','crop','sensor','seed','epochs','trainingRayBudget','validationRayBudget',
  'validationSensor','minimumHeight','peakAveraging','featureMode','sampleLimit','positiveSampling','trainingPair','includeMixed','fieldMetric','cutoffDistance','live'];
function revealSettingsAnchor(hash) {
  const target = document.getElementById(hash.slice(1));
  const disclosure = target?.closest('#benchOptions,#benchExamples');
  if (!disclosure) return;
  disclosure.open = true;
  target.scrollIntoView({block:'start'});
}
revealSettingsAnchor(location.hash);
window.addEventListener('hashchange', () => revealSettingsAnchor(location.hash));
// Clicking the current fragment again does not dispatch hashchange.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (link?.href === location.href && link.hash) revealSettingsAnchor(link.hash);
});
$('benchOptions').addEventListener('invalid', () => { $('benchOptions').open = true; }, true);
$('livePreview').checked=requested.get('live')!=='off';
$('includeMixed').checked = requested.get('includeMixed') === '1';
const trainingPair = $('trainingPair');
for (const [key, budgets] of TRAINING_RAY_PAIRS) {
  trainingPair.add(new Option(budgets.map(n => n.toLocaleString()).join(' vs '), key));
}
trainingPair.value = requested.get('trainingPair') ?? CLASSIC_TRAINING_PAIR;
if (!trainingPair.value) {
  trainingPair.prepend(new Option('Unsupported pair · choose budgets', ''));
  trainingPair.value = '';
}
for (const id of ['comparison', 'crop', 'sensor', 'validationSensor', 'minimumHeight', 'fieldMetric', 'cutoffDistance']) {
  const value = requested.get(id);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
const readPlantControls = setupPlantControls($('crop'), $('plantArchitecture'), $('plantForm'), $('plantCondition'),
  requested, replayKeys.some(key => requested.has(key)) && !proposedLengths &&
  !(requested.get('comparison') === 'cutoffs' && requested.has('trialCutoff')) &&
  !['forms','features','sampling','negatives'].includes(requested.get('comparison')) ? 1 : 3);
const readValidationForm = setupValidationPlantForm($('validationPlantForm'), $('crop'), $('plantArchitecture'), $('plantForm'), requested);
trainingRayOptions($('trainingRayBudget'), requested.get('trainingRayBudget'));
rayBudgetOptions($('validationRayBudget'), requested.get('validationRayBudget'));
const layoutBudget = $('layoutBudget');
const sharedBudget = requested.get('validationRayBudget');
if ([...layoutBudget.options].some(option => option.value === sharedBudget)) layoutBudget.value = sharedBudget;
else if (requested.get('comparison') === 'layouts' && requested.has('validationRayBudget')) {
  layoutBudget.prepend(new Option('Choose a shared budget up to 60,000', ''));
  layoutBudget.value = '';
}
const featureSelect = $('featureMode');
if (requested.has('featureMode')) {
  featureSelect.value = requested.get('featureMode');
  if (!featureSelect.value) featureSelect.prepend(new Option('Choose a supported feature set', '', true, true));
}
const averagingControl = $('peakAveraging');
if (requested.has('peakAveraging')) {
  averagingControl.value = requested.get('peakAveraging');
  if (!averagingControl.value) averagingControl.prepend(new Option('Choose a supported peak rule', '', true, true));
}
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= Number($('seed').max)) {
  $('seed').value = String(Number(requestedSeed));
}
const requestedEpochs = requested.get('epochs');
$('fitEpochs').max = MAX_EPOCHS;
if (/^\d+$/.test(requestedEpochs) && Number(requestedEpochs) >= 1 && Number(requestedEpochs) <= MAX_EPOCHS) {
  $('fitEpochs').value = Number(requestedEpochs);
}
const gpuOption = $('comparison').querySelector('[value="backend"]');
const gpuQuestion = gpuOption.textContent;
gpuOption.disabled = true;
gpuOption.textContent = 'CPU vs WebGPU · checking';
function showReadyState() {
  showingSetup = true;
  const needsGpu = $('comparison').value === 'backend';
  $('run').disabled = needsGpu && gpuState !== 'available';
  if (gpuState === 'checking') $('status').textContent = needsGpu
    ? 'Checking WebGPU for this comparison. You can run a CPU question now.'
    : 'Ready to run on CPU. Checking WebGPU for the speed comparison.';
  else if (gpuState === 'unavailable') $('status').textContent = needsGpu
    ? 'This browser did not provide a WebGPU adapter. Choose a CPU question to run a benchmark.'
    : 'Ready to run on CPU. This browser did not provide a WebGPU adapter.';
  else $('status').textContent = 'Ready to run. CPU and WebGPU are available.';
}
async function discoverGpu() {
  let adapter;
  try { adapter = await navigator.gpu?.requestAdapter(); } catch {}
  gpuState = adapter ? 'available' : 'unavailable';
  gpuOption.disabled = !adapter;
  gpuOption.textContent = adapter ? gpuQuestion : 'WebGPU unavailable';
  // A slow discovery must not interrupt a run or replace its result.
  if (showingSetup) showReadyState();
}
const epochSchedule = $('epochSchedule'), shortEpochs = $('shortEpochs'), longEpochs = $('longEpochs');
if (proposedLengths) {
  shortEpochs.value = requested.get('shortEpochs') ?? '';
  longEpochs.value = requested.get('longEpochs') ?? '';
} else if (requested.get('comparison') === 'epochs') {
  // Public reports before editable schedules used the fixed three-fit trial.
  epochSchedule.value = 'classic';
}
function epochCounts() {
  return epochSchedule.value === 'classic' ? [10,40,100] : [shortEpochs.valueAsNumber,longEpochs.valueAsNumber];
}
function explainComparison() {
  samplingControls.show($('comparison').value === 'sampling', $('comparison').value === 'negatives');
  cutoffControls.show($('comparison').value === 'cutoffs');
  const compareForms = $('comparison').value === 'forms';
  const structured = Number($('plantArchitecture').value) >= 2;
  const form = $('plantForm'), heldOut = $('validationPlantForm');
  const mix = form.querySelector('[value="mixed"]');
  if (compareForms && structured && form.value === 'mixed') form.value = form.options[1].value;
  if (mix) mix.disabled = compareForms && structured;
  form.disabled = !structured && !!form.value;
  heldOut.disabled = !structured && !!heldOut.value;
  heldOut.querySelector('[value="follow"]').textContent = compareForms ? 'Selected training form' : 'Same as training';
  $('comparison').setCustomValidity(compareForms && !structured ? 'Choose structured plants to compare growth forms.' : '');
  const compareLayouts = $('comparison').value === 'layouts';
  $('validationLayoutControl').hidden = $('validationBudgetControl').hidden = compareLayouts;
  $('validationSensor').disabled = $('validationRayBudget').disabled = compareLayouts;
  $('layoutBudgetControl').hidden = layoutBudget.disabled = !compareLayouts;
  $('featureControl').hidden = featureSelect.disabled = $('comparison').value === 'features';
  $('averagingControl').hidden = averagingControl.disabled = $('comparison').value === 'averaging';
  const compareHeights = $('comparison').value === 'heights';
  $('heightControl').hidden = compareHeights;
  $('minimumHeight').disabled = compareHeights;
  const compareDensity = $('comparison').value === 'density';
  const budgets = TRAINING_RAY_PAIRS.get(trainingPair.value);
  const allowMixed = compareDensity && trainingPair.value === CLASSIC_TRAINING_PAIR;
  $('trainingPairControl').hidden = !compareDensity;
  trainingPair.disabled = !compareDensity;
  $('trainingPairHelp').hidden = !compareDensity || trainingPair.value !== '30k-1m';
  $('mixedControl').hidden = !allowMixed;
  $('includeMixed').disabled = !allowMixed;
  if (compareDensity && !allowMixed) $('includeMixed').checked = false;
  $('trainingBudgetControl').hidden = compareDensity;
  $('trainingRayBudget').disabled = compareDensity;
  const compareDurations = $('comparison').value === 'epochs';
  const editable = compareDurations && epochSchedule.value === 'pair';
  $('epochChoices').hidden = epochSchedule.disabled = !compareDurations;
  $('shortEpochControl').hidden = shortEpochs.disabled = !editable;
  $('longEpochControl').hidden = longEpochs.disabled = !editable;
  longEpochs.setCustomValidity(editable && longEpochs.valueAsNumber <= shortEpochs.valueAsNumber ? 'Choose more epochs than the short fit.' : '');
  $('epochControl').hidden = compareDurations;
  $('fitEpochs').disabled = compareDurations;
  const limit = $('sampleLimit');
  const budget = limit.validity.valid ? 'up to '+limit.valueAsNumber.toLocaleString()+' distinct examples' : 'the same example limit';
  const descriptions = {
    forms: structured ? 'Train one network on '+(form.selectedOptions[0]?.textContent ?? 'one form')+' alone and another on a mix. Both get six training fields. Test both on identical fresh fields of '+(heldOut.value === 'follow' ? form.selectedOptions[0]?.textContent : heldOut.selectedOptions[0]?.textContent)+'.'
      : 'Choose connected or structured plants in the settings to compare a single training form with a mix.',
    sampling: 'Give two networks the same scans and '+budget+' each. One shuffles peaks near labeled plants together. The other shares their slots across growth forms with ground returns included and removed. Both see the same background peaks.',
    negatives: 'A practice model scores background peaks in weedy training plots. One final model gets a shuffled draw. The other fills half its background slots with peaks the practice model mistook for crops most strongly. Both learn from the same crop peaks, then score fresh fields at a 0.65 cutoff.',
    features: 'Train two CPU networks on identical peak locations. One uses the usual height measurements. The other measures how far each peak rises above nearby low returns and how uneven that surface is. Repeat on two sets of plantings.',
    averaging: 'Train two CPU networks on the same scans. One averages heights across every cell. The other averages only cells that received a point. Each learns from the peaks its own rule found.',
    heights: 'Both detectors look for high points in the same scans. One starts at 6.5 cm and one at 3.5 cm. Check whether including shorter peaks recovers plants or adds stray pins.',
    density: budgets ? 'Grow each training field twice, using '+budgets[0].toLocaleString()+' and '+budgets[1].toLocaleString()+' rays. Test both detectors on the same fresh fields.'
      : 'Choose two training ray budgets in the scan settings to begin.',
    epochs: 'An epoch is one pass over the training examples. Each CPU fit starts from the same weights, sees the same examples and uses the same 0.50 cutoff. Check whether extra practice finds more plants on fresh fields.',
    layouts: 'Fit one CPU neural network per seed. Scan each fresh planting in a grid and again with simulated OS1-64 rings. Both layouts sample the same number of rays. See how the pattern changes the pins.',
    cutoffs: 'A cutoff is the score a peak needs to earn a pin. Choose the trial value before running. Each seed fits one model, then tests every cutoff on the same fresh fields.',
    models: 'A logistic model weights each scan feature directly. A neural network learns combinations of features. Both train on your CPU. Compare their pins on the same fresh scans.',
    backend: 'Train the same neural network on CPU and WebGPU. Compare fitting times alongside scores. Both runs generate fields and score plant centers on the CPU.'
  };
  $('comparisonHelp').textContent = descriptions[$('comparison').value];
}
epochSchedule.addEventListener('change', explainComparison);
for (const input of [shortEpochs,longEpochs]) input.addEventListener('input', explainComparison);
trainingPair.addEventListener('change', explainComparison);
$('sampleLimit').addEventListener('input', explainComparison);
for (const id of ['crop','plantArchitecture','plantForm','validationPlantForm']) $(id).addEventListener('change', explainComparison);
$('comparison').addEventListener('change', () => {
  explainComparison();
  showReadyState();
});
explainComparison();
showReadyState();
discoverGpu();
$('cancel').onclick = () => controller?.abort();
function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url;
  link.download = filename;
  link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('export').onclick = () => {
  if (report) downloadJSON(report, 'crop-benchmark-'+report.settings.crop+'-'+report.settings.seed+'.json');
};
function contenderLabel(row, comparison) {
  if (comparison === 'forms') return row.trainingLabel;
  if (comparison === 'heights') return (100 * row.minimumHeight).toFixed(1)+' cm peaks';
  if (comparison === 'density') return row.trainingRayBudget === ALTERNATING_BUDGET ? 'Alternating 12k / 60k' : row.trainingRayBudget.toLocaleString()+' training rays';
  if (comparison === 'layouts') return layoutNames.get(row.validationSensorMode);
  if (comparison === 'negatives') return backgroundLabels.get(row.negativeSampling);
  if (comparison === 'sampling') return samplingLabels.get(row.positiveSampling);
  if (comparison === 'features') return featureLabels.get(row.featureMode);
  if (comparison === 'averaging') return averagingNames.get(row.peakAveraging);
  if (comparison === 'epochs') return row.epochs+' epochs';
  if (comparison === 'cutoffs') return 'Cutoff '+row.threshold;
  if (comparison === 'models') return row.model === 'linear' ? 'Logistic' : 'Neural';
  return row.backend;
}
// Each contender has one row per dataset seed. A field's two soil variants
// have repeated plant labels, so pooled counts describe the twelve scans.
function showOutcome(rows, comparison, crop) {
  const groups = new Map();
  for (const row of rows) {
    const label = contenderLabel(row, comparison);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  const summaries = Array.from(groups, ([label, runs]) => {
    const matches = runs.map(row => row.scores.find(score => score.cm === 15));
    const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
    const tp = sum(matches, 'tp');
    return {
      label, mean:sum(runs, 'meanF1') / runs.length, trainingMs:sum(runs, 'trainingMs') / runs.length,
      matched:tp, labels:tp + sum(matches, 'fn'), extra:sum(matches, 'fp'),
      scores:new Map(runs.map(row => [row.seed, row.meanF1.toFixed(4)]))
    };
  });
  const ranked = [...summaries].sort((a,b) => b.mean - a.mean);
  const top = ranked.filter(s => s.mean.toFixed(4) === ranked[0].mean.toFixed(4));
  const intro = document.createElement('h3');
  if (top.length > 1) {
    intro.textContent = top.length === ranked.length ? 'The average scores tied to four decimals'
      : top.map(s => s.label).join(' and ')+' tied for the highest average score';
  } else {
    const best = ranked[0];
    const ledBoth = [...best.scores].every(([seed,score]) =>
      ranked.slice(1).every(other => Number(score) > Number(other.scores.get(seed))));
    intro.textContent = best.label+(ledBoth ? ' led on both dataset seeds' : ' had the highest average mean F1');
  }
  const observation = document.createElement('p');
  intro.dataset.helpLabel = 'Comparison summary';
  intro.dataset.help = 'Compares the contenders on two repeatable datasets. Each dataset contributes equally to the average mean F1.';
  observation.dataset.helpLabel = 'Difference between contenders';
  observation.dataset.help = 'Compares final counts at 15 cm across both seeds. Each planting contributes a separate scan with and without soil.';
  if (comparison === 'backend') {
    intro.textContent = 'Training time on this device';
    intro.dataset.help = 'Compare elapsed fitting time for the same model and data on each training engine.';
    observation.dataset.help = 'This average weights each dataset seed equally. Other devices and browser adapters can give different timings.';
    observation.textContent = summaries.map(s => s.label+' averaged '+formatTime(s.trainingMs)+' per fit').join(' · ')+'.';
  } else if (top.length === 1) {
    const [best, next] = ranked;
    function difference(a, b, noun) {
      const count = Math.abs(a-b);
      if (!count) return 'the same number of '+noun+'s';
      return count.toLocaleString()+(a>b?' more ':' fewer ')+noun+(count===1?'':'s');
    }
    observation.textContent = 'Compared with '+next.label+' at 15 cm, '+best.label+' found '+difference(best.matched,next.matched,'labeled center')+
      ' and placed '+difference(best.extra,next.extra,'unmatched pin')+'.';
  }
  const guide = document.createElement('p');
  const firstRuns = groups.values().next().value;
  const scans = firstRuns.reduce((n, row) => n + row.tiles.length, 0);
  const seeds = firstRuns.map(row => row.seed).join(' and ');
  guide.textContent = 'Mean F1 balances missed plants and extra pins across three matching distances. Counts use a 15 cm match on '+scans+' synthetic '+cropProfile(crop).name.toLowerCase()+' scans from seeds '+seeds+', including both soil views of each planting.';
  if (comparison === 'forms') {
    const form = firstRuns[0].validationPlantForm;
    const name = [...$('validationPlantForm').options].find(option => option.value === form)?.textContent ?? form;
    guide.textContent += ' Both fits were tested on '+name.toLowerCase()+'.';
  }
  if (comparison === 'sampling') guide.textContent += ' Open “Which examples reached the fit?” to see which groups gained or lost training examples.';
  if (comparison === 'epochs') guide.textContent += ' Open the distance scores to compare the same fits with ground included or removed.';
  if (comparison === 'features') guide.textContent += ' Both fits scored the same peak locations. Their height inputs and fitted weights can change which pins survive.';
  if (comparison === 'layouts') guide.textContent += ' Counts are per layout. Scores describe these simulated patterns. A field-mounted scanner has its own viewpoint and occlusion.';
  const list = document.createElement('ul');
  list.id = 'outcomeList';
  for (const entry of summaries) {
    const item = document.createElement('li'), title = document.createElement('strong');
    title.textContent = entry.label+' · '+entry.mean.toFixed(4)+' mean F1';
    const count = document.createElement('span');
    title.dataset.help = 'Average of the two dataset scores. Each seed’s score averages F1 at 7.5, 10 and 15 cm.';
    title.dataset.helpLabel = entry.label + ' mean F1';
    count.dataset.help = 'Each pin can match one plant within 15 cm. Counts include both soil views and both seeds. Unmatched pins are extras.';
    count.dataset.helpLabel = entry.label + ' matches and extra pins';
    count.textContent = entry.matched.toLocaleString()+' of '+entry.labels.toLocaleString()+' centers found · '+entry.extra.toLocaleString()+' extra pins';
    item.append(title,count);
    if (comparison === 'epochs') {
      const time = document.createElement('span');
      time.textContent = formatTime(entry.trainingMs)+' average fitting time';
      time.dataset.help = 'Average CPU fitting time for this length across both seeds. Generation and scoring are timed separately in the results table.';
      item.append(time);
    }
    if (comparison === 'forms' || comparison === 'sampling') {
      const samples = document.createElement('span');
      samples.dataset.help = 'Retained positive and negative candidate peaks for fitting, shown separately for each seed.';
      samples.dataset.helpLabel = 'Examples used for training';
      samples.textContent = 'Training examples on each seed · '+groups.get(entry.label).map(row => row.trainingSamples.toLocaleString()).join(' / ');
      item.append(samples);
    }
    if (comparison === 'layouts') {
      const tiles = groups.get(entry.label).flatMap(row=>row.tiles);
      const rays = tiles[0].sampledRays.toLocaleString();
      const meanReturns = Math.round(tiles.reduce((total,tile)=>total+tile.returnCount,0)/tiles.length);
      const sampling = document.createElement('span');
      sampling.dataset.help = 'A sampled ray is one attempted measurement. A return is a recorded point after simulated gaps and noise. The return count is averaged over the test scans.';
      sampling.dataset.helpLabel = 'Test scan density';
      sampling.textContent = rays+' rays sampled per scan · '+meanReturns.toLocaleString()+' returns per scan on average';
      item.append(sampling);
    }
    list.append(item);
  }
  $('summary').replaceChildren(intro);
  if (observation.textContent) $('summary').append(observation);
  $('summary').append(guide,list);
  const adapter = rows.find(row => row.adapter)?.adapter;
  if (adapter) {
    const note = document.createElement('p');
    note.dataset.help = 'Identifies the adapter the browser reported for this run. A software adapter runs GPU commands on the CPU.';
    note.dataset.helpLabel = 'WebGPU adapter';
    note.textContent = 'WebGPU adapter · '+[adapter.kind,adapter.description || adapter.architecture].filter(Boolean).join(' · ');
    $('summary').append(note);
  }
}

// Keep finished fits available while a comparison runs or after it is canceled.
const completedScores = [];
const scoreGround = $('scoreGround');
if (['present','removed'].includes(requested.get('scoreGround'))) scoreGround.value = requested.get('scoreGround');
const scoreDistance = $('scoreDistance');
const scoreHeaders = [...$('scoreRows').closest('table').tHead.rows[0].cells];
const sharedDistance = requested.get('scoreDistance');
if ([...scoreDistance.options].some(option => option.value === sharedDistance)) scoreDistance.value = sharedDistance;

function appendDistanceScores(row, modelLabel) {
  const scores = scoreGround.value === 'all' ? row.scores : row.byGround.find(group => group.ground === (scoreGround.value === 'present')).scores;
  for (const score of scores) {
    if (scoreDistance.value !== 'all' && Number(scoreDistance.value) !== score.cm) continue;
    const detail = $('scoreRows').insertRow();
    const values = [row.seed, modelLabel, row.epochs, row.threshold, score.cm+' cm',
      score.precision.toFixed(4), score.recall.toFixed(4), score.f1.toFixed(4), score.tp, score.fp, score.fn];
    values.forEach((value, i) => {
      const cell = detail.insertCell();
      cell.dataset.label = scoreHeaders[i].dataset.compact || scoreHeaders[i].textContent;
      cell.textContent = value;
    });
  }
}
function updateReplay(url) {
  report.replayUrl = $('replay').href = url.href;
  if (!$('modelBoxes').hidden) updateBoxLinks();
}
function changeScoreView() {
  $('scoreRows').replaceChildren();
  for (const {row, modelLabel} of completedScores) appendDistanceScores(row, modelLabel);
  if (report) {
    const replay = new URL(report.replayUrl);
    replay.searchParams.set('scoreDistance', scoreDistance.value);
    if (scoreGround.value === 'all') replay.searchParams.delete('scoreGround');
    else replay.searchParams.set('scoreGround',scoreGround.value);
    updateReplay(replay);
  }
}
scoreDistance.addEventListener('change', changeScoreView);
scoreGround.addEventListener('change', changeScoreView);

function appendRow(row, comparison, settings) {
  const tr=document.createElement('tr');
  const widest=row.scores.at(-1);
  tr.insertCell().textContent = row.seed;
  const modelCell = tr.insertCell();
  const modelLabel = ['density','heights','layouts','averaging','features','sampling','forms','negatives'].includes(comparison) ? contenderLabel(row, comparison) : row.model+' / '+row.backend;
  modelCell.textContent = modelLabel;
  const duration = tr.insertCell();
  const cutoff = tr.insertCell();
  duration.textContent = row.epochs;
  cutoff.textContent = row.threshold;
  if (['density','epochs','cutoffs','heights','layouts','averaging','features','sampling','forms'].includes(comparison)) {
    const query = new URLSearchParams({
      crop:settings.crop, ...plantSettings(settings), sensor:settings.sensorMode, seed:row.seed, epochs:row.epochs, threshold:row.threshold, engine:'cpu'
    });
    if (comparison === 'forms') query.set('plantForm', row.plantForm);
    if (settings.validationPlantForm) query.set('validationPlantForm',settings.validationPlantForm);
    query.set('minimumHeight', row.minimumHeight);
    if (settings.sampleLimit !== undefined) query.set('sampleLimit',settings.sampleLimit);
    if (row.positiveSampling) query.set('positiveSampling',row.positiveSampling);
    if (row.featureMode) query.set('featureMode', row.featureMode);
    if (row.peakAveraging === 'occupied') query.set('peakAveraging',row.peakAveraging);
    if (row.trainingRayBudget) query.set('trainingRayBudget', row.trainingRayBudget);
    if (settings.validationRayBudget) query.set('validationRayBudget', settings.validationRayBudget);
    const layout = row.validationSensorMode ?? settings.validationSensorMode;
    if (layout) query.set('validationSensor', layout);
    const link = document.createElement('a');
    link.href = '../trainer/?'+query;
    link.dataset.help = 'Open the Training shed with these settings to fit this contender again and inspect or export its weights.';
    const cell = {heights:modelCell, density:modelCell, layouts:modelCell, averaging:modelCell, features:modelCell, sampling:modelCell, forms:modelCell, epochs:duration, cutoffs:cutoff}[comparison];
    link.textContent = cell.textContent;
    link.setAttribute('aria-label', 'Replay '+modelLabel+' on seed '+row.seed+' with '+row.epochs+' epochs and cutoff '+row.threshold);
    cell.replaceChildren(link);
  }
  for(const text of [formatTime(row.generationMs),
    row.reusedFit ? 'Reused' : formatTime(row.trainingMs),formatTime(row.scoringMs),row.trainingLoss.toFixed(4),row.meanF1.toFixed(4),
    (100*widest.precision).toFixed(1)+'% / '+(100*widest.recall).toFixed(1)+'%']){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
  }
  $('results').append(tr);
  $('scoreDetails').hidden = false;
  const scoreLabel = comparison === 'epochs' ? contenderLabel(row,comparison) : modelLabel;
  completedScores.push({row, modelLabel:scoreLabel});
  appendDistanceScores(row, scoreLabel);
}
function displayValidationBudgets(container) {
  container.replaceChildren();
  for (const budget of DENSITY_BUDGETS) {
    if (budget === report.settings.validationRayBudget) continue;
    const url = new URL(report.replayUrl);
    url.searchParams.set('validationRayBudget', budget);
    const link = document.createElement('a');
    link.href = url;
    link.dataset.help = 'Keep this experiment’s settings and request '+budget.toLocaleString()+' rays per validation scan. Run it in the same tab to compare both budgets.';
    link.textContent = 'Repeat with '+budget.toLocaleString()+' validation rays';
    container.append(link);
  }
}
function displayDensityStudy() {
  const body = $('densityRows');
  body.replaceChildren();
  const trainingCounts = new Map();
  let sampledCountChanged = false, capped = false;
  for (const row of report.rows) {
    const dataset = report.datasets[row.datasetIndex];
    const training = dataset.recipeManifest.filter(tile => tile.split === 'train');
    if (training.some(tile => tile.sampledRays < tile.recipe.points)) capped = true;
    const sampled = training.map(tile => tile.sampledRays);
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
  $('densityCapNote').hidden = !capped;
  if (capped) {
    $('densityCapNote').textContent = sampledCountChanged
      ? 'Some training scans reached their layout’s ray limit. The sampled counts show the density each model saw.'
      : 'Both budgets reached the same ray limit on every paired training scan. Choose Reference grid to sample both requested densities.';
  }
  if (sampledCountChanged) {
    try { localStorage.setItem('crop-trainer-ray-scout', 'earned'); } catch {}
  }
  $('densityStudy').hidden = false;
}
function displayValidationComparison() {
  const heights = report.comparison === 'heights';
  // Preserve the classic 12k/60k validation history when visitors also try
  // an independent 30k/1M training comparison in this browser tab.
  let key = heights ? HEIGHT_HISTORY_KEY : DENSITY_HISTORY_KEY;
  if (!heights && report.settings.trainingPair !== CLASSIC_TRAINING_PAIR) key += '-'+report.settings.trainingPair;
  if (report.settings.sampleLimit !== undefined) key += '-cap-'+report.settings.sampleLimit;
  if (report.settings.positiveSampling) key += '-'+report.settings.positiveSampling;
  if (report.settings.featureMode === 'local-ground') key += '-local-ground';
  if (report.settings.peakAveraging === 'occupied') key += '-occupied';
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
  $('fitSetting').dataset.help = heights
    ? 'The smallest peak height allowed when generating candidates for this fit.'
    : 'The ray budget requested for training, before scoring the fit on two validation densities.';
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
$('cutoffDistance').addEventListener('change', () => {
  if (report?.comparison !== 'cutoffs') return;
  displayCutoffChanges(report);
  const url = new URL(report.replayUrl);
  url.searchParams.set('cutoffDistance', $('cutoffDistance').value);
  updateReplay(url);
});
function fieldViewerUrl(settings, {seed, sensor, ground, tile}) {
  const query = new URLSearchParams({crop:settings.crop, ...plantSettings(settings), seed, sensor, ground, tile});
  if (settings.validationPlantForm) query.set('plantForm', settings.validationPlantForm);
  if (settings.validationRayBudget) query.set('budget', settings.validationRayBudget);
  // A shared scan can carry settings that apply to both fitted models.
  if (settings.positiveSampling) query.set('positiveSampling',settings.positiveSampling);
  if (settings.sampleLimit !== undefined) query.set('sampleLimit',settings.sampleLimit);
  if (settings.featureMode) query.set('featureMode', settings.featureMode);
  if (settings.peakAveraging) query.set('peakAveraging', settings.peakAveraging);
  return '../?'+query+'#field';
}
function displayFields() {
  const {comparison, datasets, rows, settings} = report;
  const contender = row => contenderLabel(row, comparison);
  const columns = rows.filter(row => row.seed === datasets[0].seed).map(contender);
  const layouts = comparison === 'layouts';
  const metric = $('fieldMetric').value;
  const metricHelp = metric === 'meanSigned'
    ? 'Final pins minus labeled plants, averaged per scan. A negative value means the detector undercounted.'
    : metric === 'meanAbsolute' ? 'Average size of the count error per scan. Zero means the pin count equaled the plant count.'
    : metric === 'mean' ? 'F1 averaged over 7.5, 10 and 15 cm, combining both soil views of this planting.'
    : 'F1 at '+metric+' cm, combining matches, extra pins and misses from both soil views.';
  const headings = [
    ['Dataset seed','Selects the training and validation plantings used in one repeat.'],
    ['Field seed','Identifies one held-out planting. Both contenders see scans of its plants.'],
    ...(layouts ? [] : [['Layout','The simulated ray pattern used to scan this planting.']]),
    ...columns.map(label => [label, metricHelp])
  ];
  $('fieldGuide').textContent = 'Each row combines the scans with and without soil from one held-out planting. '+
    (layouts ? 'Select a score to inspect that layout’s soil-present scan in 3D.' : 'Select a field seed to inspect its soil-present scan in 3D.');
  $('fieldHeading').replaceChildren(...headings.map(([label, help]) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    th.dataset.help = help;
    return th;
  }));
  $('fieldRows').replaceChildren();
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
      function viewerLink(result, text) {
        const link = document.createElement('a');
        link.href = fieldViewerUrl(settings, {seed, sensor:result.sensor, ground:true, tile:result.tileIds[0]});
        link.dataset.help = (layouts ? metricHelp+' ' : '')+'Open the soil-present scan of this field in the 3D viewer.';
        link.textContent = text;
        if (layouts) link.setAttribute('aria-label', text+' · inspect '+layoutNames.get(result.sensor)+' on field '+seed);
        return link;
      }
      const fieldCell = tr.insertCell();
      if (layouts) fieldCell.textContent = seed;
      else {
        fieldCell.append(viewerLink(field,seed));
        tr.insertCell().textContent = field.sensor;
      }
      for (const column of columns) {
        const result = contenders.get(column).get(seed);
        const value = countMetric ? formatCount(result.countError[metric]) :
          (metric === 'mean' ? result.meanF1 : result.scores.find(score => score.cm === Number(metric)).f1).toFixed(4);
        const cell = tr.insertCell();
        if (layouts) cell.append(viewerLink(result,value));
        else cell.textContent = value;
      }
    }
    if (countMetric) {
      const total = $('fieldRows').insertRow();
      total.className = 'seedAverage';
      const label = document.createElement('th');
      label.scope = 'row';
      label.colSpan = layouts ? 2 : 3;
      label.textContent = 'Seed '+dataset.seed+' · all '+dataset.stats.valTiles+' scans';
      label.dataset.help = 'This row gives equal weight to each held-out scan for this dataset seed.';
      total.append(label);
      for (const column of columns) {
        const row = group.find(row => contender(row) === column);
        const cell = total.insertCell();
        cell.textContent = formatCount(row.countError[metric]);
        cell.dataset.helpLabel = column+' count error across this seed';
        cell.dataset.help = metricHelp;
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
  updateReplay(url);
  for (const link of document.querySelectorAll('#densityRepeats a, #heightRepeats a')) {
    const repeat = new URL(url);
    repeat.searchParams.set('validationRayBudget', new URL(link.href).searchParams.get('validationRayBudget'));
    link.href = repeat.href;
  }
});
// Give each fit a stable column even when execution order reverses on seed two.
function boxFits(seed) {
  const rows = report.rows.filter(row => row.seed === seed);
  if (report.comparison === 'cutoffs') return report.thresholds.map(value => rows.find(row => row.threshold === value));
  if (report.comparison === 'epochs') {
    const lengths = report.settings.epochCounts;
    return [lengths[0],lengths.at(-1)].map(epochs => rows.find(row => row.epochs === epochs));
  }
  if (report.comparison === 'negatives') return [...backgroundLabels.keys()].map(mode => rows.find(row => row.negativeSampling === mode));
  if (report.comparison === 'sampling') return [...samplingLabels.keys()].map(mode => rows.find(row => row.positiveSampling === mode));
  if (report.comparison === 'features') return [...featureLabels.keys()].map(mode => rows.find(row => row.featureMode === mode));
  if (report.comparison === 'forms') return report.settings.trainingForms.map(form => rows.find(row => row.plantForm === form));
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
  $('pairViewer').href = fieldViewerUrl(report.settings, {seed:firstTile.seed, sensor:firstTile.sensor, ground:firstTile.ground, tile:tileId});
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
  event.preventDefault(); if(controller || $('run').disabled)return;
  showingSetup = false;
  controller = new AbortController();
  const {signal} = controller;
  const seed=Number($('seed').value), crop=$('crop').value, sensorMode=$('sensor').value;
  const comparison=$('comparison').value;
  const compareLayouts = comparison === 'layouts';
  const validationSensorMode = compareLayouts || $('validationSensor').value === 'follow' ? undefined : $('validationSensor').value;
  const trainingRayBudget = comparison === 'density' ? undefined : trainingRayValue($('trainingRayBudget'));
  const validationRayBudget = Number((compareLayouts ? layoutBudget : $('validationRayBudget')).value);
  const geometry = readPlantControls();
  const compareForms = comparison === 'forms';
  const compareSampling = comparison === 'sampling';
  const compareBackground = comparison === 'negatives';
  const settings={seed,crop,...geometry,...samplingControls.settings(compareSampling),...readValidationForm(),sensorMode,validationSensorMode,trainingRayBudget,validationRayBudget,trainFields:6,valFields:3};
  if (compareForms) {
    settings.trainingForms = [geometry.plantForm, 'mixed'];
    settings.validationPlantForm = $('validationPlantForm').value === 'follow' ? geometry.plantForm : $('validationPlantForm').value;
  }
  if (comparison !== 'heights') settings.minimumHeight = Number($('minimumHeight').value) || cropProfile(crop).peakHeight;
  if (comparison === 'features') settings.featureModes = [...featureLabels.keys()];
  else if (featureSelect.value === 'local-ground') settings.featureMode = 'local-ground';
  if (comparison !== 'averaging' && averagingControl.value === 'occupied') settings.peakAveraging = 'occupied';
  if (comparison === 'epochs') {
    settings.epochCounts = epochCounts();
    settings.fit = {hiddenLayers:[4], activation:'tanh', optimizer:'sgd', batchSize:0, initSeed:12345, lr:.25};
  } else settings.epochs = $('fitEpochs').valueAsNumber;
  if (compareBackground) settings.fit = backgroundFit;
  const neuralCPU = {model:'neural', backend:'CPU', train:trainNetworkCPU};
  const includeMixed = comparison === 'density' && trainingPair.value === CLASSIC_TRAINING_PAIR && $('includeMixed').checked;
  const trainingBudgets = TRAINING_RAY_PAIRS.get(trainingPair.value) ?? [];
  if (comparison === 'density') {
    settings.trainingPair = trainingPair.value;
    settings.trainingRayBudgets = trainingBudgets;
    settings.includeMixed = includeMixed;
  }
  const densityFits = includeMixed ? [...trainingBudgets, ALTERNATING_BUDGET] : trainingBudgets;
  const comparisons = {
    forms: settings.trainingForms?.map(plantForm => ({...neuralCPU,plantForm,
      trainingLabel:plantForm === 'mixed' ? 'Mixed forms' : $('plantForm').selectedOptions[0].textContent})),
    backend: [neuralCPU, {model:'neural', backend:'WebGPU', train:trainNetworkGPU}],
    models: [{model:'linear', backend:'CPU', train:trainCPU}, neuralCPU],
    cutoffs: [neuralCPU],
    negatives: [...backgroundLabels.keys()].map(negativeSampling => ({...neuralCPU, negativeSampling})),
    sampling: [...samplingLabels.keys()].map(positiveSampling => ({...neuralCPU,positiveSampling})),
    features: [...featureLabels.keys()].map(featureMode => ({...neuralCPU,featureMode})),
    averaging: [...averagingNames.keys()].map(peakAveraging=>({...neuralCPU,peakAveraging})),
    layouts: [...layoutNames.keys()].map(validationSensorMode=>({...neuralCPU,validationSensorMode})),
    heights: PEAK_HEIGHTS.map(minimumHeight => ({...neuralCPU, minimumHeight})),
    density: densityFits.map(trainingRayBudget => ({...neuralCPU, trainingRayBudget})),
    epochs: settings.epochCounts?.map(epochs => ({...neuralCPU, epochs}))
  };
  const contenders = comparisons[comparison];
  const heldOutForm = settings.validationPlantForm ?? geometry.plantForm;
  const stage = formsFor(crop).find(form => form.id === heldOutForm)?.label
      ?? (geometry.plantArchitecture >= 2 ? 'Seeded mix' : 'Original canopy');
  $('scoreScope').textContent = 'Held-out plants · '+cropProfile(crop).name+' · '+stage;
  if (compareLayouts) settings.validationSensorModes = [...layoutNames.keys()];
  const thresholds = comparison === 'cutoffs' ? cutoffControls.thresholds() : [compareBackground ? backgroundCutoff : .5];
  const customCutoff = comparison === 'cutoffs' && thresholds.length === 2;
  const rows=[],datasets=[];
  const livePreview=$('livePreview').checked;
  const view=livePreview ? watch : null;
  const labels=contenders.flatMap(c=>thresholds.map(threshold=>contenderLabel({...settings,...c,threshold},comparison)));
  watch.start(seed,labels,livePreview);
  const scans=livePreview ? scanSession(signal) : null;
  $('replay').hidden = true;
  $('robustnessTable').hidden = true;
  $('heightStudy').hidden = true;
  $('samplingMix').hidden = true;
  $('negativeReview').hidden = true;
  $('densityStudy').hidden = true;
  $('cutoffChanges').hidden = true;
  $('cutoffChanges').open = false;
  $('fieldDetails').hidden = true;
  $('fieldDetails').open = false;
  $('modelBoxes').hidden = true;
  $('modelBoxes').open = false;
  report=null;$('export').disabled=true;$('summary').textContent='';$('results').replaceChildren();
  $('scoreDetails').hidden = true;
  completedScores.length = 0;
  $('scoreRows').replaceChildren();
  const lockedControls = [...$('benchForm').querySelectorAll('input:enabled,select:enabled,button:enabled:not(.helpTrigger,.helpDisabledProxy)')];
  for (const input of lockedControls) input.disabled = true;
  $('cancel').disabled = false;
  const benchStart = performance.now();
  try {
    for(const offset of [0,1]){
      const runSeed=seed+offset;
      let set, generationMs, datasetIndex, pairedIds, fit;
      const scanOptions = {signal, ...(view ? {generate:recipe=>scans.generate(recipe),onScan:view.scan} : {})};
      const backgroundPair = compareBackground ? await prepareBackgroundPair({...settings, seed:runSeed}, {
        ...scanOptions,
        onStage(stage) {
          if (stage === 'pilot') {
            $('status').textContent = 'Fitting the 40-epoch practice model for seed '+runSeed+'…';
            view?.fitting('Background practice model',40);
          } else {
            $('status').textContent = stage === 'ordinary' ? 'Growing the background training plots for seed '+runSeed+'…' : 'Selecting difficult background peaks for seed '+runSeed+'…';
            view?.growing(runSeed);
          }
        },
        onEpoch:view ? progress=>view.epoch(progress,40) : undefined
      }) : null;
      const order=offset?[...contenders].reverse():contenders;
      for(const contender of order){
        signal.throwIfAborted();
        const {model, backend, train, epochs = settings.epochs, minimumHeight = settings.minimumHeight, trainingRayBudget = settings.trainingRayBudget, peakAveraging = settings.peakAveraging, featureMode = settings.featureMode} = contender;
        const positiveSampling = contender.positiveSampling ?? settings.positiveSampling;
        const validationLayout = contender.validationSensorMode ?? validationSensorMode;
        const reuseFit = compareLayouts && Boolean(fit);
        if (backgroundPair) {
          ({set, generationMs} = backgroundPair[contender.negativeSampling]);
          datasetIndex = datasets.length;
          datasets.push({seed:runSeed, stats:set.stats, recipeManifest:set.manifest});
        } else if (!set || comparison === 'density' || comparison === 'heights' || comparison === 'averaging' || comparison === 'features' || compareSampling || compareForms || compareLayouts) {
          $('status').textContent = reuseFit ? 'Rescanning the held-out fields on '+layoutNames.get(validationLayout)+'…' : 'Growing fields for seed '+runSeed+'…';
          view?.growing(runSeed);
          const start=performance.now();
          set = reuseFit ? await rescanValidation(set,validationLayout,scanOptions) :
            await buildDataset({...settings,seed:runSeed,plantForm:contender.plantForm ?? geometry.plantForm,trainingRayBudget,minimumHeight,peakAveraging,featureMode,positiveSampling,auditPositiveSampling:compareSampling,validationSensorMode:validationLayout,...scanOptions});
          generationMs=performance.now()-start;
          if (compareLayouts && set.validation.some(tile=>tile.sampledRays!==validationRayBudget || tile.recipe.points!==validationRayBudget)) {
            throw new Error('The layouts did not sample the same requested ray budget.');
          }
          const pairedScans = compareLayouts ? set.manifest.filter(tile=>tile.split==='train') : ['heights','averaging','features','sampling'].includes(comparison) ? set.manifest : set.validation;
          const ids = pairedScans.map(tile => tile.tile_id);
          if (pairedIds && (ids.length !== pairedIds.length || ids.some((id,i) => id !== pairedIds[i]))) {
            throw new Error('The fits have different scans in their paired comparison.');
          }
          if (compareSampling && pairedIds) checkSamplingPair(datasets[datasetIndex].stats, set.stats);
          pairedIds=ids;
          datasetIndex=datasets.length;
          datasets.push({seed:runSeed,stats:set.stats,recipeManifest:set.manifest,...(comparison === 'epochs' ? {scaling:set.scaling} : {})});
        }
        let trainingMs = 0;
        if (!reuseFit) {
          $('status').textContent='Training '+model+' on '+backend+' · '+epochs+' epochs · seed '+runSeed;
          const label=comparison==='cutoffs' || compareLayouts ? 'Shared neural fit' : contenderLabel({...settings,...contender,epochs},comparison);
          view?.fitting(label,epochs);
          const before=performance.now();
          fit=await train(set.X,set.Y,{dims:set.dims,epochs,lr:.25,...settings.fit,signal,onEpoch:view?p=>view.epoch(p,epochs):undefined});
          trainingMs = performance.now()-before;
        }
        const cuts = offset ? [...thresholds].reverse() : thresholds;
        for (const threshold of cuts) {
          signal.throwIfAborted();
          $('status').textContent = 'Scoring seed '+runSeed+' at cutoff '+threshold+'…';
          view?.scoring(contenderLabel({...settings,...contender,epochs,threshold},comparison));
          const scoringStart = performance.now();
          const result = await validateModel(set, fit.weights, {
            threshold, predictScores:model === 'neural' ? predictNetwork : undefined, signal,onProgress:view?.tile
          });
          const scoringMs = performance.now()-scoringStart;
          const row = {
            ...(backgroundPair ? {negativeSampling:contender.negativeSampling, backgroundSelection:backgroundPair[contender.negativeSampling].selection,
              weightArtifact:backgroundWeights(set,fit.weights,settings,epochs)} : {}),
            ...(compareForms ? {plantForm:contender.plantForm,validationPlantForm:settings.validationPlantForm,trainingLabel:contender.trainingLabel,trainingSamples:set.stats.samples} : {}),
            ...(comparison === 'epochs' ? {trainingSamples:set.stats.samples, samplePasses:set.stats.samples * epochs} : {}),
            ...(positiveSampling ? {positiveSampling} : {}),
            ...(settings.sampleLimit !== undefined ? {sampleLimit:settings.sampleLimit,trainingSamples:set.stats.samples} : {}),
            ...(featureMode ? {featureMode} : {}),
            ...(peakAveraging ? {peakAveraging} : {}),
            ...(compareLayouts?{validationSensorMode:validationLayout,sharedFitSeed:runSeed,reusedFit:reuseFit}:{}),
            ...(customCutoff ? {sharedFitSeed:runSeed, reusedFit:threshold !== cuts[0]} : {}),
            model, backend:fit.backend, datasetIndex, minimumHeight, trainingRayBudget, epochs, trainingLoss:fit.loss.at(-1), threshold, seed:runSeed, generationMs, trainingMs,
            scoringMs, adapter:fit.adapter,
            meanF1:result.meanF1, scores:result.scores, countError:result.countError, byGround:result.byGround, byField:result.byField, tiles:result.tiles
          };
          view?.score(contenderLabel(row,comparison),row,result.preview);
          rows.push(row);
          appendRow(row, comparison, settings);
        }
      }
    }
    showOutcome(rows, comparison, crop);
    const replay = new URL(location.pathname, location.origin);
    replay.search = new URLSearchParams({comparison, crop, ...geometry, sensor:sensorMode, seed});
    if (settings.validationPlantForm) replay.searchParams.set('validationPlantForm',settings.validationPlantForm);
    if (settings.epochCounts?.length === 2) {
      replay.searchParams.set('shortEpochs', settings.epochCounts[0]);
      replay.searchParams.set('longEpochs', settings.epochCounts[1]);
    }
    if(!livePreview)replay.searchParams.set('live','off');
    if ($('fieldMetric').value !== 'mean') replay.searchParams.set('fieldMetric', $('fieldMetric').value);
    if (comparison !== 'heights' && $('minimumHeight').value !== 'default') replay.searchParams.set('minimumHeight', settings.minimumHeight);
    if (settings.sampleLimit !== undefined) replay.searchParams.set('sampleLimit',settings.sampleLimit);
    if (settings.positiveSampling) replay.searchParams.set('positiveSampling',settings.positiveSampling);
    if (settings.featureMode) replay.searchParams.set('featureMode',settings.featureMode);
    if (settings.peakAveraging) replay.searchParams.set('peakAveraging',settings.peakAveraging);
    if (settings.trainingPair && settings.trainingPair !== CLASSIC_TRAINING_PAIR) replay.searchParams.set('trainingPair', settings.trainingPair);
    if (includeMixed) replay.searchParams.set('includeMixed', '1');
    if (trainingRayBudget) replay.searchParams.set('trainingRayBudget', trainingRayBudget);
    if (validationRayBudget) replay.searchParams.set('validationRayBudget', validationRayBudget);
    if (validationSensorMode) replay.searchParams.set('validationSensor', validationSensorMode);
    if (scoreGround.value !== 'all') replay.searchParams.set('scoreGround',scoreGround.value);
    if (scoreDistance.value !== '15' || sharedDistance === '15') replay.searchParams.set('scoreDistance', scoreDistance.value);
    if (settings.epochs !== undefined && settings.epochs !== 40) replay.searchParams.set('epochs', settings.epochs);
    if (customCutoff) replay.searchParams.set('trialCutoff', thresholds[1]);
    if (comparison === 'cutoffs') replay.searchParams.set('cutoffDistance', $('cutoffDistance').value);
    $('replay').href = replay.href;
    $('replay').hidden = false;
    report={schema:1,elapsedMs:performance.now()-benchStart,livePreview,domain:'synthetic',comparison,thresholds,settings,replayUrl:replay.href,datasets,rows};
    if (compareBackground) {
      showBackgroundModels(report, downloadJSON);
      $('negativeReview').hidden = false;
    }
    if (compareSampling) {
      displaySamplingMix(report);
      $('samplingMix').hidden = false;
    }
    if (comparison === 'heights') displayHeightStudy();
    if (comparison === 'density') displayDensityStudy();
    if (comparison === 'heights' || comparison === 'density') displayValidationComparison();
    if (comparison === 'models' || comparison === 'heights' || comparison === 'features' || comparison === 'epochs' || customCutoff || compareBackground || compareSampling || compareForms) {
      const heights = comparison === 'heights';
      $('pairTitle').textContent = heights ? 'Which plants changed match when the peak height dropped?' :
        comparison === 'epochs' ? 'Which plants changed between the shortest and longest fits?' :
        customCutoff ? 'Which plants changed match at the trial cutoff?' :
        compareBackground ? 'Which plants changed after training on difficult backgrounds?' :
        compareSampling ? 'Which plants did each training sample find?' :
        comparison === 'features' ? 'Which plants changed match with local ground?' :
        compareForms ? 'Which plants did each training mix find?' : 'Which plants did each model find?';
      $('heightTurnover').hidden = !heights;
      const referenceRows = [...new Set(rows.map(row => row.seed))].map(seed => boxFits(seed)[0]);
      const options = referenceRows.flatMap(row => row.tiles.map(tile =>
        new Option((tile.ground?'With ground':'Ground removed')+' · field '+tile.seed+' · run '+row.seed, JSON.stringify([row.seed,tile.tile_id]))));
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
    if (sharedDistance === scoreDistance.value || scoreGround.value !== 'all') $('scoreDetails').open = true;
    displayFields();
    $('fieldDetails').open = $('fieldMetric').value !== 'mean';
    $('fieldDetails').hidden = false;
    $('export').disabled=false;
    let stamp = '';
    if (comparison === 'cutoffs') {
      displayCutoffChanges(report);
      $('cutoffChanges').hidden = false;
      $('cutoffChanges').open = customCutoff || requested.has('cutoffDistance');
      try {
        localStorage.setItem('crop-trainer-cutoff-scout', 'earned');
        stamp = ' Cutoff scout stamp earned.';
      } catch {}
    }
    view?.end('Benchmark complete');
    $('status').textContent='Benchmark complete · '+rows.length+' scored results in '+formatTime(report.elapsedMs)+'.'+stamp;
  }catch(error){
    view?.end(signal.aborted?'Benchmark canceled':'Benchmark interrupted');
    $('status').textContent=signal.aborted?'Canceled. Completed rows remain in Results.':'Benchmark failed. '+error.message;
  }finally{
    scans?.close();
    for (const input of lockedControls) input.disabled = false;
    $('cancel').disabled = true;
    explainComparison();
    controller=null;
  }
};
