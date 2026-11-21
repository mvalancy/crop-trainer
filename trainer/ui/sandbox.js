import {networkShape,featureNames} from '../models/network.js?v=field-test1';
import {createNetworkDiagram} from './network-diagram.js?v=detector-flow1';
export {featureNames};

export const runPresets = {
  practice: {train:16, validation:8, stopMode:'time', length:0.5},
  quick: {train:6, validation:3, stopMode:'epochs', length:40}
};

export function startingPreset(params) {
  // Existing experiment links replay the original fixed epoch and field counts.
  if (params.has('epochs') || params.get('plan') === 'quick') return 'quick';
  if (params.get('plan') === 'practice') return 'practice';
  const experimentKeys = ['embed', 'engine', 'seed', 'model', 'crop', 'sensor', 'validationSensor',
    'trainingRayBudget', 'validationRayBudget', 'threshold', 'minimumHeight', 'soilMetric', 'missBand'];
  return experimentKeys.some(key => params.has(key)) ? 'quick' : 'practice';
}

const $ = id => document.getElementById(id);
export function duration(ms) {
  const sec = Math.ceil(ms/1000);
  if (sec < 60) return sec+' s';
  const min = Math.floor(sec/60);
  return min < 60 ? min+' min '+sec%60+' s' : Math.floor(min/60)+' h '+min%60+' min';
}
export function modelSettings() {
  const neural = $('architecture').value === 'neural';
  return {model:neural ? 'neural' : 'linear',
    hiddenLayers:neural ? [...$('widths').querySelectorAll('input')].map(el=>el.valueAsNumber) : [],
    activation:$('activation').value, optimizer:$('optimizer').value, momentum:$('optimizer').value === 'momentum' ? $('momentum').valueAsNumber : .9,
    batchSize:Number($('batchSize').value),learningRate:$('learningRate').valueAsNumber, initSeed:neural ? $('initSeed').valueAsNumber : 12345};
}
function renderWidths() {
  const previous = [...$('widths').querySelectorAll('input')].map(el=>el.value);
  $('widths').replaceChildren();
  for (let i = 0; i < Number($('depth').value); i++) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'number'; input.inputMode = 'numeric'; input.min = 1; input.max = 32; input.step = 1;
    input.required = true; input.value = previous[i] ?? (i === 0 ? 4 : 8);
    input.dataset.helpLabel = 'Units in layer '+(i+1);
    input.dataset.help = 'Each unit learns its own weighted combination of the inputs. Increasing the width adds trainable weights. The diagram shows the new count before you run.';
    label.append('Layer '+(i+1)+' units',input); $('widths').append(label);
  }
}
let updateDiagram;
export function renderNetwork() {
  const settings = modelSettings(), neural = settings.model === 'neural';
  $('designTitle').textContent=neural ? 'Design the model' : 'How this model scores';
  $('initLabel').hidden = !neural; $('initSeed').disabled = !neural;
  $('hiddenEditor').hidden = !neural; $('hiddenEditor').disabled = !neural;
  $('momentumLabel').hidden = settings.optimizer !== 'momentum';
  $('momentum').disabled = settings.optimizer !== 'momentum';
  updateDiagram ??= createNetworkDiagram({
    svg:$('diagramLayers').ownerSVGElement, layers:$('diagramLayers'), summary:$('shapeSummary'),
    description:$('netDesc'), replayButton:$('replayNetwork'), replayLabel:$('networkReplayLabel'), stepLabel:$('networkStep')
  });
  updateDiagram(settings);
}
export function initSandbox(params) {
  if (params.get('model') === 'linear') $('architecture').value='linear';
  renderWidths(); renderNetwork();
  $('depth').addEventListener('input',renderWidths);
  for(const id of ['depth','widths','architecture','optimizer','activation']) $(id).addEventListener('input',renderNetwork);
}
export function trainInWorker(x,y,options,signal,onEpoch,onReady,onCheckpoint) {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const worker = new Worker(new URL('../models/fit-worker.js?v=live1',import.meta.url),{type:'module'});
    function close() {signal.removeEventListener('abort',abort);worker.terminate();}
    function abort() {close();reject(signal.reason);}
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror = event => {close();reject(Error(event.message));};
    worker.onmessage = ({data}) => {
      if (data.weights) {onCheckpoint?.(data.epoch,data.weights);return;}
      if (data.progress) {onEpoch(data.progress);return;}
      close();
      if (data.error) reject(Error(data.error)); else resolve(data.result);
    };
    onReady(()=>worker.postMessage({finish:true}));
    // Validation has its own feature arrays. Transfer the training split only.
    worker.postMessage({x,y,options,preview:!!onCheckpoint},[x.buffer,y.buffer]);
  });
}

