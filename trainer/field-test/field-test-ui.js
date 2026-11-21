import {plotPalette} from '../../app/plot-palette.js';
import {scoreHelp, renderScoreTables} from './score-tables.js';
import {initFeatureScale} from './feature-scale.js';
import {initSurveyAlignment} from './survey-alignment.js';
import {drawExtraPins, initExtraPins, plotCoordinates} from './extra-pins.js?v=paired-map1';

import {initChangedSeedlings, tomatoPractice} from './tomato-practice.js?v=paired-map1';

const byId = id => document.getElementById(id);
const cutoffText = value => Number.isInteger(value*100) ? value.toFixed(2) : String(value);


function explainFieldTest() {
  const panel = byId('field-test');
  const descriptions = [
    ['#testExtent','Scan coordinate range','The smallest and largest X, Y and Z in the file, before conversion. Use your survey to set the plot corner and ground level. The lowest return can be above or below the ground there.'],
    ['.testSlope > summary','Sloping ground','Open this if your plot rises or falls steadily. A measured slope lets the detector measure plant height above the soil across the plot.'],
    ['#testDetect','Find plants','Read the selected weights and place pins on the scan using the current coordinates. Adding reference centers lets you score the pins.'],
    ['#testCancel','Cancel field test','Stop the current file read or prediction. Your original scan and weights stay on your device.'],
    ['#testStatus','Field test status','Shows which input the field test needs, what it is processing, or which file and method produced the visible plot.'],
    ['#testSummary','Predicted plant count','The selected method placed this many pins. Multiple pins can land near one plant, and a plant can receive no pin.'],
    ['#testMap','Field test map','Top view of a 10 m square. Moving right increases plot X and moving up increases plot Y. The grey dots show a sample of the scan.'],
    ['#testLegend','Map symbols','The key follows the selected map view. Compare pin locations or switch to Changed matches to see which reference centers gained or lost a match. Grey dots are sampled laser returns.'],
    ['#testOutcome','Field test outcome','Compare the selected method’s pins with the reference centers. Every plant and pin can match once. With only a scan and weights, the map shows the predicted locations.'],
    ['#testRule','Pin placement rule','The height floor controls which peaks qualify. The saved model then uses a score cutoff. Spacing controls how close two surviving pins can be.'],
    ['#testMatchDistance','Map and stage matching distance','Choose how close an estimated pin must land to a surveyed center. Changing the distance pairs pins and centers again and updates the model’s stage bars.'],
    ['#testStageSummary','Detection stages','Each row pairs the remaining peaks with reference centers at the match distance selected above the map. Each peak and each center can match once. With an empty survey the rows show how many candidates remain.'],
    ['#testOrchardHelp a','Orchard locator study','See how the tree-base rule performed on synthetic orchard scans and how branch shape affects the estimates.'],
    ['.fieldEvidence > summary','Evidence from physical fields','Open two measured examples of how counts and location accuracy can differ in physical crops.'],
    ['.fieldEvidence a[href*="iris.uniss"]','Published artichoke study','Read the researchers’ aerial-image study and see how they checked plant detections in a field.'],
    ['.fieldEvidence a[href*="vineyard-test"]','Vineyard field test','Reproduce the trunk-location test on the documented physical vineyard strip.'],
    ['.testGuides a[href*="field-validation"]','Plan a field trial','See how to separate fields for training and testing, record a survey and evaluate missed plants.'],
    ['.testGuides a[href*="edge-deployment"]','Run a detector in the field','Read how to replay saved weights and a scan on a small computer.'],
    ['.testGuides a[href*="docs/evidence"]','Model and height-only comparison','Compare learned pins with a simpler rule that places pins on high points.'],
    ['.testGuides a[href*="research-evidence"]','Crop detection research','Read published studies and see which crops, sensing methods and measures they tested.']
  ];
  for (const [selector,label,help] of descriptions) {
    const host = panel.querySelector(selector);
    if (!host) continue;
    host.dataset.helpLabel = label;
    host.dataset.help = help;
  }
  for (const header of panel.querySelectorAll('#testMetrics th')) {
    header.scope = 'col';
    header.dataset.help = scoreHelp[header.textContent.trim()];
  }
}

