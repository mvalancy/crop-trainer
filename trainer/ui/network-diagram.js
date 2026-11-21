import {featureNames, networkShape} from '../models/network.js?v=field-test1';

function element(tag, attributes, content) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function layerPoints(width, x) {
  const offsets = width > 5 ? [-43, -22, 22, 43]
    : Array.from({length:width}, (_, i) => (i - (width - 1) / 2) * 21.5);
  return offsets.map(y => ({x, y:108 + y}));
}

function connection(a, b) {
  const bend = (b.x - a.x) * .4;
  return 'M'+a.x+' '+a.y+' C'+(a.x+bend)+' '+a.y+', '+(b.x-bend)+' '+b.y+', '+b.x+' '+b.y;
}

function draw(layers, sizes, activation, compact) {
  const width = compact ? 320 : 560, inset = compact ? 29 : 52;
  const columns = sizes.map((size, index) => layerPoints(size, inset + (width - 2*inset) * index / (sizes.length - 1)));
  const wires = element('g', {fill:'none', stroke:'#56816e', 'stroke-width':1, opacity:.7});
  const signals = element('g', {fill:'none', stroke:'#eef8a6', 'stroke-linecap':'round', 'stroke-width':2.8});
  const nodes = document.createDocumentFragment();
  const transitions = [], halos = [];
  for (let i = 1; i < columns.length; i++) {
    const from = columns[i-1], to = columns[i];
    for (const a of from) for (const b of to) {
      wires.append(element('path', {class:'networkWire', d:connection(a,b)}));
    }
    // Animate a few of the visible connections. Their brightness never reads model weights.
    const paths = [];
    for (let j = 0; j < Math.max(from.length, to.length); j++) {
      const d = connection(from[j % from.length], to[(j + i) % to.length]);
      const path = element('path', {class:'networkSignal', d, pathLength:100,
        'stroke-dasharray':'19 101', 'stroke-dashoffset':20, opacity:0});
      signals.append(path);
      paths.push(path);
    }
    transitions.push(paths);
  }

  columns.forEach((points, i) => {
    const input = i === 0, output = i === sizes.length - 1;
    const stage = input ? 'input' : output ? 'output' : 'hidden';
    const title = input ? 'Input' : output ? 'Score' : (compact ? 'H' : 'Hidden ') + i;
    const kind = input ? 'features' : output ? 'sigmoid' : activation === 'relu' ? 'ReLU' : 'tanh';
    const x = points[0].x;
    const column = element('g', {class:'networkColumn', 'data-stage':stage, 'data-width':sizes[i]});
    const explanation = input ? sizes[i]+' standardized measurements describe one candidate peak.'
      : output ? 'One sigmoid output turns the weighted sum into a score between zero and one.'
      : 'Hidden layer '+i+' has '+sizes[i]+' '+(sizes[i] === 1 ? 'unit' : 'units')+'. Each combines '+sizes[i-1]+' inputs with learned weights and a bias, then applies '+kind+'.';
    const halo = element('g', {class:'networkHalo', fill:'#e3fb86', opacity:0});
    // One native hover description per stage. The whole graphic also has a screen-reader description.
    column.append(element('title',{},explanation), halo);
    for (const {y} of points) {
      halo.append(element('circle', {cx:x, cy:y, r:output ? 18 : 11}));
      if (output) column.append(element('circle', {cx:x, cy:y, r:13, fill:'none', stroke:'#b5d994', 'stroke-width':1.7}));
      column.append(element('circle', {class:output ? 'networkNode networkOutput' : 'networkNode',
        cx:x, cy:y, r:output ? 7.5 : input ? 4.6 : 5.8, fill:output ? '#f3ae78' : input ? '#9dd4b4' : '#d2e9a7'}));
    }
    if (sizes[i] > points.length) {
      for (const y of [104,108,112]) column.append(element('circle', {cx:x, cy:y, r:1.05, fill:'#9db59d'}));
    }
    const text = (className, y, value) => element('text', {class:className, x, y, 'text-anchor':'middle'}, value);
    column.append(text('networkStageLabel',30,title), text('networkWidthLabel',186,sizes[i]), text('networkTypeLabel',205,kind));
    nodes.append(column);
    halos.push(halo);
  });
  layers.replaceChildren(wires, signals, nodes);
  return {transitions, halos};
}

