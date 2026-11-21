// Header descriptions also explain the values in their column.
export const scoreHelp = {
  Method:'The rule used to place pins. Each method sees the same scan and is checked against the same reference centers.',
  Distance:'The largest horizontal distance allowed between a pin and a reference center for this row. Changing the distance changes which pins count as matches.',
  Matched:'Labeled plants paired with a pin within this distance. Each pin and each plant can count once.',
  Extra:'Predicted pins left over after matching. Two pins near one plant can give one match and one extra.',
  Missed:'Labeled plants left without a matching pin at this distance.',
  Precision:'Share of predicted pins that match a labeled plant at this distance. A dash means the method placed no pins.',
  Recall:'Share of labeled plants that have a matching pin at this distance. A dash means the reference file lists no plants.',
  F1:'A score balancing extra pins and missed plants. It reaches 100% when every pin matches a plant and every plant has a pin. A dash means the reference file and the detector both counted zero plants.'
};

const rate = value => value === null ? '—' : (100*value).toFixed(1)+'%';

function measurements(score) {
  const {tp, fp, fn} = score, predicted = tp+fp, labeled = tp+fn;
  return [
    ['Matched', String(tp), scoreHelp.Matched],
    ['Extra', String(fp), scoreHelp.Extra],
    ['Missed', String(fn), scoreHelp.Missed],
    ['Precision', rate(score.precision), predicted ? 'Share of predicted pins that match a labeled plant. Here '+tp+' of '+predicted+' pins matched.' : scoreHelp.Precision],
    ['Recall', rate(score.recall), labeled ? 'Share of labeled plants that have a matching pin. Here '+tp+' of '+labeled+' labeled plants matched.' : scoreHelp.Recall],
    ['F1', rate(score.f1), score.f1 === null ? scoreHelp.F1 : 'F1 balances extra pins and missed plants. Here '+tp+' matches, '+fp+' extra pins and '+fn+' missed plants give '+rate(score.f1)+'.']
  ];
}

function header(row, scope, text, help) {
  const th = document.createElement('th');
  th.scope = scope;
  th.textContent = text;
  th.dataset.help = help;
  row.append(th);
}

export function renderScoreTables(methods) {
  const wide = document.getElementById('testRows'), compact = document.getElementById('testMethodScores');
  wide.replaceChildren(); compact.replaceChildren();
  document.getElementById('testMetrics').hidden = !methods.length;
  for (const {label, help, evaluation} of methods) {
    const table = document.createElement('table');
    const caption = table.createCaption();
    caption.textContent = label;
    caption.dataset.help = help;
    const distances = table.createTHead().insertRow(), body = table.createTBody();
    header(distances, 'col', 'Measure', 'Compare the same detection measure across the three matching distances.');
    for (const score of evaluation.scores) {
      const distance = score.cm+' cm', row = wide.insertRow();
      const method = row.insertCell(); method.textContent = label; method.dataset.help = help;
      row.insertCell().textContent = distance;
      header(distances, 'col', distance, scoreHelp.Distance);
      for (const [i, [name, text, description]] of measurements(score).entries()) {
        const metric = body.rows[i] || body.insertRow();
        if (!metric.cells.length) header(metric, 'row', name, scoreHelp[name]);
        for (const cell of [row.insertCell(), metric.insertCell()]) {
          cell.textContent = text;
          cell.dataset.help = description;
          cell.dataset.helpLabel = label+' · '+name+' at '+distance;
        }
      }
    }
    compact.append(table);
  }
}