function methodsFor(report) {
  const detector = report.detector;
  const cm = meters => (meters*100).toFixed(1)+' cm';
  const peaks = 'Peak floor '+cm(detector.minimumHeight)+(detector.peakAveraging==='occupied'?' · average over sampled cells':'');
  const spacing = 'minimum spacing '+cm(detector.pinSeparation);
  const cutoff = detector.savedThreshold === undefined ? 'saved score cutoff '+detector.threshold
    : 'trial score cutoff '+detector.threshold+' (saved '+detector.savedThreshold+')';
  const ground = detector.featureMode==='local-ground' ? ' · height above nearby low returns and the spread of surrounding heights' : '';
  const methods={
    model:{label:report.savedCutoff ? 'Trial cutoff · '+cutoffText(detector.threshold) : 'Trained model',pins:report.pins,evaluation:report.evaluation,
      help:'The saved detector scores each candidate using the shape of nearby scan points. The model cutoff and minimum spacing determine which pins remain.',
      rule:peaks+ground+' · '+cutoff+' · '+spacing+'.'},
  };
  if (report.savedCutoff) methods.saved = {
    label:'Saved cutoff · '+cutoffText(detector.savedThreshold),...report.savedCutoff,
    help:'These pins use the score cutoff stored with the model. Compare them with the trial pins on this same scan.',
    rule:peaks+ground+' · saved score cutoff '+detector.savedThreshold+' · '+spacing+'.'
  };
  methods.baseline={label:'Height only',pins:report.baselinePins,evaluation:report.baselineEvaluation,
      help:'This rule keeps the tallest candidate peaks first and removes neighboring peaks that fall inside the crop’s spacing.',
      rule:peaks+' · peaks ranked by smoothed height · '+spacing+'.'
  };
  if (report.orchard) methods.orchard={
    label:'Orchard base locator',pins:report.orchard.pins,evaluation:report.orchardEvaluation,
    help:'This geometric rule looks for scan returns at several heights near the same tree base, then keeps separated base estimates.',
    rule:'Height-band support cutoff '+report.orchard.threshold+' · minimum spacing '+cm(report.orchard.separationMeters)+'.'
  };
  return methods;
}

