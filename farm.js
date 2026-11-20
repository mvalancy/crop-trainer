import {cropProfile} from './trainer/crops.js?v=systems1';
import {field} from './trainer/field.js?v=systems1';
import {makeRecipe} from './trainer/data.js?v=systems1';
import {getSensor, sensorOptions, sensorDetails, rayBudgetOptions} from './trainer/sensors.js?v=rays1';
import {createViewer} from './viewer.js?v=systems1';

const $ = id => document.getElementById(id);
const viewer = createViewer($('map'), {
  mode:$('mode'), view:$('view'), highlight:$('highlight'), color:$('color'), pins:$('pins'), spin:$('spin'),
  zoomIn:$('zoomIn'), zoomOut:$('zoomOut'), reset:$('fit'), focus:$('focusPlant')
});
let scan, previousRayTrial;
function showSystemControls() {
  const profile=cropProfile($('crop').value);
  $('fixturesLabel').hidden=!profile.fixtures;
  $('systemInfo').hidden=!profile.system;
  $('systemInfo').textContent=profile.description || '';
}
sensorOptions($('scan'));
const requested = new URLSearchParams(location.search);
$('crop').addEventListener('change',showSystemControls);
const obstacles = ['weeds', 'sticks', 'boards'];
for (const name of obstacles) {
  for (const [value,label] of [['seeded','From seed'],['on','Include'],['off','Exclude']]) $(name).add(new Option(label,value));
}
const replaySelects = [['crop', 'crop'], ['scan', 'sensor'], ['noise', 'noise'], ...obstacles.map(key => [key, key])];
for (const [id, key] of replaySelects) {
  const value = requested.get(key);
  if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
}
showSystemControls();
$('fixtures').checked=requested.get('fixtures')!=='off';
rayBudgetOptions($('budget'), requested.get('budget'));
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= 0xffffffff) {
  $('seed').value = String(Number(requestedSeed));
}
if (requested.get('ground') === 'false') $('ground').checked = false;
$('scan').onchange = () => { $('sensorInfo').textContent = sensorDetails($('scan').value); };
$('scan').onchange();

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

function updateBoxLink() {
  $('focusPlant').disabled = $('highlight').value === '';
  const url = new URL($('scanLink').href);
  if ($('highlight').value === '') url.searchParams.delete('box');
  else url.searchParams.set('box', $('highlight').value);
  $('scanLink').href = url.href;
  $('shareStatus').textContent = '';
}
$('highlight').addEventListener('change', updateBoxLink);

function grow() {
  const crop = $('crop').value;
  const sensor = getSensor($('scan').value);
  const recipe = makeRecipe(Number($('seed').value), $('ground').checked, sensor, crop);
  if (cropProfile(crop).fixtures) recipe.infrastructure=$('fixtures').checked;
  if (Number($('budget').value)) recipe.points = Number($('budget').value);
  for (const key of obstacles) if ($(key).value !== 'seeded') recipe[key] = $(key).value === 'on';
  if ($('noise').value === 'clean') {
    for (const key of ['xy','z','density','gaps','stray','cluster']) recipe.scanNoise[key] = 0;
  } else if ($('noise').value === 'rough') {
    Object.assign(recipe.scanNoise,{xy:1.1,z:1.2,density:24,gaps:4,stray:.35,cluster:18});
  }
  const url = new URL('./', location.href);
  for (const [id, key] of replaySelects) url.searchParams.set(key, $(id).value);
  url.searchParams.set('budget', $('budget').value);
  if(recipe.infrastructure===false) url.searchParams.set('fixtures','off');
  const previous = scan ? new URL($('scanLink').href) : new URL(location.href);
  showScan(recipe, url, previous.searchParams.get('box'), previous.searchParams.get('tile'));
}

