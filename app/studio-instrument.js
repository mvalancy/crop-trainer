import {createInspector} from './studio-inspector.js';

// Assemble the workbench from the instrument's original nodes. The generator, trainer,
// form validation, downloads and worker callbacks keep their existing references.
export function installInstrument(doc, tool, reference, shell) {
  const scan = tool === 'field';
  const compare = tool === 'benchmark';
  const name = {field:'Scan', trainer:'Training', benchmark:'Comparison', test:'Field test'}[tool];
  const find = selector => doc.querySelector(selector);
  const make = (tag, name) => {
    const element = doc.createElement(tag);
    element.className = name;
    return element;
  };
  const workbench = make('section', 'instrument');
  const stage = make('div', 'instrumentStage');
  const transport = make('div', 'instrumentTransport');
  const readout = make('div', 'instrumentReadout');
  const action = make('div', 'instrumentAction');

  workbench.dataset.instrument = tool;
  workbench.setAttribute('aria-label', name + ' workbench');
  // Reading findings leaves the last chosen input and its action available.
  let onSelect;
  if (tool === 'test') {
    workbench.dataset.input = 'example';
    onSelect = panel => {
      if (panel.id === 'test-inspector-example') workbench.dataset.input = 'example';
      if (panel.id === 'test-inspector-your-plot') workbench.dataset.input = 'local';
    };
  }
  const inspector = createInspector(workbench, name, shell, onSelect);
  const {addPanel} = inspector;
  transport.append(readout, action);
  workbench.append(stage, inspector.drawer, transport);
  find({field:'#field', trainer:'#controls', benchmark:'#main', test:'#field-test'}[tool]).prepend(workbench);

  function moveRunActions(form) {
    for (const button of [find('#run'), find('#cancel')]) {
      const proxy = button.nextElementSibling;
      if (form) button.setAttribute('form', form);
      action.append(button);
      if (proxy?.matches('.helpDisabledProxy')) action.append(proxy);
    }
  }

  function illustratedStart(figure, view, art, alt, question) {
    const image = figure.querySelector('img');
    image.src = new URL('../art/'+art+'.webp', import.meta.url).href;
    image.alt = alt;
    figure.classList.add('illustratedStart');
    const link = doc.createElement('a');
    link.className = 'startExperiment';
    link.href = '#explore-'+view;
    link.textContent = question;
    figure.append(link);
  }
  if (tool === 'test') {
    const field = find('#field-test');
    const form = find('#fieldTestForm');
    const results = find('#testResults');
    const map = find('#testMap');
    const ready = make('figure', 'firstRun');
    const picture = make('img', '');
    picture.src = '../art/survey-pair.svg';
    picture.alt = 'A measured planting, a laser scan and detector pins share one coordinate frame.';
    const caption = make('figcaption', '');
    caption.textContent = field.querySelector('.sectionHead p').textContent;
    ready.append(picture, caption);
    illustratedStart(ready,'test','field-lab-quadrant','Illustrated practice plot with four lettuces surrounding a weed.','Explore match distance →');
    stage.append(ready, map);
    const detect = find('#testDetect');
    detect.setAttribute('form', form.id);
    const cancel = find('#testCancel');
    cancel.textContent = 'Cancel';
    const runExample = find('#testRunExample');
    action.append(runExample, detect, cancel);
    readout.append(find('#testStatus'));
    const example = find('#testTomatoExample');
    find('#testExample').setAttribute('form', form.id);
    addPanel('Example', 'Try a saved detector on a labeled synthetic tomato plot.', example);
    const inputs = addPanel('Your plot', 'Choose a scan and set its detection threshold.', form);
    const findings = addPanel('Findings', 'Inspect plant detections and export the pins.', results, find('.fieldEvidence'), find('.testGuides'));
    const jump = make('button', 'instrumentResult');
    jump.type = 'button';
    jump.textContent = 'Inspect detections';
    jump.addEventListener('click', () => { inspector.open(findings); findings.focus(); });
    readout.append(jump);
    const sync = () => {
      map.hidden = results.hidden;
      ready.hidden = !results.hidden;
      jump.hidden = results.hidden;
    };
    new MutationObserver(sync).observe(results, {attributes:true, attributeFilter:['hidden']});
    sync();
    find('#testAdjustCutoff').addEventListener('click', () => {
      inspector.open(inputs);
      find('#testCutoff').focus();
    });
    find('#testCompareWeedMap').addEventListener('click', () => {
      inspector.open(findings);
      find('#testSummary').focus();
    });
  } else if (compare) {
    const watch = find('#benchWatch');
    const ready = make('figure', 'firstRun');
    const caption = make('figcaption', '');
    caption.textContent = 'Two detectors see the same plantings. Compare the pins each places on fresh fields.';
    ready.append(find('.benchContext img'), caption);
    illustratedStart(ready,'compare','field-lab-quadrant','Four labeled lettuces and a weed on a shared illustration.','Explore the score cutoff →');
    stage.append(ready, watch.querySelector('.liveScene'));
    find('#run').textContent = 'Compare';
    moveRunActions('benchForm');
    readout.append(find('#status'));
    const scores = make('a', 'instrumentResult');
    scores.href = '#benchResults';
    scores.textContent = 'View results';
    readout.append(scores);
    addPanel('Setup', 'Choose the detectors and fields to compare.', find('#benchForm'));
    const presets = find('#benchExamples');
    presets.open = true;
    addPanel('Presets', 'Start from a ready-made experiment.', presets);
    addPanel('Scoreboard', 'See each detector’s scores as the seeds finish.', watch);
  } else if (scan) {
    const settings = find('#scan-settings');
    const view = find('#scan-view-controls');
    const grow = find('.growActions button[type=submit]');
    grow.setAttribute('form', 'grow');
    grow.textContent = 'Scan field';
    action.append(grow);
    stage.append(find('#scan-viewer'));
    const gestures = find('#cameraHelp').querySelectorAll('p');
    gestures[0].lastChild.textContent = ' Drag to turn or tilt the field. Shift-drag to pan. Use the wheel to zoom.';
    gestures[1].lastChild.textContent = ' Drag to turn and tilt. Pinch to zoom or move two fingers together to pan.';
    readout.append(find('#fieldCaption'), find('#generationStatus'), find('#trainLayout'));
    addPanel('Planting', 'Choose a crop, field seed and scan layout.', settings);
    view.open = true;
    addPanel('3D view', 'Adjust the viewpoint and visible layers.', view);
    addPanel('Plant & scanner', 'Change plant shapes, scan noise and obstacles.', find('#advanced-scan'));
    addPanel('Findings', 'Explore scan coverage and download the field.', find('.scanSummary'));
  } else {
    const firstRun = find('#firstRun');
    illustratedStart(firstRun,'train','field-film-height','A lettuce and a weed of equal height.','Explore one learning step →');
    const image = firstRun.querySelector('img');
    const caption = firstRun.querySelector('figcaption');
    const original = {src:image.src, alt:image.alt, caption:caption.textContent};
    function showReference(ref) {
      if (!ref || ref.search !== doc.location.search || firstRun.hidden) return;
      image.src = ref.image;
      image.alt = 'Your scanned field from the camera angle you chose.';
      caption.textContent = ref.label + '. The trainer grows fresh plantings for practice and scoring.';
      firstRun.classList.add('scanReference');
    }
    showReference(reference);
    doc.addEventListener('studio-scan-reference', event => showReference(event.detail));
    find('#crop').addEventListener('change', () => {
      image.src = original.src;
      image.alt = original.alt;
      caption.textContent = original.caption;
      firstRun.classList.remove('scanReference');
    });
    stage.append(firstRun, find('#trainingScene'));
    const setup = find('.setupPanel');
    const monitor = find('.monitorPanel');
    const stageStatus = monitor.querySelector('.stage');
    const run = find('#run');
    run.textContent = 'Start training';
    moveRunActions();
    readout.append(stageStatus.querySelector('#stage'), stageStatus.querySelector('#progress'));
    addPanel('Setup', 'Choose a field and a training budget.', setup);
    addPanel('Model', 'Explore how a detector turns measurements into a prediction.', find('#detector'));
    addPanel('Training plan', 'Set the schedule, datasets and detection rules.', find('.advancedPanel'));
    addPanel('Run notes', 'Read the fit estimate and progress messages.', find('#status'), find('#estimateText'), find('#reviewLink'), monitor.querySelector('.method'));
    // Keep the result handoff within reach when a fit completes, even with Setup selected.
    const result = make('a', 'instrumentResult');
    result.href = '#resultsTitle';
    result.textContent = 'View scores';
    const review = find('#reviewLink');
    const sync = () => { result.hidden = review.hidden; };
    new MutationObserver(sync).observe(review, {attributes:true, attributeFilter:['hidden']});
    sync();
    readout.append(result);
  }

  return inspector;
}