// This preview uses the production layer sizes and parameter count. Playback is a
// finite illustration of a forward pass, independent of training and inference.
export function createNetworkDiagram({svg, layers, summary, description, replayButton, replayLabel, stepLabel}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let compact = svg.clientWidth < 430, visible = false;
  let key, sizes, activation, drawing, pending = false, playback = [];
  const defaultHint = stepLabel?.textContent;
  const defaultButtonHelp = replayButton?.dataset.help;
  let reducedStage = 0;
  layers.setAttribute('aria-hidden','true');

  function stop() {
    for (const animation of playback) animation.cancel();
    playback = [];
  }
  function showStep(index) {
    reducedStage = index;
    for (const [i,halo] of drawing.halos.entries()) {
      const current = i === index;
      halo.setAttribute('opacity', current ? '.7' : '0');
      halo.parentElement.toggleAttribute('data-current',current);
      if (current && stepLabel) stepLabel.textContent = halo.parentElement.querySelector('title').textContent;
    }
  }
  function setPlaybackLabels() {
    if (replayLabel) replayLabel.textContent = motion.matches ? 'Next layer' : 'Replay signal';
    if (replayButton && defaultButtonHelp) replayButton.dataset.help = motion.matches
      ? 'Highlight the next stage of the model and read how it contributes to a prediction.' : defaultButtonHelp;
    if (stepLabel) stepLabel.textContent = defaultHint;
  }
  function play() {
    const step = drawing.transitions.length > 2 ? 625 : 820;
    const crossing = step + 50;
    const frames = [];
    const animate = (node, change, delay, duration) => {
      frames.push(node.animate(change,{duration,delay,iterations:1,easing:'linear'}));
    };
    drawing.halos.forEach((halo, i) => {
      animate(halo,[{opacity:0},{opacity:.75,offset:.3},{opacity:0}],100+i*step,520);
    });
    drawing.transitions.forEach((paths, i) => {
      paths.forEach((path, j) => animate(path,[
        {strokeDashoffset:'20',opacity:0}, {strokeDashoffset:'9',opacity:1,offset:.1},
        {strokeDashoffset:'-94',opacity:.95,offset:.92}, {strokeDashoffset:'-105',opacity:0}
      ],220+i*step+j*24,crossing));
    });
    pending = false;
    playback = frames;
    svg.dataset.flow = 'playing';
    // A compact redraw or a replay may replace the animations before they settle.
    Promise.allSettled(frames.map(frame => frame.finished)).then(() => {
      if (playback === frames) { playback = []; svg.dataset.flow = 'idle'; }
    });
  }
  function sync() {
    if (!drawing) return;
    if (motion.matches) {
      if (svg.dataset.flow !== 'reduced') {
        stop(); pending = false; showStep(0); svg.dataset.flow = 'reduced';
      }
    } else if (!visible || document.hidden) {
      for (const animation of playback) animation.pause();
      svg.dataset.flow = playback.length || pending ? 'paused' : 'idle';
    } else if (pending) {
      play();
    } else if (playback.length) {
      for (const animation of playback) if (animation.playState === 'paused') animation.play();
      svg.dataset.flow = 'playing';
    } else {
      svg.dataset.flow = 'idle';
    }
  }
  function redraw(shouldPlay) {
    stop();
    svg.setAttribute('viewBox', compact ? '0 0 320 225' : '0 0 560 225');
    drawing = draw(layers,sizes,activation,compact);
    svg.dataset.flow = 'idle';
    pending = shouldPlay;
    sync();
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting;
    sync();
  });
  observer.observe(svg);
  let resizeFrame;
  new ResizeObserver(() => {
    if (resizeFrame) return;
    // The viewBox also sets the SVG's intrinsic height. Update it after
    // the current resize delivery so WebKit can finish laying out the page.
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const width = svg.clientWidth;
      if (!width || compact === (width < 430)) return;
      compact = width < 430;
      if (drawing) redraw(pending || playback.length > 0);
    });
  }).observe(svg);
  setPlaybackLabels();
  motion.addEventListener('change', () => {
    setPlaybackLabels();
    if (drawing) redraw(true);
  });
  document.addEventListener('visibilitychange', sync);
  replayButton?.addEventListener('click', () => {
    if (!drawing) return;
    if (motion.matches) {
      showStep((reducedStage + 1) % drawing.halos.length);
    } else {
      stop(); pending = true; sync();
    }
  });

  return (settings) => {
    const {hiddenLayers} = settings;
    const valid = hiddenLayers.every(size => Number.isInteger(size) && size >= 1 && size <= 32);
    if (!valid) {
      stop(); drawing = undefined; key = undefined; pending = false;
      layers.replaceChildren();
      summary.textContent = 'Choose 1–32 units for each hidden layer.';
      if (description) description.textContent = summary.textContent;
      if (stepLabel) stepLabel.textContent = '';
      if (replayButton) replayButton.disabled = true;
      svg.dataset.flow = 'invalid';
      return;
    }
    activation = hiddenLayers.length ? settings.activation : 'sigmoid';
    sizes = [featureNames.length,...hiddenLayers,1];
    const next = sizes.join(',')+' '+activation;
    if (key === next) return;
    key = next;
    const shape = networkShape(featureNames.length,hiddenLayers,settings.activation);
    summary.textContent = sizes.join(' → ')+' · '+shape.count.toLocaleString()+' trainable parameters';
    if (description) {
      const hidden = hiddenLayers.length ? 'Hidden layer widths are '+hiddenLayers.join(', ')+', using '+activation+'.' : 'Logistic regression has no hidden layer.';
      description.textContent = featureNames.length+' scan features feed the detector from left to right. '+hidden+' A sigmoid produces one score between zero and one. Wide layers show representative units. The moving signal illustrates the order of computation.';
    }
    if (replayButton) replayButton.disabled = false;
    if (stepLabel) stepLabel.textContent = defaultHint;
    redraw(true);
  };
}
