import {field} from './trainer/field.js?v=rays1';
import {makeRecipe} from './trainer/data.js?v=rays1';
import {getSensor, sensorOptions, sensorDetails, rayBudgetOptions} from './trainer/sensors.js?v=rays1';
import {createViewer} from './viewer.js';

const $ = id => document.getElementById(id);
const viewer = createViewer($('map'), {
  mode:$('mode'), view:$('view'), color:$('color'), pins:$('pins'), spin:$('spin'),
  zoomIn:$('zoomIn'), zoomOut:$('zoomOut'), reset:$('fit')
});
let scan, previousRayTrial;
sensorOptions($('scan'));
const requested = new URLSearchParams(location.search);
const obstacles = ['weeds', 'sticks', 'boards'];
for (const name of obstacles) {
  for (const [value,label] of [['seeded','From seed'],['on','Include'],['off','Exclude']]) $(name).add(new Option(label,value));
}
const replaySelects = [['crop', 'crop'], ['scan', 'sensor'], ['noise', 'noise'], ...obstacles.map(key => [key, key])];
for (const [id, key] of replaySelects) {
  const value = requested.get(key);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
rayBudgetOptions($('budget'), requested.get('budget'));
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= 0xffffffff) {
  $('seed').value = String(Number(requestedSeed));
}
if (requested.get('ground') === 'false') $('ground').checked = false;
$('scan').onchange = () => { $('sensorInfo').textContent = sensorDetails($('scan').value); };
$('scan').onchange();

function updateScanLink() {
  const url = new URL('./', location.href);
  for (const [id, key] of replaySelects) url.searchParams.set(key, $(id).value);
  url.searchParams.set('seed', scan.p.seed);
  url.searchParams.set('ground', scan.p.ground);
  url.searchParams.set('budget', $('budget').value);
  url.searchParams.set('tile', scan.labels.tile_id);
  url.hash = 'field';
  $('scanLink').href = url.href;
  $('copyScan').disabled = false;
  $('shareStatus').textContent = '';
}

$('copyScan').onclick = async () => {
  const href = $('scanLink').href;
  let message;
  try {
    await navigator.clipboard.writeText(href);
    message = 'Scan link copied.';
  } catch {
    message = 'Open the scan link and copy the address from your browser.';
  }
  if (href === $('scanLink').href) $('shareStatus').textContent = message;
};

function grow() {
  const crop = $('crop').value;
  const sensor = getSensor($('scan').value);
  const recipe = makeRecipe(Number($('seed').value), $('ground').checked, sensor, crop);
  if (Number($('budget').value)) recipe.points = Number($('budget').value);
  for (const key of obstacles) if ($(key).value !== 'seeded') recipe[key] = $(key).value === 'on';
  if ($('noise').value === 'clean') {
    for (const key of ['xy','z','density','gaps','stray','cluster']) recipe.scanNoise[key] = 0;
  } else if ($('noise').value === 'rough') {
    Object.assign(recipe.scanNoise,{xy:1.1,z:1.2,density:24,gaps:4,stray:.35,cluster:18});
  }
  scan = field(recipe);
  viewer.setScan(scan);
  updateScanLink();
  const trialKey = JSON.stringify({...recipe, points:undefined});
  if (previousRayTrial?.key === trialKey && previousRayTrial.sampledRays !== scan.sampledRays) {
    try { localStorage.setItem('crop-trainer-ray-scout', 'earned'); } catch {}
    journal();
  }
  previousRayTrial = {key:trialKey, sampledRays:scan.sampledRays};
  $('count').textContent = scan.labels.boxes.length+' '+crop+' plants · '+recipe.points.toLocaleString()+' rays requested · '+scan.sampledRays.toLocaleString()+' sampled · '+scan.cls.length.toLocaleString()+' returns · seed '+recipe.seed;
  $('scanId').textContent = scan.labels.tile_id;
  const bins=['Soil','Crop','Weeds','Sticks','Boards','Stray'];
  $('readouts').replaceChildren(...bins.map((name,i)=>{
    const entry=document.createElement('div'), term=document.createElement('dt'), count=document.createElement('dd');
    term.textContent=name; count.textContent=(scan.counts[i]||0).toLocaleString();entry.append(term,count);return entry;
  }));
  const training = new URLSearchParams({crop,sensor:sensor.key});
  if (Number($('budget').value)) training.set('validationRayBudget', $('budget').value);
  $('trainLayout').href = 'trainer/?'+training;
  $('ply').disabled=$('labels').disabled=$('recipe').disabled=false;
}
$('grow').onsubmit = event => { event.preventDefault(); grow(); };
function download(parts, extension) {
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob(parts));
  link.href=url;link.download=scan.labels.tile_id+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('labels').onclick=()=>download([JSON.stringify(scan.labels,null,2)],'.labels.json');
$('recipe').onclick=()=>download([JSON.stringify({generator:'crop-trainer-v1',tile_id:scan.labels.tile_id,recipe:scan.p},null,2)],'.recipe.json');
$('ply').onclick=()=>{
  const bytes=new DataView(new ArrayBuffer(scan.xyz.byteLength));
  scan.xyz.forEach((v,i)=>bytes.setFloat32(i*4,v,true));
  download(['ply\nformat binary_little_endian 1.0\nelement vertex '+scan.cls.length+'\nproperty float x\nproperty float y\nproperty float z\nend_header\n',bytes],'.ply');
};
function journal(){
  try{
    const history=JSON.parse(localStorage.getItem('crop-trainer-farm-v1')||'{}');
    for(const [key,done] of [['first',history.seeds?.length],['scout',history.mixed],['saver',history.seeds?.length>=2],['rayScout',localStorage.getItem('crop-trainer-ray-scout')==='earned'],['cutoffScout',localStorage.getItem('crop-trainer-cutoff-scout')==='earned']]){
      const el=$(key);el.textContent=done?'Stamp earned':'Open';el.parentElement.classList.toggle('earned',Boolean(done));
    }
  }catch{}
}
window.addEventListener('pageshow', journal);
window.addEventListener('storage', journal);
grow();
const expectedTile = requested.get('tile');
if (/^[0-9a-f]{16}$/.test(expectedTile) && scan.labels.tile_id !== expectedTile) {
  $('shareStatus').textContent = 'This link expected tile ' + expectedTile + '. These settings generated ' + scan.labels.tile_id + '.';
}
journal();
