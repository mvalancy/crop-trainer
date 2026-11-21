import {formsFor, checkPlantForm, checkPlantCondition} from '../plants/forms.js';

export function checkPlantArchitecture(version, crop) {
  if (![1, 2, 3, 4].includes(version)) throw Error('Choose a supported plant architecture version.');
  if (version === 4 && crop !== 'apple') throw Error('Choose the apple orchard for variable scaffolds (v4).');
  return version;
}

// Unversioned recipes and exports retain their original geometry. Structured
// datasets carry form and condition, both of which affect the plant surfaces.
export function plantSettings({crop, plantArchitecture = 1, plantForm = 'mixed', plantCondition = 'healthy'}) {
  checkPlantArchitecture(plantArchitecture, crop);
  if (plantArchitecture === 1) {
    if (plantForm !== 'mixed' || plantCondition !== 'healthy') {
      throw Error('Choose structured plants for plant form or damage settings.');
    }
    return {plantArchitecture};
  }
  return {plantArchitecture, plantForm: checkPlantForm(crop, plantForm),
    plantCondition: checkPlantCondition(plantCondition)};
}

function unsupported(select) {
  select.prepend(new Option('Unsupported choice · select another', ''));
  select.value = '';
  for (let node = select.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
}

// Show an unsupported value as an invalid required choice. A user can repair
// the link in the form without accidentally running it under another version.
export function restorePlantArchitecture(select, params, defaultVersion) {
  const structured = params.has('plantForm') || params.has('plantCondition') || params.has('validationPlantForm');
  const value = params.get('plantArchitecture') ?? String(structured ? 2 : defaultVersion);
  if (!['1','2','3','4'].includes(value)) {
    unsupported(select);
    return;
  }
  select.value = value;
}

export function setupPlantControls(crop, version, form, condition, params, defaultVersion) {
  restorePlantArchitecture(version, params, defaultVersion);
  function populate(formValue, conditionValue, fromLink = false) {
    const orchardOption = version.querySelector('[value="4"]');
    if (orchardOption) {
      const isApple = crop.value === 'apple';
      if (!fromLink && !isApple && version.value === '4') version.value = '3';
      const incompatible = !isApple && version.value === '4';
      orchardOption.hidden = orchardOption.disabled = !isApple && !incompatible;
      version.setCustomValidity(incompatible ? 'Choose the apple orchard for variable scaffolds (v4).' : '');
    }
    const structured = Number(version.value) >= 2;
    const forms = structured ? formsFor(crop.value) : [];
    form.replaceChildren(new Option(structured ? 'Seeded mix' : 'Original form', 'mixed'),
      ...forms.map(({id,label}) => new Option(label, id)));
    form.value = formValue;
    for (const option of [...condition.options]) {
      if (!option.value) option.remove();
      else option.disabled = !structured && option.value !== 'healthy';
    }
    condition.value = conditionValue;
    if (!fromLink) {
      if (!form.value) form.value = 'mixed';
      if (!structured) condition.value = 'healthy';
    }
    const badForm = !form.value;
    const badCondition = !condition.value || (!structured && condition.value !== 'healthy');
    if (badForm) unsupported(form);
    if (badCondition) unsupported(condition);
    form.disabled = !structured && !badForm;
    condition.disabled = !structured && !badCondition;
  }
  populate(params.get('plantForm') ?? 'mixed', params.get('plantCondition') ?? 'healthy', true);
  const changed = () => populate(form.value, condition.value || 'healthy');
  crop.addEventListener('change', changed);
  version.addEventListener('change', changed);
  return () => Number(version.value) >= 2
    ? {plantArchitecture: Number(version.value), plantForm: form.value, plantCondition: condition.value}
    : {plantArchitecture: Number(version.value)};
}

// The holdout inherits the training form unless the user selects a different one.
// Store only an override; the select keeps the explicit choice for paired comparisons.
export function setupValidationPlantForm(select, crop, version, trainingForm, params) {
  function populate(value, fromLink = false) {
    const structured = Number(version.value) >= 2;
    const choices = structured ? [...trainingForm.options].filter(option => option.value) : [];
    select.replaceChildren(new Option('Same as training', 'follow'),
      ...choices.map(option => new Option(option.textContent, option.value)));
    select.value = !structured && value === 'mixed' ? 'follow' : value;
    if (!select.value) {
      if (fromLink) unsupported(select);
      else select.value = 'follow';
    }
    select.disabled = !structured && !!select.value;
  }
  populate(params.get('validationPlantForm') ?? 'follow', true);
  const changed = () => populate(select.value);
  crop.addEventListener('change', changed);
  version.addEventListener('change', changed);
  return () => select.value && select.value !== 'follow' && select.value !== trainingForm.value
    ? {validationPlantForm: select.value} : {};
}