function drawPlot(report, sampled, pins, assignment, changes, extras, focusedCenter, inspectedPeak) {
  const canvas = byId('testMap'), ctx = canvas.getContext('2d');
  const colors = plotPalette(canvas);
  const {px,py} = plotCoordinates(canvas);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = 0; n <= 10; n += 2) {
    ctx.moveTo(px(n),py(0)); ctx.lineTo(px(n),py(10));
    ctx.moveTo(px(0),py(n)); ctx.lineTo(px(10),py(n));
  }
  ctx.stroke();
  ctx.fillStyle = colors.muted; ctx.font = '13px system-ui';
  ctx.fillText('0',px(0)-9,py(0)+15);
  ctx.fillText('X · 10 m',px(10)-46,py(0)+15);
  ctx.fillText('Y · 10 m',px(0),py(10)-6);
  const {unit,origin} = report.frame, scale = {m:1,cm:.01,mm:.001}[unit];
  ctx.fillStyle = colors.returns;
  for (let i = 0; i < sampled.length; i += 2) {
    ctx.fillRect(px((sampled[i]-origin[0])*scale),py((sampled[i+1]-origin[1])*scale),1.6,1.6);
  }
  if (extras) {
    drawExtraPins(ctx,px,py,pins,report.references,extras,colors);
    return;
  }
  if (changes) {
    report.references.forEach(({localX,localY},i) => {
      const x = px(localX), y = py(localY), change = changes[i];
      ctx.beginPath();
      ctx.arc(x,y,change ? 5.5 : 2.6,0,2*Math.PI);
      if (!change) {
        ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.3; ctx.stroke(); return;
      }
      ctx.fillStyle = change > 0 ? colors.plant : colors.alert; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x-3,y); ctx.lineTo(x+3,y);
      if (change > 0) {ctx.moveTo(x,y-3); ctx.lineTo(x,y+3);}
      ctx.strokeStyle = colors.paper; ctx.lineWidth = 1.6; ctx.stroke();
    });
    if (focusedCenter) {
      const x = px(focusedCenter.localX), y = py(focusedCenter.localY);
      ctx.beginPath(); ctx.arc(x,y,10,0,2*Math.PI);
      ctx.strokeStyle = colors.paper; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.stroke();
    }
    return;
  }
  const assigned = new Set(assignment);
  if (report.references) {
    ctx.strokeStyle = colors.survey;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    report.references.forEach(({localX,localY},i) => {
      const pin = pins[assignment[i]];
      if (pin) {
        ctx.moveTo(px(localX),py(localY));
        ctx.lineTo(px(pin.localX),py(pin.localY));
      }
    });
    ctx.stroke();
    ctx.lineWidth = 1.8;
    report.references.forEach(({localX,localY},i) => {
      const x = px(localX), y = py(localY);
      ctx.strokeStyle = colors.survey;
      ctx.beginPath();
      if (assignment[i] === -1) {
        ctx.moveTo(x-3,y-3); ctx.lineTo(x+3,y+3);
        ctx.moveTo(x-3,y+3); ctx.lineTo(x+3,y-3);
      } else ctx.arc(x,y,4.3,0,2*Math.PI);
      ctx.stroke();
    });
  }
  pins.forEach(({localX,localY},i) => {
    const x = px(localX), y = py(localY);
    if (assignment && !assigned.has(i)) {
      ctx.fillStyle = colors.alert; ctx.fillRect(x-2.5,y-2.5,5,5);
    } else {
      ctx.fillStyle = colors.plant; ctx.beginPath(); ctx.arc(x,y,2.6,0,2*Math.PI); ctx.fill();
    }
  });
  if (inspectedPeak) {
    const x = px(inspectedPeak[0]), y = py(inspectedPeak[1]), size = 8;
    ctx.beginPath();
    ctx.moveTo(x,y-size); ctx.lineTo(x+size,y); ctx.lineTo(x,y+size); ctx.lineTo(x-size,y); ctx.closePath();
    ctx.strokeStyle = colors.paper; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = colors.alert; ctx.lineWidth = 2; ctx.stroke();
  }
}

function renderCutoffComparison(report, distance) {
  const saved = report.savedCutoff;
  const rows = byId('testCutoffRows');
  const savedScore = saved.evaluation?.scores.find(score => score.cm===distance);
  const trialScore = report.evaluation?.scores.find(score => score.cm===distance);
  byId('testCutoffScope').textContent = trialScore ? 'At '+distance+' cm' : 'On this scan';
  byId('testSavedValue').textContent = cutoffText(report.detector.savedThreshold);
  byId('testTrialValue').textContent = cutoffText(report.detector.threshold);
  rows.replaceChildren();
  const items = trialScore ? [
    ['Matched plants', savedScore.tp, trialScore.tp, scoreHelp.Matched],
    ['Extra pins', savedScore.fp, trialScore.fp, scoreHelp.Extra],
    ['Missed plants', savedScore.fn, trialScore.fn, scoreHelp.Missed]
  ] : [['Predicted pins', saved.pins.length, report.pins.length, 'The number of pins placed on this scan. Add reference centers to check individual matches.']];
  for (const [label, before, after, help] of items) {
    const row = rows.insertRow();
    const header = document.createElement('th');
    header.scope = 'row'; header.textContent = label; header.dataset.help = help; row.append(header);
    const delta = after-before;
    for (const count of [before, after]) row.insertCell().textContent = count.toLocaleString();
    const cell = row.insertCell();
    cell.textContent = (delta>0 ? '+' : delta<0 ? '−' : '')+Math.abs(delta).toLocaleString();
    cell.dataset.help = label+' with the trial cutoff ('+after+') minus the saved cutoff ('+before+').';
  }
}

