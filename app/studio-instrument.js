// Assemble the workbench from the instrument's original nodes. The generator, trainer,
// form validation, downloads and worker callbacks keep their existing references.
export function installInstrument(doc, tool, reference) {
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
  const inspector = make('section', 'instrumentInspector');
  const topics = make('div', 'instrumentTopics');
  const transport = make('div', 'instrumentTransport');
  const readout = make('div', 'instrumentReadout');
  const action = make('div', 'instrumentAction');
  const panels = new Map();

  workbench.dataset.instrument = tool;
  workbench.setAttribute('aria-label', name + ' workbench');
  inspector.setAttribute('aria-label', name + ' inspector');
  topics.setAttribute('role', 'group');
  topics.setAttribute('aria-label', 'Inspector sections');
  inspector.append(topics);
  transport.append(readout, action);
  workbench.append(stage, inspector, transport);
  find({field:'#field', trainer:'#controls', benchmark:'#main', test:'#field-test'}[tool]).prepend(workbench);

  function show(selected) {
    workbench.dataset.panel = selected.id;
    for (const [panel, button] of panels) {
      panel.hidden = panel !== selected;
      button.setAttribute('aria-pressed', String(panel === selected));
    }
  }
  function addPanel(name, ...content) {
    const panel = make('section', 'instrumentPanel');
    const button = make('button', 'topicButton');
    panel.id = tool + '-inspector-' + name.toLowerCase().replaceAll(' ', '-');
    panel.setAttribute('aria-label', name);
    panel.tabIndex = 0;
    button.type = 'button';
    button.textContent = name;
    button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => show(panel));
    panels.set(panel, button);
    topics.append(button);
    panel.append(...content);
    inspector.append(panel);
    return panel;
  }

  function moveRunActions(form) {
    for (const button of [find('#run'), find('#cancel')]) {
      const proxy = button.nextElementSibling;
      if (form) button.setAttribute('form', form);
      action.append(button);
      if (proxy?.matches('.helpDisabledProxy')) action.append(proxy);
    }
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
    addPanel('Example', example);
    const inputs = addPanel('Your plot', form);
    const findings = addPanel('Findings', results, find('.fieldEvidence'), find('.testGuides'));
    const jump = make('button', 'instrumentResult');
    jump.type = 'button';
    jump.textContent = 'Inspect detections';
    jump.addEventListener('click', () => { show(findings); findings.focus(); });
    readout.append(jump);
    const sync = () => {
      map.hidden = results.hidden;
      ready.hidden = !results.hidden;
      jump.hidden = results.hidden;
    };
    new MutationObserver(sync).observe(results, {attributes:true, attributeFilter:['hidden']});
    sync();
    find('#testAdjustCutoff').addEventListener('click', () => {
      show(inputs);
      find('#testCutoff').focus();
    });
    form.addEventListener('invalid', () => show(inputs), true);
    find('#testCompareWeedMap').addEventListener('click', () => {
      show(findings);
      find('#testSummary').focus();
    });
  } else if (compare) {
    const watch = find('#benchWatch');
    const ready = make('figure', 'firstRun');
    const caption = make('figcaption', '');
    caption.textContent = 'Two detectors see the same plantings. Compare the pins each places on fresh fields.';
    ready.append(find('.benchContext img'), caption);
    stage.append(ready, watch.querySelector('.liveScene'));
    find('#run').textContent = 'Compare';
    moveRunActions('benchForm');
    readout.append(find('#status'));
    const scores = make('a', 'instrumentResult');
    scores.href = '#benchResults';
    scores.textContent = 'View results';
    readout.append(scores);
    addPanel('Setup', find('#benchForm'));
    addPanel('Scoreboard', watch);
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
    addPanel('Planting', settings);
    view.open = true;
    addPanel('Camera', view);
    addPanel('Findings', find('.scanSummary'));
  } else {
    const firstRun = find('#firstRun');
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
    addPanel('Setup', setup);
    addPanel('Run notes', find('#status'), find('#estimateText'), find('#reviewLink'), monitor.querySelector('.method'));
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

  show(panels.keys().next().value);
  return target => {
    const panel = target?.closest('.instrumentPanel');
    if (panels.has(panel)) show(panel);
  };
}
