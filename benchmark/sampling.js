import {orderedSamplingGroups} from '../trainer/ui/sampling-receipt.js';

export const samplingLabels = new Map([['ordinary','Shuffled positives'], ['form-soil','Balanced by form and ground']]);

export function setupSamplingControls(query) {
  const limit = document.getElementById('sampleLimit');
  const method = document.getElementById('positiveSampling');
  const options = document.getElementById('samplingOptions');
  let editedLimit = query.has('sampleLimit');
  if (editedLimit) limit.value = query.get('sampleLimit');
  if (query.has('positiveSampling')) {
    method.value = query.get('positiveSampling');
    if (!method.value) method.prepend(new Option('Choose a supported sampling method', '', true, true));
  }
  limit.addEventListener('input', () => { editedLimit = true; });
  options.addEventListener('invalid', () => { options.open = true; }, true);
  if (editedLimit || query.has('positiveSampling')) options.open = true;

  return {
    show(paired) {
      method.disabled = paired;
      document.getElementById('samplingMethodControl').hidden = paired;
      if (!editedLimit) limit.value = paired ? 600 : limit.max;
      if (paired) options.open = true;
    },
    settings(paired) {
      const selection = {};
      if (paired || limit.valueAsNumber !== Number(limit.max)) selection.sampleLimit = limit.valueAsNumber;
      if (paired) selection.positiveSamplingModes = [...samplingLabels.keys()];
      else if (method.value !== 'ordinary') selection.positiveSampling = method.value;
      return selection;
    }
  };
}

function groupKey({plantForm,ground}) { return plantForm + '/' + ground; }

// The two methods may select different positives from each group. Every
// available group, field's negative count and overall class budget must match.
export function checkSamplingPair(first, second) {
  const groups = new Map(first.positiveExamplesByFormSoil.map(g => [groupKey(g),g.available]));
  const fields = first.trainingExamplesByField;
  if (first.samples !== second.samples || groups.size !== second.positiveExamplesByFormSoil.length ||
      second.positiveExamplesByFormSoil.some(g => groups.get(groupKey(g)) !== g.available) ||
      fields.length !== second.trainingExamplesByField.length ||
      second.trainingExamplesByField.some((f,i) => f.seed !== fields[i].seed || f.usedNegative !== fields[i].usedNegative)) {
    throw Error('The paired fits need the same candidate pool, background counts and training budget.');
  }
}

export function displaySamplingMix(report) {
  const select = document.getElementById('samplingSeed');
  select.replaceChildren(...[...new Set(report.rows.map(row => row.seed))].map(seed => new Option(String(seed),String(seed))));
  function render() {
    const rows = report.rows.filter(row => row.seed === Number(select.value));
    const stats = mode => report.datasets[rows.find(row => row.positiveSampling === mode).datasetIndex].stats;
    const ordinary = stats('ordinary'), balanced = stats('form-soil');
    const counts = new Map(balanced.positiveExamplesByFormSoil.map(group => [groupKey(group),group.selected]));
    const body = document.getElementById('samplingRows');
    body.replaceChildren();
    let moved = 0;
    for (const group of orderedSamplingGroups(report.settings.crop, ordinary.positiveExamplesByFormSoil)) {
      const row = body.insertRow();
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = group.label;
      const ground = document.createElement('small');
      ground.textContent = group.ground ? 'With ground' : 'Ground removed';
      name.append(ground);
      row.append(name);
      const balancedCount = counts.get(groupKey(group));
      moved += Math.max(0,balancedCount - group.selected);
      for (const [label,count] of [['Available',group.available],['Shuffled',group.selected],['Balanced',balancedCount]]) {
        const cell = row.insertCell();
        cell.dataset.label = label;
        cell.textContent = count.toLocaleString();
        if (label !== 'Available') {
          const meter = document.createElement('span');
          meter.className = 'samplingFraction';
          meter.setAttribute('aria-hidden','true');
          meter.style.setProperty('--kept', (group.available ? 100 * count / group.available : 0)+'%');
          cell.append(meter);
          cell.dataset.help = label+' kept '+count+' of '+group.available+' eligible examples in this group.';
        }
      }
    }
    const used = ordinary.samples/2;
    const pool = ordinary.positiveExamplesByFormSoil.reduce((n,g) => n+g.available,0);
    const text = 'Each fit used '+used.toLocaleString()+' peaks near labeled plants and the same '+used.toLocaleString()+' background peaks. ';
    document.getElementById('samplingSummary').textContent = text + (used === pool
      ? 'Every available positive fit within the budget, so both draws kept the same examples.'
      : moved ? 'Balancing moved '+moved.toLocaleString()+' positive-example slots between groups.'
               : 'Both methods kept the same counts in every group.');
  }
  select.onchange = render;
  render();
}
