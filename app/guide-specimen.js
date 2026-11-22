import {inspectFirstPlant} from '../trainer/plants/field-controls.js';
import {compareSpecimens,orbitSpecimens} from '../trainer/plants/portrait.js';
import {formsFor} from '../trainer/plants/forms.js';

const root=document.querySelector('.guideSpecimen');
const crop=root.dataset.crop, seed=27, version=crop==='apple'?4:3;
root.innerHTML='<h2>What changes when this plant is damaged?</h2><p>Turn the two models together. They grew from the same seed. The hatched area shows tissue missing from this angle.</p>'+
  '<label>Plant form <select></select></label><div class="specimenPair">'+
  ['Intact','Damaged'].map(name=>'<figure><canvas width="420" height="290" role="img"></canvas><figcaption>'+name+'</figcaption></figure>').join('')+
  '</div><label>View angle <input type="range" min="0" max="355" step="5" value="35"></label>'+
  '<label><input type="checkbox" checked> Highlight missing tissue</label><p class="specimenFinding" role="status"></p><a>Scan this plant form →</a>';
const canvases=[...root.querySelectorAll('canvas')], angle=root.querySelector('input[type=range]');
const gaps=root.querySelector('input[type=checkbox]'), select=root.querySelector('select');
for (const {id,label} of formsFor(crop)) select.add(new Option(label,id));
const paint=compareSpecimens(...canvases);
let specimen,request;
function redraw() {
  angle.setAttribute('aria-valuetext',angle.value+' degrees');
  if (!request) request=requestAnimationFrame(()=>{
    request=0;
    if(specimen) paint(specimen.pair,Number(angle.value),gaps.checked,false);
  });
}
function update() {
  specimen=inspectFirstPlant(crop,version,select.value,'damaged','leafy',seed);
  if (!specimen) return;
  root.querySelector('.specimenFinding').textContent=specimen.detail;
  canvases.forEach((c,i)=>c.setAttribute('aria-label',(i?'Damaged ':'Intact ')+specimen.name));
  const target=new URL('../',import.meta.url);
  target.search=new URLSearchParams({crop,seed,plantForm:select.value,plantArchitecture:version,plantCondition:'damaged'});
  target.hash='anatomySettings';
  root.querySelector('a').href=target.href;
  redraw();
}
orbitSpecimens(canvases,angle,redraw);
angle.addEventListener('input',redraw); gaps.addEventListener('change',redraw);
select.addEventListener('change',update);
update();
