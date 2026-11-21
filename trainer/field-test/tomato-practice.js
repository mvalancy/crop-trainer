// Compare only scores produced by the bundled models on the same example scan.
const weedFits = new Map([
  ['tomato-weed-random','Random'],
  ['tomato-weed-hard','Half difficult']
]);

export function tomatoPractice(select, run) {
  const hint = document.getElementById('testExampleHelp');
  const cleanHint = hint.textContent;
  const other = document.getElementById('testOtherFit');
  const table = document.getElementById('testWeedComparison');
  const scores = new Map();
  let plot;

  function explain() {
    hint.textContent = weedFits.has(select.value)
      ? 'Grow seedlings among weeds. Both models learned from the same tomato centers. Compare a random background sample with peaks a practice model scored highly.'
      : cleanHint;
  }
  explain();
  select.addEventListener('change',explain);
  other.addEventListener('click',() => {
    select.value = select.value === 'tomato-weed-hard' ? 'tomato-weed-random' : 'tomato-weed-hard';
    select.dispatchEvent(new Event('input',{bubbles:true}));
    explain();
    run.click();
  });

  return (fit,report) => {
    const paired = weedFits.has(fit) && !report.savedCutoff;
    other.hidden = !paired;
    table.hidden = true;
    if (!paired) return;
    const key = [report.files.scan.sha256, report.files.labels.sha256, report.detector.threshold].join('/');
    if (plot !== key) scores.clear();
    plot = key;
    scores.set(fit,report.evaluation.scores.find(row=>row.cm===15));
    if (scores.size !== weedFits.size) return;
    const body = table.querySelector('tbody');
    body.replaceChildren();
    for (const [name,label] of weedFits) {
      const row = body.insertRow();
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label;
      row.append(heading);
      const score = scores.get(name);
      for (const count of [score.tp,score.fp,score.fn]) row.insertCell().textContent = count;
    }
    table.hidden = false;
  };
}
