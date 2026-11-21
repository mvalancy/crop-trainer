import {formsFor, plantGuide} from './forms.js';
import {setupPlantControls} from '../generator/plant-version.js?v=plants3';
import {cropProfile} from '../generator/crops.js';
import {makeRecipe} from '../models/data.js?v=plants3';
import {plantingRow} from './planting.js';
import {seededRandom} from './traits.js';
import {specimenPair, compareSpecimens} from './portrait.js?v=field-desk1';

function lookFor(crop, form, dormant) {
  switch (crop) {
    case 'lettuce':
    case 'bench-lettuce': return 'Find the gap in the outer leaves and the shorter blades beside it.';
    case 'artichoke': return form === 'rosette'
      ? 'One side of the leafy rosette has been stripped away.'
      : 'Look for the bare stalk where the top bud grew and the gap in the leaves below.';
    case 'tomato': return 'The main stem has snapped. The lower leaves still grow from the same nodes.';
    case 'apple': return dormant
      ? 'Follow the bare wood from the trunk to the stub of a broken limb.'
      : 'One limb ends in a stub. The shoots and leaf clusters beyond the break are missing.';
    case 'grapevine': return form === 'pruned-cordon'
      ? 'Follow the short woody spurs to the place where a cordon arm breaks.'
      : 'A broken cordon arm has lost the upright shoots it once carried.';
    case 'high-wire-tomato': return form === 'twin-leader'
      ? 'One of the two upright stems has snapped. Follow both stems up from their shared base.'
      : 'Find the end of the broken growing tip, above the surviving leaves.';
  }
}

function firstPlantRadius(recipe, profile) {
  const random = seededRandom(recipe.seed);
  for (let row=0; row<profile.rows; row++) {
    const first=plantingRow(recipe,profile,row,random).next().value;
    if (first) return first.radius;
  }
}

export function setupFieldPlants(params) {
  const el = id => document.getElementById(id);
  const crop=el('crop'), version=el('plantArchitecture'), form=el('plantForm');
  const condition=el('plantCondition'), canopy=el('appleCanopy'), seed=el('seed');
  const historic = params.has('tile') || (params.has('seed') && params.has('sensor'));
  const read=setupPlantControls(crop,version,form,condition,params,historic?1:Number(version.options[0].value));
  if(params.has('appleCanopy') && crop.value==='apple') {
    canopy.value=params.get('appleCanopy');
    if(!canopy.value) {
      canopy.prepend(new Option('Unsupported foliage · choose again',''));
      canopy.value='';el('anatomySettings').open=true;
    }
  }
  const card=el('specimenCard'), angle=el('specimenAngle'), gaps=el('specimenGaps');
  const intact=el('specimenCanvas'), damaged=el('damagedCanvas');
  const zoom=el('damageZoom');
  const paint=compareSpecimens(intact,damaged);
  let pair, drawRequest;
  function redraw() {
    angle.setAttribute('aria-valuetext',angle.value+' degrees');
    if (drawRequest) return;
    drawRequest=requestAnimationFrame(() => {
      drawRequest=undefined;
      if (pair && !card.hidden && el('anatomySettings').open) paint(pair,Number(angle.value),gaps.checked,zoom.getAttribute('aria-pressed')==='true');
    });
  }
  function update() {
    const selectedVersion=Number(version.value);
    const structured=selectedVersion >= 2, apple=structured && crop.value==='apple';
    canopy.disabled=!apple;
    for (const control of [form,condition,canopy]) control.parentElement.hidden=control.disabled;
    card.hidden=!structured || !version.validity.valid || !form.value || !condition.value || !seed.validity.valid || (apple && !canopy.value);
    const guide=plantGuide(crop.value), profile=cropProfile(crop.value);
    el('plantGuide').href='https://github.com/mvalancy/crop-trainer/blob/main/trainer/plants/'+guide+'.md';
    el('plantGuide').textContent=profile.name+' growing guide ↗';
    if(card.hidden)return;
    const forms=formsFor(crop.value);
    const recipe=makeRecipe(Number(seed.value),true,null,crop.value,selectedVersion,form.value,condition.value);
    const radius=firstPlantRadius(recipe,profile);
    if (!radius) {card.hidden=true;return;}
    pair=specimenPair(crop.value,forms,{seed:recipe.seed,form:form.value,canopy:canopy.value,radius,plantArchitecture:selectedVersion});
    const name=forms.find(item => item.id===pair.form).label;
    const dormant=apple && canopy.value==='dormant';
    el('specimenName').textContent=name+(dormant?' · leaf off':'');
    el('specimenDetail').textContent=lookFor(crop.value,pair.form,dormant);
    el('specimenContext').textContent=condition.value==='mixed' ? 'Your field mixes intact and damaged plants.'
      : condition.value==='damaged' ? 'Your field will grow damaged plants.' : 'Your field will grow intact plants.';
    intact.setAttribute('aria-label','Intact '+name.toLowerCase()+(dormant?' without foliage':''));
    damaged.setAttribute('aria-label','Damaged '+name.toLowerCase()+(dormant?' without foliage':''));
    redraw();
  }
  for (const control of [crop,version,form,condition,canopy]) control.addEventListener('change',update);
  seed.addEventListener('input',update);
  angle.addEventListener('input',redraw);
  gaps.addEventListener('change',redraw);
  zoom.addEventListener('click',() => {
    zoom.setAttribute('aria-pressed',String(zoom.getAttribute('aria-pressed')!=='true'));
    redraw();
  });
  el('anatomySettings').addEventListener('toggle',redraw);
  for (const canvas of [intact,damaged]) {
    let start;
    canvas.addEventListener('pointerdown',event => {
      if (!event.isPrimary || event.button!==0) return;
      start={x:event.clientX,angle:Number(angle.value),id:event.pointerId};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event => {
      if (!start || event.pointerId!==start.id) return;
      const degrees=start.angle+180*(event.clientX-start.x)/Math.max(1,canvas.clientWidth);
      angle.value=String((Math.round(degrees/5)*5 % 360 + 360) % 360);
      redraw();
    });
    canvas.addEventListener('lostpointercapture',() => {start=undefined;});
  }
  update();
  return () => {
    return {...read(),...(crop.value==='apple' && Number(version.value)>=2?{appleCanopy:canopy.value}:{})};
  };
}
