const byId = id => document.getElementById(id);
const rate = v => v === null ? '—' : (100*v).toFixed(1)+'%';

// Header descriptions also explain the values in their column.
const scoreHelp = {
  Method:'The rule used to place pins. Each method sees the same scan and is checked against the same reference centers.',
  Distance:'The largest horizontal distance allowed between a pin and a reference center for this row. Changing the distance changes which pins count as matches.',
  Matched:'Labeled plants paired with a pin within this distance. Each pin and each plant can count once.',
  Extra:'Predicted pins left over after matching. Two pins near one plant can give one match and one extra.',
  Missed:'Labeled plants left without a matching pin at this distance.',
  Precision:'Share of predicted pins that match a labeled plant at this distance. A dash means the method placed no pins.',
  Recall:'Share of labeled plants that have a matching pin at this distance. A dash means the reference file lists no plants.',
  F1:'A score balancing extra pins and missed plants. It reaches 100% when every pin matches a plant and every plant has a pin. A dash means the reference file and the detector both counted zero plants.'
};

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
    ['#testLegend','Map symbols','When reference centers are loaded, the map uses the 15 cm matching distance. The score table also shows results at the other distances.'],
    ['#testOutcome','Field test outcome','Compare the selected method’s pins with the reference centers. Every plant and pin can match once. With only a scan and weights, the map shows the predicted locations.'],
    ['#testRule','Pin placement rule','The height floor controls which peaks qualify. The saved model then uses a score cutoff. Spacing controls how close two surviving pins can be.'],
    ['#testStageSummary','Detection stages','Read from left to right to see where plant centers lost a nearby pin, first when finding peaks, then when filtering by score and spacing. For a plot with zero reference centers, the counts are pins at each step.'],
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
    model:{label:'Trained model',pins:report.pins,evaluation:report.evaluation,
      help:'The saved detector scores each candidate using the shape of nearby scan points. The model cutoff and minimum spacing determine which pins remain.',
      rule:peaks+ground+' · '+cutoff+' · '+spacing+'.'},
    baseline:{label:'Height only',pins:report.baselinePins,evaluation:report.baselineEvaluation,
      help:'This rule keeps the tallest candidate peaks first and removes neighboring peaks that fall inside the crop’s spacing.',
      rule:peaks+' · peaks ranked by smoothed height · '+spacing+'.'}
  };
  if (report.orchard) methods.orchard={
    label:'Orchard base locator',pins:report.orchard.pins,evaluation:report.orchardEvaluation,
    help:'This geometric rule looks for scan returns at several heights near the same tree base, then keeps separated base estimates.',
    rule:'Height-band support cutoff '+report.orchard.threshold+' · minimum spacing '+cm(report.orchard.separationMeters)+'.'
  };
  return methods;
}

function drawPlot(report, sampled, {pins,evaluation}) {
  const canvas = byId('testMap'), ctx = canvas.getContext('2d');
  const inset = 26, side = canvas.width-2*inset;
  const px = x => inset+x*side/10, py = y => inset+(10-y)*side/10;
  ctx.fillStyle = '#f2f3e9';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#d1d7c5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = 0; n <= 10; n += 2) {
    ctx.moveTo(px(n),py(0)); ctx.lineTo(px(n),py(10));
    ctx.moveTo(px(0),py(n)); ctx.lineTo(px(10),py(n));
  }
  ctx.stroke();
  ctx.fillStyle = '#4c5d4f'; ctx.font = '13px system-ui';
  ctx.fillText('0',px(0)-9,py(0)+15);
  ctx.fillText('X · 10 m',px(10)-46,py(0)+15);
  ctx.fillText('Y · 10 m',px(0),py(10)-6);
  const {unit,origin} = report.frame, scale = {m:1,cm:.01,mm:.001}[unit];
  ctx.fillStyle = '#acb79f';
  for (let i = 0; i < sampled.length; i += 2) {
    ctx.fillRect(px((sampled[i]-origin[0])*scale),py((sampled[i+1]-origin[1])*scale),1.6,1.6);
  }
  const assigned = new Set(evaluation?.pinByReference15);
  if (report.references) {
    ctx.lineWidth = 1.8;
    report.references.forEach(({localX,localY},i) => {
      const x = px(localX), y = py(localY);
      ctx.strokeStyle = '#644883';
      ctx.beginPath();
      if (evaluation.pinByReference15[i] === -1) {
        ctx.moveTo(x-3,y-3); ctx.lineTo(x+3,y+3);
        ctx.moveTo(x-3,y+3); ctx.lineTo(x+3,y-3);
      } else ctx.arc(x,y,4.3,0,2*Math.PI);
      ctx.stroke();
    });
  }
  pins.forEach(({localX,localY},i) => {
    const x = px(localX), y = py(localY);
    if (evaluation && !assigned.has(i)) {
      ctx.fillStyle = '#a1381e'; ctx.fillRect(x-2.5,y-2.5,5,5);
    } else {
      ctx.fillStyle = '#00664e'; ctx.beginPath(); ctx.arc(x,y,2.6,0,2*Math.PI); ctx.fill();
    }
  });
  byId('testLegend').textContent = evaluation
    ? 'At 15 cm: green dots are matched pins, rust squares are extra pins, purple rings are matched centers, and crosses are missed centers.'
    : 'Green dots mark predicted centers. Grey dots show a sample of the scan returns. The plot spans 10 m on each axis.';
}

