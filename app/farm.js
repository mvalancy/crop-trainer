import {encodePly} from '../trainer/field-test/ply.js?v=export1';
import {setupFirstSteps} from './first-steps.js';
import {initScanStudy} from '../trainer/study/scan-study-ui.js?v=damage-study1';
import {createFieldLesson} from './field-lesson.js';
import {cropProfile} from '../trainer/generator/crops.js?v=systems1';
import {scanSession} from '../trainer/generator/scan-session.js?v=plants3';
import {makeRecipe} from '../trainer/models/data.js?v=plants3';
import {formsFor} from '../trainer/plants/forms.js';
import {setupFieldPlants} from '../trainer/plants/field-controls.js?v=scan-settings2';
import {getSensor, sensorOptions, sensorDetails, rayBudgetOptions, layoutCapacity, DEFAULT_GENERATOR_RAYS} from '../trainer/generator/sensors.js?v=dense1';
import {createLiveScene} from '../trainer/ui/live-scene.js';
import {createViewer} from './viewer.js?v=wood2';

const $ = id => document.getElementById(id);
let fieldLesson;
setupFirstSteps(() => {
  if (!fieldLesson) {
    fieldLesson = createFieldLesson($('pinPractice'));
    if (scan) fieldLesson.setScan(scan);
  }
});
const viewer = createViewer($('map'), {
  mode:$('mode'), view:$('view'), highlight:$('highlight'), color:$('color'), pins:$('pins'), stems:$('modelStems'), spin:$('spin'),
  zoomIn:$('zoomIn'), zoomOut:$('zoomOut'), reset:$('fit')
});
function updateTissueLegend() {
  $('tissueLegend').hidden = $('color').value !== 'tissue';
  $('modelLegend').hidden = !$('modelStems').checked;
}
$('color').addEventListener('change', updateTissueLegend);
$('modelStems').addEventListener('change', updateTissueLegend);
const live=createLiveScene($('scanScene'));
let scan, previousRayTrial;
function showSystemControls() {
  const profile=cropProfile($('crop').value);
  $('fixturesLabel').hidden=!profile.fixtures;
  $('systemInfo').hidden=!profile.system;
  $('systemInfo').textContent=profile.description || '';
}
sensorOptions($('scan'));
const requested = new URLSearchParams(location.search);
const scanStudy=initScanStudy(requested);
const narrowField = matchMedia('(max-width: 740px)');
const growForm = $('grow');
function revealSetting(control) {
  for (let parent = control; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
}
function followSettingsLink() {
  const target = $(location.hash.slice(1));
  if (!target?.closest('#advanced-scan')) return;
  revealSetting(target);
  requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'instant'}));
}
window.addEventListener('hashchange', followSettingsLink);
document.addEventListener('invalid', event => {
  if (event.target.form === growForm) revealSetting(event.target);
}, true);
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
// Links from earlier versions without a budget replay the original seeded scan.
rayBudgetOptions($('budget'), requested.size ? requested.get('budget') : DEFAULT_GENERATOR_RAYS);
const requestedSeed = requested.get('seed');
if (/^\d+$/.test(requestedSeed) && Number(requestedSeed) <= 0xffffffff) {
  $('seed').value = String(Number(requestedSeed));
} else if (requestedSeed !== null) {
  $('seed').value = '';
}
const plantSettings = setupFieldPlants(requested);
if (requested.get('ground') === 'false') $('ground').checked = false;
function showResolution() {
  const sensor = getSensor($('scan').value);
  const capacity = layoutCapacity(sensor);
  const budget = Number($('budget').value);
  const sampled = Math.min(capacity, budget);
  const budgetLabel = budget ? budget.toLocaleString()+' rays requested' : 'seeded ray budget';
  $('scanPreset').textContent = $('scan').selectedOptions[0].textContent+' · '+budgetLabel;
  $('sensorInfo').textContent = sensorDetails(sensor.key);
  let detail = 'Layout limit: '+capacity.toLocaleString()+' rays per scan.';
  if (budget && sensor.key === 'reference') {
    const pitch = 1000 / Math.ceil(Math.sqrt(sampled));
    detail = 'Grid cells are about '+Number(pitch.toFixed(2))+' cm wide across the 10 m plot, with one ray per sampled cell.';
  } else if (budget > capacity) {
    detail += ' This budget fills the layout. Choose Reference for a denser grid.';
  }
  $('resolutionInfo').textContent = detail;
}
$('scan').onchange = $('budget').onchange = showResolution;
showResolution();

