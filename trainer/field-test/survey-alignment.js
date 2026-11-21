import {matchCenters, MATCH_RADII_METERS} from '../models/data.js?v=field-test1';

// All distances are horizontal. Pins and references already use the same local
// metre frame as the official scores. Even at plot edges, keep the whole survey.
export function scoreSurveyShifts(pins, references, distanceCm, shiftCm) {
  if (!MATCH_RADII_METERS.includes(distanceCm / 100) || ![10, 25].includes(shiftCm)) {
    throw Error('Choose a published match distance and a 10 or 25 cm survey shift.');
  }
  const predictions = pins.map(({localX, localY}) => [localX, localY]);
  const shifts = [[0, 0], [shiftCm, 0], [-shiftCm, 0], [0, shiftCm], [0, -shiftCm]];
  return shifts.map(([dxCm, dyCm]) => {
    const centers = references.map(({localX, localY}) => [localX + dxCm/100, localY + dyCm/100]);
    return {dxCm, dyCm, matched:matchCenters(predictions, centers, distanceCm/100).count};
  });
}

export function initSurveyAlignment() {
  const panel = document.getElementById('testAlignment'), amount = document.getElementById('testShift');
  const button = document.getElementById('testCheckAlignment'), rows = document.getElementById('testAlignmentRows');
  const status = document.getElementById('testAlignmentStatus'), table = rows.closest('table');
  let context, worker;

  function clearRows() {
    worker?.terminate();
    worker = null;
    button.disabled = false;
    rows.replaceChildren();
    table.hidden = true;
    status.textContent = '';
  }

  function render(scored) {
    const labels = ['Recorded XY', '+X', '−X', '+Y', '−Y'];
    for (const [i, {matched}] of scored.entries()) {
      const row = rows.insertRow(), label = document.createElement('th');
      label.scope = 'row';
      label.textContent = i === 0 ? labels[i] : labels[i]+' · '+amount.value+' cm';
      label.dataset.help = i === 0 ? 'Original survey positions used by the field-test report.' : 'Every reference center moves by '+amount.value+' cm along '+labels[i]+'. Pin coordinates stay fixed.';
      row.append(label);
      const cell = row.insertCell();
      cell.textContent = matched;
      cell.style.setProperty('--matched', (100*matched/context.references.length)+'%');
      cell.dataset.help = matched+' of '+context.references.length+' supplied centers matched a pin at '+context.distance+' cm.';
      const delta = matched - scored[0].matched;
      const change = row.insertCell();
      change.textContent = delta > 0 ? '+'+delta : delta;
      change.dataset.help = 'Change in matches compared with the recorded survey at '+context.distance+' cm.';
    }
    table.hidden = false;
  }

  amount.addEventListener('change', clearRows);
  button.addEventListener('click', () => {
    if (!context) return;
    clearRows();
    const {pins, references, distance, recorded} = context;
    const fail = message => {clearRows(); status.textContent = message;};
    try {
      const job = new Worker(new URL('./survey-alignment-worker.js', import.meta.url), {type:'module'});
      worker = job;
      button.disabled = true;
      status.textContent = 'Scoring the recorded survey and four shifts…';
      job.onerror = () => {if (worker === job) fail('Could not score the shifts. Select Check survey alignment to retry.');};
      job.onmessage = ({data}) => {
        if (worker !== job) return;
        if (data.error || data.rows[0].matched !== recorded) {
          fail(data.error || 'The recorded row differs from the field score. Run Field Test again.');
          return;
        }
        job.terminate(); worker = null;
        render(data.rows);
        button.disabled = false;
        status.textContent = 'Matches with '+pins.length+' fixed pins';
      };
      job.postMessage({pins, references, distance, shift:Number(amount.value)});
    } catch (error) {
      fail(error.message || 'Could not start the survey check.');
    }
  });

  return function setSurvey(report, source, method, distance) {
    if (context && report === context.report && source === context.source && distance === context.distance) return;
    const sameSource = context && report === context.report && source === context.source;
    clearRows();
    if (!sameSource) {amount.value = '10'; panel.open = false;}
    const eligible = method && report?.references?.length > 0;
    panel.hidden = !eligible;
    context = null;
    if (!eligible) {document.getElementById('testAlignmentScope').textContent = ''; return;}
    context = {report, source, distance, pins:method.pins, references:report.references,
      recorded:method.evaluation.scores.find(score=>score.cm === distance).tp};
    document.getElementById('testAlignmentScope').textContent = method.label+' · '+method.pins.length+' pins · '
      +report.references.length+' surveyed centers · '+distance+' cm match distance';
  };
}