// The URL carries the applied scan settings, even while the form has pending edits.
function showScan(recipe, url, selectedBox, expectedTile) {
  scan = field(recipe);
  const choices = scan.plantReturns.map((returns, box) => new Option('Box '+box+' · '+returns+' crop returns', String(box)));
  $('highlight').replaceChildren(new Option('None', ''), ...choices);
  if ((!expectedTile || expectedTile === scan.labels.tile_id) && /^\d+$/.test(selectedBox) && Number(selectedBox) < choices.length) {
    $('highlight').value = String(Number(selectedBox));
  }
  viewer.setScan(scan);
  url.searchParams.set('seed', recipe.seed);
  url.searchParams.set('ground', recipe.ground);
  url.searchParams.set('tile', scan.labels.tile_id);
  url.hash = 'field';
  $('scanLink').href = url.href;
  $('copyScan').disabled = false;
  $('switchSoil').disabled = false;
  const profile=cropProfile(recipe.crop);
  const ground=profile.system==='greenhouse'?'floor':'soil';
  $('switchSoil').textContent = recipe.ground ? 'View without '+ground : 'View with '+ground;
  updateBoxLink();
  const trialKey = JSON.stringify({...recipe, points:undefined});
  if (previousRayTrial?.key === trialKey && previousRayTrial.sampledRays !== scan.sampledRays) {
    try { localStorage.setItem('crop-trainer-ray-scout', 'earned'); } catch {}
    journal();
  }
  previousRayTrial = {key:trialKey, sampledRays:scan.sampledRays};
  $('count').textContent = scan.labels.boxes.length+' '+(profile.system?profile.name:recipe.crop)+' plants · '+recipe.points.toLocaleString()+' rays requested · '+scan.sampledRays.toLocaleString()+' sampled · '+scan.cls.length.toLocaleString()+' returns · '+(ground+(recipe.ground?' included':' removed'))+' · seed '+recipe.seed;
  $('scanId').textContent = scan.labels.tile_id;
  const {zero, oneToFour, fiveOrMore} = scan.coverage;
  $('plantCoverage').textContent = zero+' plants with zero crop returns · '+oneToFour+' with 1–4 · '+fiveOrMore+' with 5 or more';
  const bins=[ground==='floor'?'Floor':'Soil','Crop','Weeds','Sticks','Boards','Stray'];
  if(profile.fixtures) bins.push('Fixtures');
  $('readouts').replaceChildren(...bins.map((name,i)=>{
    const entry=document.createElement('div'), term=document.createElement('dt'), count=document.createElement('dd');
    term.textContent=name; count.textContent=(scan.counts[i]||0).toLocaleString();entry.append(term,count);return entry;
  }));
  const training = new URLSearchParams({crop:recipe.crop,sensor:recipe.sampling.key});
  const budget = url.searchParams.get('budget');
  if (Number(budget)) training.set('validationRayBudget', budget);
  $('trainLayout').textContent=recipe.infrastructure===false?'Train this crop and layout with fixtures →':'Train this crop and layout →';
  $('trainLayout').href = 'trainer/?'+training;
  $('ply').disabled=$('labels').disabled=$('recipe').disabled=false;
}
$('switchSoil').onclick = () => {
  const recipe = {...scan.p, ground:!scan.p.ground};
  $('ground').checked = recipe.ground;
  showScan(recipe, new URL($('scanLink').href), $('highlight').value);
};
$('grow').onsubmit = event => { event.preventDefault(); grow(); };
function download(parts, extension) {
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob(parts));
  link.href=url;link.download=scan.labels.tile_id+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('labels').onclick=()=>download([JSON.stringify({...scan.labels, crop_returns_per_box:scan.plantReturns},null,2)],'.labels.json');
$('recipe').onclick=()=>download([JSON.stringify({generator:'crop-trainer-v1',tile_id:scan.labels.tile_id,recipe:scan.p},null,2)],'.recipe.json');
$('ply').onclick=()=>{
  const bytes=new DataView(new ArrayBuffer(scan.xyz.byteLength));
  scan.xyz.forEach((v,i)=>bytes.setFloat32(i*4,v,true));
  download(['ply\nformat binary_little_endian 1.0\nelement vertex '+scan.cls.length+'\nproperty float x\nproperty float y\nproperty float z\nend_header\n',bytes],'.ply');
};
function journal(){
  try{
    const history=JSON.parse(localStorage.getItem('crop-trainer-farm-v1')||'{}');
    for(const [key,done] of [['first',history.seeds?.length],['scout',history.mixed],['saver',history.seeds?.length>=2],['modelScout',localStorage.getItem('crop-trainer-model-scout')==='earned'],['rayScout',localStorage.getItem('crop-trainer-ray-scout')==='earned'],['peakScout',localStorage.getItem('crop-trainer-peak-scout')==='earned'],['cutoffScout',localStorage.getItem('crop-trainer-cutoff-scout')==='earned']]){
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
