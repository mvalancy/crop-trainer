import {formsFor} from '../plants/forms.js';

export function orderedSamplingGroups(crop, groups) {
  const forms = formsFor(crop);
  const labels = new Map(forms.map(({id, label}) => [id, label]));
  const order = new Map(forms.map(({id}, i) => [id, i]));
  return groups.map(group => ({...group, label: labels.get(group.plantForm) ?? 'Original canopy'}))
    .sort((a, b) => (order.get(a.plantForm) ?? -1) - (order.get(b.plantForm) ?? -1) || Number(b.ground) - Number(a.ground));
}

export function showSamplingReceipt(stats) {
  const panel = document.getElementById('samplingReceipt');
  const groups = stats.positiveExamplesByFormSoil;
  panel.hidden = !groups?.length;
  panel.open = false;
  if (panel.hidden) return;

  const ordered = orderedSamplingGroups(stats.crop, groups);
  const max = Math.max(1, ...groups.map(group => group.available));
  const selected = groups.reduce((total, group) => total + group.selected, 0);
  const available = groups.reduce((total, group) => total + group.available, 0);
  document.getElementById('samplingTotals').textContent =
    'The fit used '+selected.toLocaleString()+' of '+available.toLocaleString()+
    ' peaks near labeled plant centers, plus '+selected.toLocaleString()+' background peaks.';
  document.getElementById('samplingRows').replaceChildren(...ordered.map(group => {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    const name = document.createElement('span');
    name.textContent = group.label;
    const surface = document.createElement('small');
    surface.textContent = group.ground ? 'With ground' : 'Ground removed';

    const bar = document.createElement('span');
    bar.className = 'samplingBar';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.width = (100 * group.available / max)+'%';
    const fill = document.createElement('i');
    fill.style.width = group.available ? (100 * group.selected / group.available)+'%' : '0';
    bar.append(fill);
    label.append(name, surface, bar);
    row.append(label);
    const used = row.insertCell();
    used.textContent = group.selected.toLocaleString();
    used.dataset.helpLabel = name.textContent+' · used peaks';
    used.dataset.help = 'Peaks near labeled plant centers from this scan condition included in each training epoch.';
    const eligible = row.insertCell();
    eligible.textContent = group.available.toLocaleString();
    eligible.dataset.helpLabel = name.textContent+' · available peaks';
    eligible.dataset.help = 'All peaks close enough to this form’s labeled centers to count as plant examples.';
    return row;
  }));
}
