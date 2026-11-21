import {nearbyMapPoint} from './extra-pins.js?v=paired-map1';

// Compare scores measured with the bundled models on the same example scan.
const weedFits = new Map([
  ['tomato-weed-random','Random'],
  ['tomato-weed-hard','Half difficult']
]);
const byId = id => document.getElementById(id);

export function tomatoPractice(select, run) {
  const hint = byId('testExampleHelp'), cleanHint = hint.textContent;
  const other = byId('testOtherFit'), table = byId('testWeedComparison');
  const measured = new Map();
  let plot, shownDistance;

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

  function forget() {
    measured.clear();
    plot = shownDistance = null;
    table.hidden = true;
  }
  function record(fit,report,scanQuery) {
    table.hidden = true;
    const eligible = weedFits.has(fit) && scanQuery && !report.savedCutoff && report.evaluation &&
      report.files.model.sha256 && report.files.model.name === fit+'.json' && report.files.scan.sha256 && report.files.labels?.sha256;
    other.hidden = !eligible;
    if (!eligible) {forget(); return null;}
    const key = JSON.stringify([report.files.scan.sha256,report.files.labels.sha256,report.detector.threshold,report.frame]);
    if (key !== plot) forget();
    plot = key;
    measured.set(fit,report);
    shownDistance = null;
    const random = measured.get('tomato-weed-random'), hard = measured.get('tomato-weed-hard');
    if (!random || !hard || random.files.model.sha256===hard.files.model.sha256) return null;
    return {random,hard,scanQuery};
  }
  function showScores(distance) {
    if (shownDistance===distance) return;
    shownDistance = distance;
    table.querySelector('caption').textContent = 'Both fits on this planting within '+distance+' cm';
    const body = table.querySelector('tbody');
    body.replaceChildren();
    for (const [name,label] of weedFits) {
      const row = body.insertRow();
      const heading = document.createElement('th');
      heading.scope = 'row'; heading.textContent = label; row.append(heading);
      const score = measured.get(name).evaluation.scores.find(row=>row.cm===distance);
      for (const count of [score.tp,score.fp,score.fn]) row.insertCell().textContent = count;
    }
    table.hidden = false;
  }
  return {record,showScores,forget,keepDistance:fit=>weedFits.has(fit) && measured.size>0};
}

export function initChangedSeedlings() {
  const panel = byId('testWeedPlants'), select = byId('testWeedPlant'), detail = byId('testWeedDetail');
  let previousPair, previousDistance, changedBoxes;
  const canvas = byId('testMap'), view3D = byId('testWeed3D');
  canvas.addEventListener('click',event => {
    if (!previousPair) return;
    const box = nearbyMapPoint(canvas,event,changedBoxes,previousPair.random.references);
    if (box !== undefined) {
      select.value = String(box);
      select.dispatchEvent(new Event('change'));
    }
  });
  return function inspect(pair, distance, changes) {
    panel.hidden = !pair;
    if (!pair) {
      view3D.hidden = true;
      view3D.removeAttribute('href');
      previousPair = null;
      return null;
    }
    if (previousPair !== pair || previousDistance !== distance) {
      const previousBox = previousPair===pair ? select.value : '';
      const gained = byId('testWeedGained'), lost = byId('testWeedLost');
      gained.replaceChildren(); lost.replaceChildren();
      changedBoxes = [];
      for (const [box,change] of changes.entries()) {
        if (!change) continue;
        changedBoxes.push(box);
        const option = new Option('Box '+box,String(box));
        option.dataset.reference = box;
        (change>0 ? gained : lost).append(option);
      }
      gained.label = 'Gained ('+gained.children.length+')';
      lost.label = 'Lost ('+lost.children.length+')';
      select.value = previousBox!=='' && changes[Number(previousBox)] ? previousBox : '';
      select.disabled = !gained.children.length && !lost.children.length;
      previousPair = pair; previousDistance = distance;
    }
    view3D.hidden = select.value==='';
    if (select.value==='') {
      view3D.removeAttribute('href');
      detail.textContent = select.disabled ? 'Both fits found the same seedlings at this distance.' :
        'Tap a plus or minus on the map, or choose its planting box above.';
      return null;
    }
    const box = Number(select.value), gained = changes[box]>0;
    const fit = gained ? pair.hard : pair.random;
    const center = fit.references[box], pin = fit.pins[fit.evaluation.pinByReferenceAtCm[distance][box]];
    const offset = 100*Math.hypot(pin.localX-center.localX,pin.localY-center.localY);
    detail.textContent = 'Box '+box+' · plot X '+center.localX.toFixed(2)+' m, Y '+center.localY.toFixed(2)+' m. '+
      (gained ? 'Only the half-difficult fit' : 'Only the random fit')+' matched this seedling. Its pin landed '+offset.toFixed(1)+' cm from the center.';
    const scan = new URL('../',document.baseURI);
    scan.search = pair.scanQuery;
    scan.searchParams.set('box',String(box));
    scan.hash = 'scan-viewer';
    view3D.href = scan.href;
    view3D.textContent = 'Inspect Box '+box+' in 3D ↗';
    return center;
  };
}