function renderStages(stages, centers, distance) {
  byId('testStagesTitle').textContent = centers ? 'Where did the model lose plants?' : 'How many pins survived?';
  const names = {
    proposals:[centers ? 'Within reach of a peak' : 'Candidate peaks', 'Peaks found in the point cloud before applying the model.'],
    accepted:['After score cutoff', 'Peaks that scored at or above this model’s cutoff.'],
    selected:['After spacing', 'Pins kept after the detector removed nearby duplicates.']
  };
  byId('testStageSummary').textContent = centers
    ? 'Reference centers matched within '+distance+' cm, out of '+centers.toLocaleString()+'.'
    : 'This survey lists no plants. Each row counts candidate pins.';
  const total = centers || stages[0].count;
  byId('testStageRows').replaceChildren(...stages.map(({stage,count,matched}) => {
    const [label,help] = names[stage];
    const value = centers ? matched : count;
    const row = document.createElement('div'), name = document.createElement('dt'), stat = document.createElement('dd');
    name.textContent = label;
    stat.textContent = value.toLocaleString();
    stat.dataset.helpLabel = label;
    stat.dataset.help = help+' '+(centers ? value+' of '+centers+' surveyed centers have a match within '+distance+' cm.' : value+' candidates remain.');
    row.style.setProperty('--portion',(total ? 100*value/total : 0)+'%');
    row.append(name,stat);
    return row;
  }));
}