// Show a bad shared choice at the control while dependent menus can still
// describe their default crop or sensor. Selecting any real option repairs it.
for (const [id, key] of [...replaySelects, ['budget', 'budget']]) {
  if (!requested.has(key)) continue;
  const control = $(id);
  const requestedValue = requested.get(key);
  const value = id === 'budget' && /^\d+$/.test(requestedValue) ? String(Number(requestedValue)) : requestedValue;
  if ([...control.options].some(option => option.value === value)) continue;
  const invalidOption = new Option('Unsupported choice · choose again', control.value);
  invalidOption.disabled = true;
  control.prepend(invalidOption);
  invalidOption.selected = true;
  control.setCustomValidity('Choose a supported '+key+' for this scan.');
  control.addEventListener('change', () => {
    invalidOption.remove();
    control.setCustomValidity('');
  }, {once:true});
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

function updateBoxLink() {
  $('focusPlant').disabled = !scan?.labels.boxes.length;
  $('focusPlant').textContent = $('highlight').value === '' ? 'Explore a plant' : 'Focus plant';
  if (!scan) return;
  const url = new URL($('scanLink').href);
  if ($('highlight').value === '') url.searchParams.delete('box');
  else url.searchParams.set('box', $('highlight').value);
  $('scanLink').href = url.href;
  $('shareStatus').textContent = '';
}
$('highlight').addEventListener('change', updateBoxLink);
$('focusPlant').onclick = () => {
  if (!scan?.plantReturns.length) return;
  if ($('highlight').value === '') {
    // Start the close-up on a canopy with plenty of visible scan points.
    const returns = scan.plantReturns;
    let best = 0;
    for (let i = 1; i < returns.length; i++) {
      if (returns[i] > returns[best]) best = i;
    }
    $('highlight').value = String(best);
    updateBoxLink();
  }
  viewer.focusPlant();
  $('map').focus({preventScroll:true});
  if (narrowField.matches) $('scan-viewer').scrollIntoView({block:'start'});
};

function grow(checkReplay = false) {
  if (!growForm.reportValidity()) {
    $('generationStatus').textContent = 'Check the highlighted scan setting, then grow the field.';
    if (checkReplay) {
      const invalid = Array.from(growForm.elements).find(control => control.willValidate && !control.validity.valid);
      if (invalid) requestAnimationFrame(() => {
        invalid.focus({preventScroll:true});
        invalid.scrollIntoView({block:'center',behavior:'instant'});
      });
    }
    return;
  }
  const crop = $('crop').value;
  const sensor = getSensor($('scan').value);
  let plants;
  try { plants = plantSettings(); } catch (error) { $('generationStatus').textContent=error.message;return; }
  const recipe = {...makeRecipe(Number($('seed').value), $('ground').checked, sensor, crop,plants.plantArchitecture), ...plants};
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
  for(const [key,value] of Object.entries(plants)) url.searchParams.set(key,value);
  url.searchParams.set('budget', $('budget').value);
  if(recipe.infrastructure===false) url.searchParams.set('fixtures','off');
  const previous = scan ? new URL($('scanLink').href) : new URL(location.href);
  showScan(recipe, url, previous.searchParams.get('box'), previous.searchParams.get('tile'), checkReplay);
}

// The URL carries the applied scan settings, even while the form has pending edits.
let scanController;
async function showScan(recipe, url, selectedBox, expectedTile, checkReplay = false) {
  scanController?.abort();
  scanStudy.pause();
  scanController=new AbortController();
  const {signal}=scanController, session=scanSession(signal);
  live.reset();
  const name=cropProfile(recipe.crop).name;
  const scene={title:name+' canopy',metric:'Preparing terrain',legend:'Sampled canopy and terrain',detail:'Seed '+recipe.seed,fraction:0};
  live.show(scene);
  $('generationStatus').textContent = 'Building the scan…';
  if(!checkReplay && narrowField.matches) $('scan-viewer').scrollIntoView({block:'start'});
  try {
    const value=await session.generate(recipe,frame=>{
      live.show({cloud:frame.cloud,metric:'Row '+frame.row+' / '+frame.rows,
        detail:frame.row===frame.rows?'Applying scan settings':'Seed '+recipe.seed,fraction:frame.row/frame.rows});
    });
    if(signal.aborted)return;
    live.reset();
    applyScan(value, recipe, url, selectedBox, expectedTile);
    $('generationStatus').textContent = '';
    if (checkReplay && /^[0-9a-f]{16}$/.test(expectedTile) && expectedTile !== value.labels.tile_id) {
      $('shareStatus').textContent = 'This link expected tile '+expectedTile+'. These settings generated '+value.labels.tile_id+'.';
    }
  }catch(error){
    if(signal.aborted)return;
    live.reset();
    scanStudy.resume();
    $('generationStatus').textContent = error.message+'. Try another ray budget.';
  }finally{session.close();}
}

function applyScan(value, recipe, url, selectedBox, expectedTile) {
  scan = value;
  const choices = scan.plantReturns.map((returns, box) => new Option('Box '+box+' · '+returns+' crop returns', String(box)));
  $('highlight').replaceChildren(new Option('None', ''), ...choices);
  if ((!expectedTile || expectedTile === scan.labels.tile_id) && /^\d+$/.test(selectedBox) && Number(selectedBox) < choices.length) {
    $('highlight').value = String(Number(selectedBox));
  }
  viewer.setScan(scan);
  updateTissueLegend();
  $('stemSummary').hidden = !scan.parts;
  if (scan.parts) {
    let stemHits = 0;
    for (const part of scan.parts) if (part === 1) stemHits++;
    $('stemSummary').textContent = (scan.skeleton.length/6).toLocaleString()+
      ' modeled stem segments · '+stemHits.toLocaleString()+' scan returns hit stem or wood.';
  }
  fieldLesson?.setScan(scan);
  url.searchParams.set('seed', recipe.seed);
  url.searchParams.set('ground', recipe.ground);
  url.searchParams.set('tile', scan.labels.tile_id);
  url.hash = 'field';
  $('scanLink').href = url.href;
  scanStudy.setScan(scan,url.href);
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
  $('fieldCaption').textContent = profile.name+' · '+scan.labels.boxes.length.toLocaleString()+' plants';
  const composition=$('plantComposition');
  composition.hidden=!scan.labels.plantArchitecture;
  if(!composition.hidden) {
    const forms=formsFor(recipe.crop);
    const text=forms.map(({id,label})=>[label,scan.labels.boxes.filter(b=>b.plant_form===id).length])
      .filter(([,count])=>count).map(([name,count])=>count+' '+name.toLowerCase());
    const damaged=scan.labels.boxes.filter(b=>b.plant_condition==='damaged').length;
    composition.textContent=text.join(' · ')+' · '+damaged+' damaged';
  }
  const {zero, oneToFour, fiveOrMore} = scan.coverage;
  $('plantCoverage').textContent = zero+' plants with zero crop returns · '+oneToFour+' with 1–4 · '+fiveOrMore+' with 5 or more';
  const bins=[ground==='floor'?'Floor':'Soil','Crop','Weeds','Sticks','Boards','Stray'];
  if(profile.fixtures) bins.push('Fixtures');
  $('readouts').replaceChildren(...bins.map((name,i)=>{
    const entry=document.createElement('div'), term=document.createElement('dt'), count=document.createElement('dd');
    term.textContent=name; count.textContent=(scan.counts[i]||0).toLocaleString();entry.append(term,count);return entry;
  }));
  const training = new URLSearchParams({plan:'practice',crop:recipe.crop,sensor:recipe.sampling.key});
  const budget = url.searchParams.get('budget');
  training.set('plantArchitecture',recipe.plantArchitecture??1);
  if(requested.get('peakAveraging')==='occupied')training.set('peakAveraging','occupied');
  if(recipe.plantArchitecture>=2){
    training.set('plantForm',recipe.plantForm);training.set('plantCondition',recipe.plantCondition);
  }
  if (Number(budget)) training.set('validationRayBudget', budget);
  $('trainLayout').textContent=recipe.infrastructure===false?'Train this crop and layout with fixtures →':'Train this crop and layout →';
  if(recipe.appleCanopy==='dormant') $('trainLayout').textContent='Train on leafy orchard fields →';
  $('trainLayout').href = 'trainer/?'+training;
  $('lessonTrain').href = $('trainLayout').href;
  $('lessonCrop').textContent = profile.name;
  $('ply').disabled=$('labels').disabled=$('recipe').disabled=false;
}
$('switchSoil').onclick = () => {
  const recipe = {...scan.p, ground:!scan.p.ground};
  $('ground').checked = recipe.ground;
  showScan(recipe, new URL($('scanLink').href), $('highlight').value);
};
growForm.onsubmit = event => {
  event.preventDefault();
  if (event.submitter === $('applyScanSettings')) {
    $('scan-viewer').focus({preventScroll:true});
    if (!narrowField.matches) $('scan-viewer').scrollIntoView({block:'start'});
  }
  grow();
};
function download(parts, extension) {
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob(parts));
  link.href=url;link.download=scan.labels.tile_id+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('labels').onclick=()=>download([JSON.stringify({...scan.labels, crop_returns_per_box:scan.plantReturns},null,2)],'.labels.json');
$('recipe').onclick=()=>download([JSON.stringify({generator:'crop-trainer-v1',tile_id:scan.labels.tile_id,recipe:scan.p},null,2)],'.recipe.json');
$('ply').onclick=()=>download([encodePly(scan.xyz)],'.ply');
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
followSettingsLink();
grow(true);
journal();
