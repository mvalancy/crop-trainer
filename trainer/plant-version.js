import {formsFor, checkPlantForm, checkPlantCondition} from './plants/forms.js';

export function checkPlantArchitecture(version) {
  if (version !== 1 && version !== 2) throw Error('Choose plant architecture version 1 or 2.');
  return version;
}

// Unversioned recipes and exports retain their original geometry. Only v2
// datasets carry form and condition, both of which affect the plant surfaces.
export function plantSettings({crop, plantArchitecture = 1, plantForm = 'mixed', plantCondition = 'healthy'}) {
  checkPlantArchitecture(plantArchitecture);
  if (plantArchitecture === 1) {
    if (plantForm !== 'mixed' || plantCondition !== 'healthy') {
      throw Error('Choose structured plants (v2) for plant form or damage settings.');
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
  const structured = params.has('plantForm') || params.has('plantCondition');
  const value = params.get('plantArchitecture') ?? String(structured ? 2 : defaultVersion);
  if (value !== '1' && value !== '2') {
    unsupported(select);
    return;
  }
  select.value = value;
}

export function setupPlantControls(crop, version, form, condition, params, defaultVersion) {
  restorePlantArchitecture(version, params, defaultVersion);
  function populate(formValue, conditionValue, fromLink = false) {
    const structured = version.value === '2';
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
  return () => version.value === '2'
    ? {plantArchitecture: 2, plantForm: form.value, plantCondition: condition.value}
    : {plantArchitecture: Number(version.value)};
}
