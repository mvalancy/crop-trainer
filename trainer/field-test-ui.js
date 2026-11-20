const byId = id => document.getElementById(id);
const rate = v => v === null ? '—' : (100*v).toFixed(1)+'%';

function drawPlot(report, sampled, baseline) {
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
  const pins = baseline ? report.baselinePins : report.pins;
  const evaluation = baseline ? report.baselineEvaluation : report.evaluation;
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
  for (const [method,evaluation] of [['Trained model',report.evaluation],['Height only',report.baselineEvaluation]]) {
    for (const s of evaluation.scores) {
      const tr = body.insertRow();
      for (const v of [method,s.cm+' cm',s.tp,s.fp,s.fn,rate(s.precision),rate(s.recall),rate(s.f1)]) {
        tr.insertCell().textContent = String(v);
      }
    }
  }
}

export function initFieldTest(downloadJSON) {
  const form = byId('fieldTestForm'), modelSource = byId('testModelSource');
  const weights = byId('testWeights'), ply = byId('testPly'), labels = byId('testLabels');
  const status = byId('testStatus'), results = byId('testResults'), cancel = byId('testCancel');
  const fields = [...form.querySelectorAll('input,select')];
  let currentModelFile, runningModel, worker, sampled, loaded = false, running = false, report;

  function updateControls() {
    const useFile = modelSource.value === 'file';
    weights.required = useFile;
    byId('testWeightsLabel').hidden = !useFile;
    for (const field of fields) field.disabled = running;
    weights.disabled = running || !useFile;
    byId('testDetect').disabled = running || !loaded || !(useFile ? weights.files[0] : currentModelFile);
    cancel.hidden = !worker || (loaded && !running);
  }
  function clearReport() {
    report = null;
    results.hidden = true;
  }
  function renderOverlay() {
    if (!report) return;
    const baseline = byId('testOverlay').value === 'baseline';
    const evaluation = baseline ? report.baselineEvaluation : report.evaluation;
    const pins = baseline ? report.baselinePins : report.pins;
    const name = baseline ? 'The height-only baseline' : 'The trained model';
    let message = name+' placed '+pins.length+' pins.';
    if (evaluation) {
      const delta = evaluation.signedCountError;
      message += ' The survey has '+report.references.length+' centers. ';
      message += delta === 0 ? 'The counts agree.' : 'The count is '+Math.abs(delta)+(delta > 0 ? ' over' : ' under')+' the survey total.';
    } else message += ' Add surveyed centers to measure accuracy.';
    byId('testOutcome').textContent = message;
    drawPlot(report,sampled,baseline);
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
    const active = worker = new Worker(new URL('./field-test-worker.js?v=systems1',import.meta.url),{type:'module'});
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
        byId('testRule').textContent = 'Peak floor '+(report.detector.minimumHeight*100).toFixed(1)+' cm · saved score cutoff '+report.detector.threshold+' · minimum spacing '+(report.detector.pinSeparation*100).toFixed(1)+' cm.';
        byId('testStages').hidden = !report.stages15cm;
        if (report.stages15cm) {
          const [peaks,passed,kept] = report.stages15cm;
          byId('testStageSummary').textContent = report.references.length
            ? 'Of '+report.references.length+' surveyed plants, '+peaks.matched+' could be matched to raw peaks, '+passed.matched+' after the score cutoff, and '+kept.matched+' after spacing.'
            : 'The surveyed plot is empty. The detector found '+peaks.count+' raw peaks, '+passed.count+' passed the cutoff, and '+kept.count+' pins remained after spacing.';
        }
        byId('testSummary').textContent = report.pins.length+' predicted '+report.crop+' centers';
        byId('testOverlay').value = 'model';
        results.hidden = false; renderOverlay(); renderScores(report);
        status.textContent = 'Compared both detectors on '+report.proposalCount+' candidate peaks in '+report.files.scan.name+'.';
      }
      updateControls();
    };
    active.postMessage({type:'load',file});
  }
  ply.addEventListener('change',loadScan);
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
    runningModel = modelFile; clearReport(); running = true; status.textContent = 'Finding peaks and comparing both detectors…';
    updateControls();
    worker.postMessage({type:'detect',alignment,modelFile,labelFile:labels.files[0]});
  });
  cancel.addEventListener('click',() => {
    if (!loaded) {ply.value = ''; loadScan(); return;}
    loadScan();
  });
  byId('testOverlay').addEventListener('change',renderOverlay);
  byId('testExport').addEventListener('click',() => {
    if (report) downloadJSON(report,'field-test-'+report.crop+'-'+report.files.scan.sha256.slice(0,10)+'.json');
  });
  updateControls();
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