function renderScores(report) {
  const body = byId('testRows');
  body.replaceChildren();
  byId('testMetrics').hidden = !report.evaluation;
  if (!report.evaluation) return;
  for (const {label:method,help,evaluation} of Object.values(methodsFor(report))) {
    for (const s of evaluation.scores) {
      const tr = body.insertRow();
      const methodCell = tr.insertCell();
      methodCell.textContent = method;
      methodCell.dataset.help = help;
      for (const v of [s.cm+' cm',s.tp,s.fp,s.fn]) {
        tr.insertCell().textContent = String(v);
      }
      const predicted = s.tp+s.fp, labeled = s.tp+s.fn;
      const ratios = [
        ['Precision',s.precision,predicted ? 'Share of predicted pins that match a labeled plant. Here '+s.tp+' of '+predicted+' pins matched.' : scoreHelp.Precision],
        ['Recall',s.recall,labeled ? 'Share of labeled plants that have a matching pin. Here '+s.tp+' of '+labeled+' labeled plants matched.' : scoreHelp.Recall],
        ['F1',s.f1,s.f1 === null ? scoreHelp.F1 : 'F1 balances extra pins and missed plants. Here '+s.tp+' matches, '+s.fp+' extra pins and '+s.fn+' missed plants give '+rate(s.f1)+'.']
      ];
      for (const [name,value,help] of ratios) {
        const cell = tr.insertCell();
        cell.textContent = rate(value);
        cell.dataset.helpLabel = method+' · '+name+' at '+s.cm+' cm';
        cell.dataset.help = help;
      }
    }
  }
}

export function initFieldTest(downloadJSON) {
  explainFieldTest();
  const form = byId('fieldTestForm'), modelSource = byId('testModelSource');
  const weights = byId('testWeights'), ply = byId('testPly'), labels = byId('testLabels');
  const cutoff = byId('testCutoff'), resetCutoff = byId('testResetCutoff');
  const status = byId('testStatus'), results = byId('testResults'), cancel = byId('testCancel');
  const fields = [...form.querySelectorAll('input,select')];
  let currentModelFile, runningModel, worker, sampled, loaded = false, running = false, report;

  function updateControls() {
    const useFile = modelSource.value === 'file';
    weights.required = useFile;
    byId('testWeightsLabel').hidden = !useFile;
    for (const field of fields) field.disabled = running;
    weights.disabled = running || !useFile;
    resetCutoff.disabled = running || (cutoff.value === '' && !cutoff.validity.badInput);
    byId('testDetect').disabled = running || !loaded || !(useFile ? weights.files[0] : currentModelFile);
    cancel.hidden = !worker || (loaded && !running);
  }
  function clearReport() {
    report = null;
    results.hidden = true;
  }
  function renderOverlay() {
    if (!report) return;
    const selected = byId('testOverlay').value;
    const method = methodsFor(report)[selected];
    const {pins,evaluation} = method;
    const target = selected==='orchard' ? 'base' : 'center';
    byId('testSummary').textContent = method.label+' · '+pins.length+' predicted '+report.crop+' '+target+(pins.length===1?'':'s');
    byId('testRule').textContent = method.rule;
    byId('testRule').dataset.help = method.help;
    byId('testOrchardHelp').hidden = selected!=='orchard';
    byId('testStages').hidden = selected!=='model' || !report.stages15cm;
    let message = 'Add reference centers to score these predictions.';
    if (evaluation) {
      const at15 = evaluation.scores.find(score=>score.cm===15);
      message = at15.tp+' of '+report.references.length+' reference centers matched within 15 cm. '+
        at15.fp+' extra '+(at15.fp===1?'pin':'pins')+' · '+at15.fn+' missed '+(at15.fn===1?'center':'centers')+'.';
    }
    byId('testOutcome').textContent = message;
    status.textContent = 'Showing '+method.label.toLowerCase()+' pins on '+report.files.scan.name+'.';
    drawPlot(report,sampled,method);
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
    const active = worker = new Worker(new URL('./field-test-worker.js?v=cutoff1',import.meta.url),{type:'module'});
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
        if (report.stages15cm) {
          const [peaks,passed,kept] = report.stages15cm;
          byId('testStageSummary').textContent = report.references.length
            ? 'Of '+report.references.length+' labeled plants, '+peaks.matched+' could be matched to raw peaks, '+passed.matched+' after the score cutoff, and '+kept.matched+' after spacing.'
            : 'The reference file lists zero plants. The detector found '+peaks.count+' raw peaks, '+passed.count+' passed the cutoff, and '+kept.count+' pins remained after spacing.';
        }
        byId('testOverlay').replaceChildren(...Object.entries(methodsFor(report)).map(([id,m])=>new Option(m.label,id)));
        results.hidden = false; renderOverlay(); renderScores(report);
      }
      updateControls();
    };
    active.postMessage({type:'load',file});
  }
  ply.addEventListener('change',loadScan);
  resetCutoff.addEventListener('click',()=>{
    cutoff.value='';
    cutoff.dispatchEvent(new Event('input',{bubbles:true}));
    cutoff.focus();
  });
  form.addEventListener('input',event => {
    if (event.target === ply || running) return;
    clearReport(); updateControls();
    if (loaded) status.textContent = 'Ready to run with the selected inputs.';
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
    if (!loaded) {ply.value = ''; loadScan(); return;}
    loadScan();
  });
  byId('testOverlay').addEventListener('change',renderOverlay);
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