const inputHelp = {
  'Smoothed peak height':'A weighted average of cell heights in a three-by-three window. The center has the most influence.',
  'Center cell height':'The highest return in the 5 cm cell containing the peak before smoothing.',
  'Mean inner height':'Average of the cell heights in the central three-by-three patch.',
  'Mean middle height':'Average cell height in the next band around the central patch.',
  'Mean outer height':'Average cell height in the outermost band, reaching about 20 cm from the peak.',
  'Peak above outer mean':'Smoothed peak height minus the outer band’s average height. Large values indicate a peak standing above its surroundings.',
  'High cells in middle ring':'Share of middle-band cells taller than both 7 cm and 65% of this peak’s smoothed height.',
  'High cells in outer ring':'Share of outer-band cells taller than both 7 cm and 65% of this peak’s smoothed height.',
  'Occupied inner cells':'Fraction of cells in the central patch that received at least one return.',
  'Occupied outer cells':'Fraction of outer-band cells that received at least one return.',
  'Log return count':'The logarithm of one plus the nearby return count. This compresses large differences in sampling density.',
  'Shape asymmetry':'Compares how widely the nearby height signal spreads across X and Y. Elongated patches can score higher than round patches.',
  'Peak above background':'The tallest nearby return minus a background estimate from the outer band. Background cell heights are capped at 8 cm for this estimate.'
};

export function inspectWeights(weights, hiddenLayers) {
  const {layers} = networkShape(featureNames.length,hiddenLayers);
  const select = $('weightLayer'), unit = $('weightUnit');
  select.replaceChildren(...layers.map((_,i)=>new Option(
    i===layers.length-1?'Output score':'Hidden layer '+(i+1),String(i))));
  function showUnit() {
    const index=select.selectedIndex, layer=layers[index];
    const base=layer.weight+unit.selectedIndex*(layer.inputs+1);
    const values=weights.slice(base,base+layer.inputs+1);
    const scale=Math.max(...values.map(Math.abs),1e-12);
    const rows=values.map((value,i)=>{
      const row=document.createElement('tr'), name=document.createElement('th');
      name.scope='row';
      name.textContent=i===layer.inputs?'Bias':index===0?featureNames[i]:'Unit '+(i+1);
      if(i===layer.inputs) name.dataset.help='The learned offset added to this unit’s weighted sum, even when its other inputs are zero.';
      else if(index===0) name.dataset.help=inputHelp[featureNames[i]];
      else name.dataset.help='The output from this numbered unit of the previous hidden layer feeds the unit you are inspecting.';
      row.append(name);
      const cell=row.insertCell(), bar=document.createElement('span');
      bar.className='weightBar';bar.setAttribute('aria-hidden','true');
      const fill=document.createElement('i');
      fill.style.width=(Math.abs(value)/scale*50)+'%';
      fill.className=value<0?'negative':'positive';bar.append(fill);
      cell.append(bar,document.createTextNode(value.toPrecision(5)));
      return row;
    });
    $('weightRows').replaceChildren(...rows);
  }
  function showLayer() {
    unit.replaceChildren(...Array.from({length:layers[select.selectedIndex].width},(_,i)=>new Option(String(i+1))));
    showUnit();
  }
  select.onchange=showLayer;unit.onchange=showUnit;showLayer();
  $('weightInspector').hidden=false;
}
