import {formsFor, plantGuide} from './forms.js';
import {setupPlantControls} from '../plant-version.js';
import {cropProfile} from '../crops.js';
import {paintSpecimen} from './portrait.js';

export function setupFieldPlants(params) {
  const el = id => document.getElementById(id);
  const crop=el('crop'), version=el('plantArchitecture'), form=el('plantForm');
  const condition=el('plantCondition'), canopy=el('appleCanopy'), seed=el('seed');
  const historic = params.has('tile') || (params.has('seed') && params.has('sensor'));
  const read=setupPlantControls(crop,version,form,condition,params,historic?1:2);
  if(params.has('appleCanopy') && crop.value==='apple') {
    canopy.value=params.get('appleCanopy');
    if(!canopy.value) {
      canopy.add(new Option('Unsupported foliage · choose again',''));
      canopy.value='';el('anatomySettings').open=true;
    }
  }
  function update() {
    const structured=version.value==='2', apple=structured && crop.value==='apple';
    canopy.disabled=!apple;
    for (const control of [form,condition,canopy]) control.parentElement.hidden=control.disabled;
    el('specimenCard').hidden=!structured || !form.value || !condition.value || (apple && !canopy.value);
    const guide=plantGuide(crop.value);
    el('plantGuide').href='https://github.com/mvalancy/crop-trainer/blob/main/trainer/plants/'+guide+'.md';
    el('plantGuide').textContent=cropProfile(crop.value).name+' growing guide ↗';
    if(el('specimenCard').hidden)return;
    const forms=formsFor(crop.value);
    const specimen=paintSpecimen(el('specimenCanvas'),crop.value,forms,{seed:Number(seed.value)||0,
      form:form.value,condition:condition.value,canopy:canopy.value,radius:.18*cropProfile(crop.value).radiusFactor});
    const name=forms.find(({id})=>id===specimen.form).label;
    el('specimenName').textContent=name;
    el('specimenDetail').textContent=specimen.damaged?'Damaged specimen':apple&&canopy.value==='dormant'?'Dormant specimen':'Healthy specimen';
    el('specimenCanvas').setAttribute('aria-label',name+' modeled organ illustration');
  }
  for (const control of [crop,version,form,condition,canopy]) control.addEventListener('change',update);
  seed.addEventListener('input',update);
  if (params.has('plantCondition') || params.has('plantForm') || params.has('appleCanopy')) el('anatomySettings').open=true;
  update();
  return () => {
    if (!el('grow').checkValidity()) throw Error('Choose valid planting and scan settings.');
    return {...read(),...(crop.value==='apple' && version.value==='2'?{appleCanopy:canopy.value}:{})};
  };
}