export function initFieldTest(downloadJSON) {
  explainFieldTest();
  const form = byId('fieldTestForm'), modelSource = byId('testModelSource');
  const weights = byId('testWeights'), ply = byId('testPly'), labels = byId('testLabels');
  const cutoff = byId('testCutoff'), resetCutoff = byId('testResetCutoff');
  const status = byId('testStatus'), results = byId('testResults'), cancel = byId('testCancel');
  const example = byId('testExample'), tryExample = byId('testRunExample');
  const exampleCutoff = byId('testExampleCutoff');
  const sharedExample = new URLSearchParams(location.search).get('fieldExample');
  if ([...example.options].some(option => option.value === sharedExample)) example.value = sharedExample;
  const fields = [...form.querySelectorAll('input,select')];
  let exampleLoad, autoRunFile, exampleResultLabel, exampleScanQuery;
  const practice = tomatoPractice(example,tryExample), inspectSeedlings = initChangedSeedlings();
  const overlay = byId('testOverlay'), compareWeeds = byId('testCompareWeedMap');
  let weedPair;
  let currentModelFile, runningModel, worker, sampled, loaded = false, running = false, report;

  window.addEventListener('crop-theme-change', renderOverlay);
  const extraInspector = initExtraPins(renderOverlay);
  const setSurvey = initSurveyAlignment();
  const featureScale = initFeatureScale(renderOverlay);

  function updateControls() {
    const useFile = modelSource.value === 'file';
    weights.required = useFile;
    byId('testWeightsLabel').hidden = !useFile;
    for (const field of fields) field.disabled = running;
    weights.disabled = running || !useFile;
    tryExample.disabled = running || Boolean(exampleLoad);
    tryExample.textContent = exampleLoad ? 'Preparing example…' : 'Run example';
    resetCutoff.disabled = running || (cutoff.value === '' && !cutoff.validity.badInput);
    byId('testDetect').disabled = running || Boolean(exampleLoad) || !loaded || !(useFile ? weights.files[0] : currentModelFile);
    cancel.hidden = !exampleLoad && (!worker || (loaded && !running));
  }
  function clearWeedMap() {
    weedPair = null;
    compareWeeds.hidden = true;
    overlay.querySelector('option[value="weedChanges"]')?.remove();
    inspectSeedlings(null);
  }
  function clearReport() {
    report = null;
    clearWeedMap();
    setSurvey(null);
    featureScale.setSample(null);
    extraInspector.reset();
    results.hidden = true;
    byId('testExampleResult').hidden = true;
  }
  function renderOverlay() {
    if (!report) return;
    const selected = overlay.value;
    const weedChanges = selected==='weedChanges', cutoffChanges = selected==='changes';
    const showChanges = weedChanges || cutoffChanges;
    const method = methodsFor(report)[showChanges ? 'model' : selected];
    const {pins,evaluation} = method;
    const target = selected==='orchard' ? 'base' : 'center';
    const heading = byId('testSummary'), rule = byId('testRule');
    if (weedChanges) {
      heading.textContent = 'Seedling matches · random → half difficult';
      rule.textContent = 'A plus marks a seedling found only by the half-difficult fit. A minus marks one found only by the random fit.';
      rule.dataset.help = 'Each model placed its own pins on the same scan. Both used the saved cutoff. Each surveyed tomato can match once.';
    } else if (cutoffChanges) {
      heading.textContent = 'Which plants changed?';
      rule.textContent = 'Each symbol marks a surveyed plant. A plus means the trial found it, a minus means it lost its match.';
      rule.dataset.help = 'A plant gains or loses a match when one cutoff places a matching pin and the other does not.';
    } else {
      heading.textContent = method.label+' · '+pins.length+' predicted '+report.crop+' '+target+(pins.length===1?'':'s');
      rule.textContent = method.rule;
      rule.dataset.help = method.help;
    }
    byId('testOrchardHelp').hidden = selected!=='orchard';
    const distance = Number(byId('testMatchDistance').value);
    setSurvey(report,selected,showChanges ? null : method,distance);
    const assignment = evaluation?.pinByReferenceAtCm[distance];
    const extras = extraInspector.render(pins,showChanges ? null : assignment,report.references,distance);
    byId('testMap').toggleAttribute('data-help-action',Boolean(extras) || weedChanges);
    byId('testExport').textContent = weedChanges ? 'Download '+(report===weedPair.hard ? 'half-difficult' : 'random')+' fit JSON' : 'Download field test JSON';
    const stages = !extras && selected==='model' && report.stagesAtCm?.[distance];
    byId('testStages').hidden = !stages;
    if (stages) renderStages(stages, report.references.length, distance);
    byId('testDistanceControl').hidden = !evaluation;
    byId('testMatchedKey').hidden = !evaluation || showChanges || Boolean(extras);
    byId('testExtraKey').hidden = !extras;
    byId('testUnscoredKey').hidden = Boolean(evaluation);
    byId('testChangedKey').hidden = !showChanges;
    const modelView = selected==='model' || selected==='saved' || cutoffChanges;
    const comparison = byId('testCutoffComparison');
    comparison.hidden = !modelView || !report.savedCutoff;
    if (!comparison.hidden) renderCutoffComparison(report,distance);
    byId('testAdjustCutoff').hidden = !modelView;
    let changes;
    let message = 'Add reference centers to score these predictions.';
    if (showChanges) {
      const previous = (weedChanges ? weedPair.random : report.savedCutoff).evaluation.pinByReferenceAtCm[distance];
      const current = weedChanges ? weedPair.hard.evaluation.pinByReferenceAtCm[distance] : assignment;
      changes = current.map((pin,i) => Number(pin>=0)-Number(previous[i]>=0));
      const gained = changes.filter(change=>change>0).length, lost = changes.filter(change=>change<0).length;
      message = 'At '+distance+' cm, '+gained+' gained a match and '+lost+' lost a match. '+(changes.length-gained-lost)+' kept the same status.';
    } else if (evaluation) {
      const score = evaluation.scores.find(row=>row.cm===distance);
      message = score.tp+' of '+report.references.length+' reference centers matched within '+distance+' cm. '+
        score.fp+' extra '+(score.fp===1?'pin':'pins')+' · '+score.fn+' missed '+(score.fn===1?'center':'centers')+'.';
    }
    byId('testOutcome').textContent = message;
    const description = weedChanges ? 'Comparing random and half-difficult fits' : cutoffChanges ? 'Comparing both cutoffs' :
      'Showing '+method.label.toLowerCase()+' pins';
    status.textContent = description+' on '+report.files.scan.name+'.';
    if (weedPair) practice.showScores(distance);
    const focusedCenter = inspectSeedlings(weedChanges ? weedPair : null,distance,changes);
    const inspectedPeak = !extras && (selected === 'model' || selected === 'saved') ? featureScale.visiblePeak() : null;
    byId('testScaleKey').hidden = !inspectedPeak;
    drawPlot(report,sampled,pins,assignment,changes,extras,focusedCenter,inspectedPeak);
  }
  function loadScan() {
    worker?.terminate(); worker = null;
    clearReport();
    running = false; loaded = false; sampled = null;
    byId('testExtent').textContent = '';
    const file = ply.files[0];
    if (!file) {
      status.textContent = 'Choose a scan and a model to begin.';
      updateControls(); return;
    }
    status.textContent = 'Reading '+file.name+'…';
    const active = worker = new Worker(new URL('./field-test-worker.js?v=scale-probe1',import.meta.url),{type:'module'});
    updateControls();
    function fail(message) {
      if (active !== worker) return;
      if (!loaded) {active.terminate(); worker = null;}
      running = false; clearReport();
      status.textContent = message; updateControls();
    }
    active.onerror = event => {
      if (active !== worker) return;
      loaded = false;
      fail(event.message || 'Could not start the field test. Select the scan again to retry.');
    };
    active.onmessage = ({data}) => {
      if (active !== worker) return;
      if (data.type === 'error') {fail(data.message); return;}
      if (data.type === 'loaded') {
        sampled = data.sampled; loaded = true;
        const fmt = v => v.toLocaleString(undefined,{maximumFractionDigits:5,useGrouping:false});
        const ranges = ['X','Y','Z'].map((name,i) => name+' '+fmt(data.min[i])+' to '+fmt(data.max[i]));
        byId('testExtent').textContent = data.count.toLocaleString()+' returns in file coordinates · '+ranges.join(' · ');
        status.textContent = 'Scan ready. Check its units and ground elevation, then select Find plants.';
      } else if (data.type === 'done') {
        running = false;
        if (modelSource.value === 'current' && runningModel !== currentModelFile) {
          clearReport(); status.textContent = 'A new fit finished during this test. Run again to use its weights.';
          updateControls(); return;
        }
        report = data.report;
        featureScale.setSample(data.featureProbe,report.files.model.name);
        const overlayOptions = Object.entries(methodsFor(report)).map(([id,m])=>new Option(m.label,id));
        if (report.savedCutoff && report.references?.length) overlayOptions.splice(2,0,new Option('Changed matches','changes'));
        weedPair = exampleResultLabel ? practice.record(example.value,report,exampleScanQuery) : null;
        if (weedPair) overlayOptions.push(new Option('Gains and losses','weedChanges'));
        compareWeeds.hidden = !weedPair;
        overlay.replaceChildren(...overlayOptions);
        results.hidden = false; renderOverlay();
        renderScoreTables(report.evaluation ? Object.values(methodsFor(report)) : []);
        if (exampleResultLabel) {
          const receipt = byId('testExampleResult');
          const threshold = report.detector.threshold;
          receipt.querySelector('[role="status"]').textContent = exampleResultLabel+' · cutoff '+cutoffText(threshold)+' · '+byId('testOutcome').textContent;
          exampleCutoff.hidden = Boolean(report.savedCutoff) || threshold!==.50;
          receipt.hidden = false;
        }
      }
      updateControls();
      if (data.type === 'loaded' && autoRunFile === file) {
        autoRunFile = null;
        form.requestSubmit(byId('testDetect'));
      }
    };
    active.postMessage({type:'load',file});
  }
  function stopExampleLoad() {
    exampleLoad?.abort();
    exampleLoad = null;
    autoRunFile = null;
    exampleResultLabel = null;
    exampleScanQuery = null;
    exampleCutoff.hidden = true;
  }
  exampleCutoff.addEventListener('click',() => {
    if (!exampleResultLabel || !report || report.savedCutoff || running) return;
    cutoff.value = '0.70';
    exampleCutoff.hidden = true;
    form.requestSubmit(byId('testDetect'));
  });
  byId('testAdjustCutoff').addEventListener('click',() => {
    byId('testCutoffSettings').open = true;
    cutoff.focus();
  });
  tryExample.addEventListener('click',async () => {
    stopExampleLoad();
    clearReport();
    const pending = exampleLoad = new AbortController();
    const choice = example.value;
    updateControls();
    status.textContent = 'Growing the example planting and loading its saved weights…';
    try {
      const {tomatoExampleFiles,selectFile} = await import('./tomato-example.js?v=paired-map1');
      const files = await tomatoExampleFiles(choice,pending.signal);
      pending.signal.throwIfAborted();
      selectFile(weights,files.model);
      selectFile(labels,files.labels);
      selectFile(ply,files.ply);
      modelSource.value = 'file';
      byId('testUnits').value = 'm';
      for (const id of ['testX','testY','testZ','testGradeX','testGradeY']) byId(id).value = '0';
      cutoff.value = '';
      if (!practice.keepDistance(choice)) byId('testMatchDistance').value = '15';
      autoRunFile = ply.files[0];
      exampleResultLabel = example.selectedOptions[0].textContent;
      exampleScanQuery = files.scanQuery;
      exampleLoad = null;
      loadScan();
    } catch (error) {
      if (exampleLoad !== pending) return;
      exampleLoad = null;
      status.textContent = error.message || 'Could not prepare the tomato example. Try again.';
      updateControls();
    }
  });
  ply.addEventListener('change',() => {practice.forget(); stopExampleLoad(); loadScan();});
  resetCutoff.addEventListener('click',()=>{
    cutoff.value='';
    cutoff.dispatchEvent(new Event('input',{bubbles:true}));
    cutoff.focus();
  });
  form.addEventListener('input',event => {
    if (running) return;
    const hadPendingExample = Boolean(exampleLoad);
    stopExampleLoad();
    if (event.target !== example || !practice.keepDistance(example.value)) practice.forget();
    if (event.target === example || event.target === ply) {
      const replaceMap = overlay.value==='weedChanges';
      clearWeedMap();
      if (replaceMap && report) {overlay.value = 'model'; renderOverlay();}
      byId('testExampleResult').hidden = true;
      updateControls();
      if (hadPendingExample) status.textContent = 'Example canceled. The selected files were kept.';
      return;
    }
    clearReport(); updateControls();
    if (loaded) status.textContent = 'Ready to run with the selected inputs.';
    else if (hadPendingExample) status.textContent = 'Example canceled. Choose a scan and a model to begin.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!loaded || running || !form.reportValidity()) return;
    const modelFile = modelSource.value === 'file' ? weights.files[0] : currentModelFile;
    if (!modelFile) return;
    const numbers = ids => ids.map(id=>byId(id).valueAsNumber);
    const alignment = {unit:byId('testUnits').value,origin:numbers(['testX','testY','testZ']),
      gradePercent:numbers(['testGradeX','testGradeY'])};
    runningModel = modelFile; clearReport(); running = true; status.textContent = 'Finding plant centers in the scan…';
    updateControls();
    worker.postMessage({type:'detect',alignment,modelFile,labelFile:labels.files[0],
      thresholdOverride:cutoff.value==='' ? undefined : cutoff.valueAsNumber});
  });
  cancel.addEventListener('click',() => {
    if (exampleLoad) {
      stopExampleLoad();
      status.textContent = 'Example canceled. The selected files were kept.';
      updateControls(); return;
    }
    autoRunFile = null;
    if (!loaded) {ply.value = ''; loadScan(); return;}
    loadScan();
  });
  byId('testMatchDistance').addEventListener('change',renderOverlay);
  overlay.addEventListener('change',renderOverlay);
  byId('testWeedPlant').addEventListener('change',renderOverlay);
  compareWeeds.addEventListener('click',() => {
    if (!weedPair || !report) return;
    overlay.value = 'weedChanges';
    renderOverlay();
    const heading = byId('testSummary');
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start'});
  });
  byId('testExport').addEventListener('click',() => {
    if (!report) return;
    const trial = report.detector.savedThreshold === undefined ? '' : '-cutoff-'+report.detector.threshold;
    downloadJSON(report,'field-test-'+report.crop+'-'+report.files.scan.sha256.slice(0,10)+trial+'.json');
  });
  // A visitor can pick a file before this module finishes loading.
  if (ply.files.length) loadScan();
  else updateControls();
  return (artifact,seed) => {
    currentModelFile = new File([JSON.stringify(artifact,null,2)+'\n'],'crop-weights-'+artifact.crop+'-'+seed+'.json',{type:'application/json'});
    const option = modelSource.querySelector('[value=current]');
    option.disabled = false;
    option.textContent = 'Completed '+artifact.crop+' fit · seed '+seed;
    if (modelSource.value === 'current' && !running) {
      clearReport(); status.textContent = 'New fit available. Run the field test again to use it.';
    }
    if (!weights.files.length && !running) modelSource.value = 'current';
    updateControls();
  };
}
