import {coverageAtDistance} from '../trainer/models/data.js?v=sampling1';

const $ = id => document.getElementById(id);

export function setupCutoffControls(query) {
  const schedule = $('cutoffSchedule'), trial = $('trialCutoff');
  if (query.has('trialCutoff')) trial.value = query.get('trialCutoff');
  else if (query.get('comparison') === 'cutoffs') schedule.value = 'classic';

  function show(active) {
    const pair = active && schedule.value === 'pair';
    $('cutoffChoices').hidden = schedule.disabled = !active;
    $('trialCutoffControl').hidden = trial.disabled = !pair;
    trial.setCustomValidity(pair && trial.valueAsNumber === .5 ? 'Choose a trial cutoff different from the 0.50 control.' : '');
  }
  schedule.addEventListener('change', () => show(true));
  trial.addEventListener('input', () => show(true));
  return {
    show,
    thresholds: () => schedule.value === 'classic' ? [.35,.50,.65] : [.50,trial.valueAsNumber]
  };
}

function displayCutoffCoverage(report, cm) {
  const summaries = report.thresholds.map(threshold => {
    const tiles = report.rows.filter(row => row.threshold === threshold)
      .flatMap(row => row.tiles.filter(tile => tile.ground));
    return coverageAtDistance(tiles, cm);
  });
  const headers = $('coverageHead');
  for (const th of headers.querySelectorAll('th[data-cutoff]')) th.remove();
  for (const cutoff of report.thresholds) {
    const th = document.createElement('th');
    const label = Number(cutoff.toFixed(2)) === cutoff ? cutoff.toFixed(2) : String(cutoff);
    th.scope = 'col';
    th.dataset.cutoff = String(cutoff);
    th.textContent = 'At '+label;
    th.dataset.help = 'Plants in this return group matched at a score cutoff of '+label+'. The bar shows the fraction found.';
    headers.append(th);
  }
  const body = $('coverageRows');
  body.replaceChildren();
  for (const [band, label] of [['zero','0 returns'], ['oneToFour','1–4 returns'], ['fiveOrMore','5 or more returns']]) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    th.dataset.help = 'Groups labeled plants by how many laser points hit them in the soil-present test scans.';
    tr.append(th);
    const total = summaries[0].groups[band].plants;
    tr.insertCell().textContent = total;
    for (const [index, result] of summaries.entries()) {
      const cell = tr.insertCell();
      const matched = result.groups[band].matched;
      cell.textContent = total ? matched : '—';
      if (total) {
        const meter = document.createElement('meter');
        meter.max = total;
        meter.value = matched;
        meter.setAttribute('aria-label', label + ' matched');
        meter.setAttribute('aria-valuetext', matched + ' of ' + total + ' plants');
        cell.dataset.helpLabel = 'Matches at cutoff '+report.thresholds[index];
        cell.dataset.help = matched+' of '+total+' plants in this group had a pin within '+cm+' cm ('+(100 * matched / total).toFixed(1)+'%).';
        cell.append(meter);
      }
    }
  }
  $('coverageFoot').replaceChildren();
  const tr = $('coverageFoot').insertRow();
  const th = document.createElement('th');
  th.scope = 'row';
  th.colSpan = 2;
  th.textContent = 'Extra pins';
  tr.append(th);
  th.dataset.help = 'Total unmatched final pins across the same soil-present scans, counted once per cutoff.';
  for (const [index, result] of summaries.entries()) {
    const cell = tr.insertCell();
    cell.textContent = result.extraPins;
    cell.dataset.helpLabel = 'Extra pins at cutoff '+report.thresholds[index];
    cell.dataset.help = 'Pins at this cutoff that did not match a labeled plant within '+cm+' cm.';
  }
}
export function displayCutoffChanges(report) {
  const cm = Number($('cutoffDistance').value);
  const signed = count => count > 0 ? '+'+count : String(count);
  const scoreAtDistance = row => row.scores.find(score => score.cm === cm);
  displayCutoffCoverage(report,cm);
  $('cutoffRows').replaceChildren();
  for (const dataset of report.datasets) {
    const rows = report.rows.filter(row => row.seed === dataset.seed);
    const baseline = scoreAtDistance(rows.find(row => row.threshold === 0.5));
    for (const row of rows.sort((a, b) => a.threshold - b.threshold)) {
      if (row.threshold === 0.5) continue;
      const score = scoreAtDistance(row);
      const tr = $('cutoffRows').insertRow();
      for (const value of [row.seed, row.threshold, signed(score.tp - baseline.tp), signed(score.fp - baseline.fp)]) {
        tr.insertCell().textContent = value;
      }
    }
  }
}
