import {networkShape,featureNames} from './network.js?v=field-test1';
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
    input.type = 'number'; input.min = 1; input.max = 32; input.step = 1;
    input.required = true; input.value = previous[i] ?? (i === 0 ? 4 : 8);
    label.append('Layer '+(i+1)+' units',input); $('widths').append(label);
  }
}
function svg(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
  return element;
}
export function renderNetwork() {
  const settings = modelSettings(), neural = settings.model === 'neural';
  $('designTitle').textContent=neural ? 'Design the model' : 'How this model scores';
  $('initLabel').hidden = !neural; $('initSeed').disabled = !neural;
  $('hiddenEditor').hidden = !neural; $('hiddenEditor').disabled = !neural;
  $('momentumLabel').hidden = settings.optimizer !== 'momentum';
  $('momentum').disabled = settings.optimizer !== 'momentum';
  const group = $('diagramLayers'); group.replaceChildren();
  if (settings.hiddenLayers.some(n=>!Number.isInteger(n)||n<1||n>32)) {
    $('shapeSummary').textContent = 'Choose 1–32 units for each hidden layer.'; return;
  }
  const sizes = [13,...settings.hiddenLayers,1], shape = networkShape(13,settings.hiddenLayers,settings.activation);
  $('shapeSummary').textContent = sizes.join(' → ')+' · '+shape.count.toLocaleString()+' trainable parameters';
  const columns = sizes.map((n,i) => {
    const visible = Math.min(n,5);
    return Array.from({length:visible},(_,j)=>({x:32+256*i/(sizes.length-1), y:54+(j-(visible-1)/2)*15}));
  });
  for (let i=1;i<columns.length;i++) {
    for (const a of columns[i-1]) for (const b of columns[i]) {
      group.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'netWire'}));
    }
    const a = columns[i-1][Math.floor(columns[i-1].length/2)], b = columns[i][Math.floor(columns[i].length/2)];
    group.append(svg('path',{d:'M'+a.x+' '+a.y+'L'+b.x+' '+b.y,class:'netPulse',pathLength:100}));
  }
  columns.forEach((column,i) => {
    for (const {x,y} of column) group.append(svg('circle',{cx:x,cy:y,r:i===columns.length-1?7:4.5,class:i===columns.length-1?'netPin':'netUnit'}));
    const text = svg('text',{x:column[0].x,y:111,'text-anchor':'middle'});
    text.textContent = i===0?'13 in':i===sizes.length-1?'1 out':String(sizes[i]);
    group.append(text);
  });
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
    const worker = new Worker(new URL('./fit-worker.js?v=live1',import.meta.url),{type:'module'});
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
