import {field} from '../trainer/generator/field.js';
import {buildDataset} from '../trainer/models/data.js?v=scaling1';
import {selectHardNegatives} from '../trainer/models/hard-negatives.js';
import {selectDistanceMatched} from '../trainer/models/distance-bands.js';
import {scoreSavedWeights, trainerId, weightArtifact} from '../trainer/models/network.js';
import {trainNetworkCPU} from '../trainer/models/neural.js';

export const backgroundLabels = new Map([['ordinary', 'Shuffled background'], ['half-hard', 'Half difficult background']]);
export const backgroundFit = {hiddenLayers:[4], activation:'tanh', optimizer:'sgd', batchSize:0, lr:.25, initSeed:12345};
export const backgroundCutoff = .65;

export function backgroundWeights(set, weights, settings, epochs) {
  const config = {...settings, ...backgroundFit, threshold:backgroundCutoff};
  return weightArtifact({settings:config, stats:set.stats, scaling:set.scaling, weights, epochs, trainer:trainerId(config)});
}

// Only training scenes have a forced weed patch. Test scenes keep their normal
// generator recipes, so the same tile IDs open in the shared 3D field viewer.
export async function prepareBackgroundPair(settings, {signal, generate=field, onScan, onStage, onEpoch, crossScales=false}) {
  const options = {...settings, signal, onScan, keepRawFeatures:crossScales, generate(recipe, step) {
    const scene = step.split === 'Training' ? {...recipe, weeds:true, sticks:false, boards:false, scanNoise:null} : recipe;
    return generate(scene);
  }};
  onStage('ordinary');
  let start = performance.now();
  const ordinary = await buildDataset(options);
  const ordinaryMs = performance.now() - start;
  onStage('pilot');
  start = performance.now();
  const pilot = await trainNetworkCPU(ordinary.X, ordinary.Y, {...backgroundFit, epochs:40, dims:ordinary.dims, signal, onEpoch});
  const pilotWeights = backgroundWeights(ordinary, pilot.weights, settings, 40);
  const pilotMs = performance.now() - start;

  const difficult = crossScales ? 'distance-matched' : 'half-hard';
  onStage(difficult);
  let ordinarySelection, hardSelection;
  start = performance.now();
  const hard = await buildDataset({...options, includeNegativeDistances:crossScales, selectNegativeRows(raw, count, dims, distances) {
    const scoringStart = performance.now();
    const scores = scoreSavedWeights(raw, pilotWeights, settings.peakAveraging, settings.featureMode);
    const pilotScoringMs = performance.now() - scoringStart;
    const selectionStart = performance.now(), hardCount = Math.floor(count / 2);
    const {indices, bands} = crossScales
      ? selectDistanceMatched(scores, count, {sampling:difficult, hardCount}, distances)
      : {indices:selectHardNegatives(scores, count, hardCount)};
    const rankingMs = performance.now() - selectionStart;
    const pilot = {eligible:scores.length, selected:count, pilotEpochs:40, pilotMs, pilotScoringMs, rankingMs};
    function scoreBin(score) { return Math.min(3, Math.floor(score*4)); }
    const shuffledBins = [0,0,0,0], hardBins = [0,0,0,0];
    for (let i = 0; i < count; i++) {
      shuffledBins[scoreBin(scores[i])]++;
      hardBins[scoreBin(scores[indices[i]])]++;
    }
    ordinarySelection = {...pilot, hardCount:0, ordinaryRetained:count, scoreBins:shuffledBins};
    hardSelection = {...pilot, ...(bands ? {bands} : {}), hardCount, ordinaryRetained:indices.filter(i=>i < count).length, scoreBins:hardBins};
    return indices;
  }});
  const rebuildMs = performance.now() - start;
  if (!hardSelection || ordinary.Y.length !== hard.Y.length || ordinary.manifest.length !== hard.manifest.length ||
      ordinary.manifest.some((tile,i) => tile.tile_id !== hard.manifest[i].tile_id)) {
    throw new Error('The background fits need the same fields and example budget.');
  }
  return {
    ordinary:{set:ordinary, generationMs:ordinaryMs, selection:ordinarySelection},
    [difficult]:{set:hard, generationMs:rebuildMs-hardSelection.pilotScoringMs-hardSelection.rankingMs,
      selection:{...hardSelection, rebuildMs}}
  };
}

export function showBackgroundModels(report, download) {
  const choice = document.getElementById('negativeModel'), button = document.getElementById('downloadNegative');
  choice.replaceChildren(...report.rows.map((row, i) => new Option(row.seed+' · '+(row.negativeSampling === 'ordinary' ? 'Shuffled' : 'Half difficult'), i)));
  function showSelection() {
    const row = report.rows[Number(choice.value)], hard = row.negativeSampling === 'half-hard';
    const {eligible, selected, hardCount, ordinaryRetained} = row.backgroundSelection;
    const count = n => n.toLocaleString();
    const kept = hard ? count(hardCount)+' slots went to the highest practice scores. The two fits shared '+count(ordinaryRetained)+' background peaks.'
      : 'The control took its background peaks in shuffled order.';
    document.getElementById('negativeReceipt').textContent = 'This fit used '+count(selected)+' crop peaks and '+count(selected)
      +' of '+count(eligible)+' eligible background peaks. '+kept;
    const pair = report.rows.filter(other=>other.seed === row.seed);
    const timing = pair.find(other=>other.negativeSampling === 'half-hard').backgroundSelection;
    const duration = ms => ms < 1000 ? ms.toFixed(1)+' ms' : (ms/1000).toFixed(2)+' s';
    document.getElementById('pilotFitTime').textContent = duration(timing.pilotMs);
    document.getElementById('poolScoreTime').textContent = duration(timing.pilotScoringMs);
    document.getElementById('rankTime').textContent = duration(timing.rankingMs);
    document.getElementById('rebuildTime').textContent = duration(timing.rebuildMs);
    drawBackgroundBins(pair);
    button.onclick = () => download(row.weightArtifact, 'crop-weights-'+report.settings.crop+'-'+row.negativeSampling+'-'+row.seed+'.json');
  }
  choice.onchange = showSelection;
  showSelection();
}

function drawBackgroundBins(rows) {
  const draws = [...backgroundLabels.keys()].map(mode => rows.find(row=>row.negativeSampling === mode).backgroundSelection);
  const body = document.getElementById('backgroundBins');
  body.replaceChildren();
  const ranges = ['0 to <0.25', '0.25 to <0.50', '0.50 to <0.75', '0.75 to 1'];
  for (const [i, range] of ranges.entries()) {
    const row = body.insertRow(), title = document.createElement('th');
    title.scope = 'row';
    title.textContent = range;
    row.append(title);
    for (const draw of draws) {
      const cell = row.insertCell(), matches = draw.scoreBins[i];
      cell.textContent = matches.toLocaleString();
      cell.style.setProperty('--fraction', 100*matches/draw.selected+'%');
      cell.dataset.help = matches+' of '+draw.selected+' selected background peaks fell into this practice score range.';
    }
  }
}
