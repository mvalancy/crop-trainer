// The lesson reads exactly the generated XYZ coordinates used by the viewer.
// As in the trainer, growing systems use base XY and leafy crops use box centers.
const WIDTH = 480, HEIGHT = 288, MATCH_METERS = .15, MAX_DOTS = 4500;
const colors = ['#62786c', '#76957a', '#8dac80', '#a1bf81', '#bdd681', '#d5e38a', '#edef99', '#fff0ac'];
const bound = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fixed = v => Number(v.toFixed(2));
let instance = 0;

function plantCenters(scan) {
  return scan.labels.boxes.map(({min, max, base_xy_m}) =>
    base_xy_m ?? [(min[0] + max[0])/2, (min[1] + max[1])/2]);
}

function lessonPatches(scan, centers) {
  const [w, h] = scan.labels.tile_size_m;
  const width = Math.min(w, h*WIDTH/HEIGHT, bound(3*Math.sqrt(w*h/Math.max(1, centers.length)), 1.6, 6));
  const height = width*HEIGHT/WIDTH;
  const cols = Math.ceil(w/width), rows = Math.ceil(h/height);
  const patches = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col*(w-width)/Math.max(1, cols-1), y = row*(h-height)/Math.max(1, rows-1);
      if (!centers.length || centers.some(([cx,cy]) => cx>=x && cx<=x+width && cy>=y && cy<=y+height)) {
        patches.push({x, y, width, height, slot:row*cols+col});
      }
    }
  }
  // Shuffle spatial windows without moving a labeled center to the middle.
  let seed = parseInt(scan.labels.tile_id.slice(-8), 16) >>> 0;
  for (let i = patches.length-1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(seed/4294967296*(i+1));
    [patches[i], patches[j]] = [patches[j], patches[i]];
  }
  return patches;
}


export function createFieldLesson(root) {
  const helpId = 'field-lesson-help-' + ++instance;
  root.classList.add('field-lesson');
  root.innerHTML = `
    <figure class="fl-figure">
      <figcaption class="fl-head"><strong>Top-down scan</strong><span data-lesson="size" data-help-label="Patch scale" data-help="Width and height of this part of the field, followed by the distance between grid lines."></span></figcaption>
      <button type="button" class="fl-board" data-lesson="board" aria-label="Aim and place a plant pin" aria-describedby="${helpId}" data-help="Tap where a plant looks centered, or aim with the arrow keys and press Enter. Your pin is measured against the nearest labeled plant." disabled>
        <svg viewBox="0 0 480 288" aria-hidden="true" focusable="false">
          <g data-lesson="grid"></g><g data-lesson="points"></g><g data-lesson="marks"></g>
          <g class="fl-aim" data-lesson="aim" fill="none" stroke="#fff" stroke-width="1.7"><circle r="8" stroke-dasharray="3 2"/><path d="M-14 0h5m18 0h5M0 -14v5m0 18v5"/></g>
        </svg>
      </button>
      <p class="fl-status" data-lesson="status" role="status" aria-live="polite" aria-atomic="true" data-help-label="Your pin" data-help="After placing a pin, read its distance to the nearest known center. A distance of 15 cm or less earns a match.">Waiting for a scan.</p>
      <div class="fl-key">
        <span data-help-label="Height colors" data-help="Brighter dots are higher. The brightest color also represents points above the upper value shown here.">Height · Low 0 cm <i class="fl-ramp" aria-hidden="true"></i><span data-lesson="height"></span></span>
        <span><b class="fl-diamond" aria-hidden="true">◇</b> Your pin</span>
        <span><b class="fl-cross" aria-hidden="true">+</b> Label</span>
        <span data-lesson="sample" data-help-label="Points shown" data-help="A dense patch displays a sample of its points. The comparison still uses the known plant positions in the patch." hidden></span>
      </div>
    </figure>
    <div class="fl-tools"><div class="fl-actions">
      <button type="button" data-lesson="reveal" aria-pressed="false" data-help="Show or hide the known plant centers as crosses. Use them to check what you saw in the laser dots." disabled>Show labels</button>
      <button type="button" data-lesson="next" data-help="Move to another patch of the same generated scan and try finding a center there." disabled>New patch</button>
      <button type="button" data-lesson="clear" data-help="Remove your guess from this patch so you can aim again." hidden>Clear pin</button>
    </div>
    <details class="fl-list" data-lesson="locations" hidden><summary data-help="Read the horizontal positions of the known plant centers as numbers measured from this patch’s lower-left corner.">Read label positions</summary>
      <p>Distances from the lower-left corner of this patch.</p><ol></ol></details>
    <details class="fl-help"><summary data-help="Read how to aim by small or large steps and place a pin with the keyboard.">Keyboard controls</summary>
      <p id="${helpId}">Focus the scan and use the arrows to explore in 5 cm steps. Hold Shift for 25 cm steps. Press Enter or Space to place a pin.</p></details></div>`;
  const el = name => root.querySelector('[data-lesson="'+name+'"]');
  const board = el('board'), svg = board.querySelector('svg'), status = el('status');
  const reveal = el('reveal'), next = el('next'), clear = el('clear');
  let scan, centers, patches, index = 0, patch, inside = [], indices = [], cursor, guess, showLabels;
  root.dataset.phase = 'loading';

  function project([x, y]) {
    return [fixed((x-patch.x)*WIDTH/patch.width), fixed(HEIGHT-(y-patch.y)*HEIGHT/patch.height)];
  }
  function drawPoints() {
    const xyz = scan.xyz;
    indices = [];
    for (let i = 0; i < xyz.length; i += 3) {
      if (xyz[i]>=patch.x && xyz[i]<=patch.x+patch.width && xyz[i+1]>=patch.y && xyz[i+1]<=patch.y+patch.height) indices.push(i);
    }
    const count = Math.min(indices.length, MAX_DOTS);
    const samples = Array.from({length:count}, (_,n) => indices[Math.floor((n+.5)*indices.length/count)]);
    const heights = samples.map(i => xyz[i+2]).sort((a,b) => a-b);
    const peakCm = Math.max(1, Math.ceil(100*(heights[Math.floor(.98*count)] ?? 0)));
    const strokes = colors.map(() => []);
    for (const i of samples) {
      const [x,y] = project([xyz[i],xyz[i+1]]);
      const bin = bound(Math.floor(xyz[i+2]*100/peakCm*colors.length), 0, colors.length-1);
      strokes[bin].push('M'+x+' '+y+'h.01');
    }
    el('points').innerHTML = strokes.map((path,i) =>
      '<path d="'+path.join('')+'" fill="none" stroke="'+colors[i]+'" stroke-width="2.55" stroke-linecap="round"/>').join('');
    const step = patch.width>=4 ? 1 : .5;
    let grid = '';
    for (let x = Math.ceil(patch.x/step)*step; x < patch.x+patch.width; x+=step) grid += 'M'+project([x,patch.y])[0]+' 0v'+HEIGHT;
    for (let y = Math.ceil(patch.y/step)*step; y < patch.y+patch.height; y+=step) grid += 'M0 '+project([patch.x,y])[1]+'h'+WIDTH;
    el('grid').innerHTML = '<path d="'+grid+'" fill="none" stroke="#335044" stroke-width=".8"/>';
    el('size').textContent = fixed(patch.width)+' × '+fixed(patch.height)+' m · '+(step*100)+' cm grid';
    el('height').textContent = count ? 'High '+peakCm+'+ cm' : 'No returns';
    const sample = el('sample');
    sample.hidden = count === indices.length;
    sample.textContent = sample.hidden ? '' : 'Showing '+count.toLocaleString()+' of '+indices.length.toLocaleString()+' returns';
  }
  function drawMarkers() {
    const cross = (x,y) => '<path d="M'+(x-5)+' '+y+'h10M'+x+' '+(y-5)+'v10" stroke="#9ff4ed" stroke-width="2.5"/>';
    const marks = [];
    if (showLabels) for (const center of inside) marks.push(cross(...project(center)));
    if (guess) {
      const [x,y] = project(guess.position), [cx,cy] = project(guess.nearest);
      marks.push('<line class="fl-measure" pathLength="1" x1="'+x+'" y1="'+y+'" x2="'+cx+'" y2="'+cy+'" stroke="#fff" stroke-width="1.7"/>',
        '<circle cx="'+cx+'" cy="'+cy+'" r="'+MATCH_METERS*WIDTH/patch.width+'" fill="none" stroke="#9ff4ed" stroke-width="1.4" stroke-dasharray="4 3"/>',
        cross(cx,cy), '<path d="M'+x+' '+(y-6)+'l6 6-6 6-6-6Z" fill="#593f14" stroke="#ffcb68" stroke-width="2.4"/>');
    }
    el('marks').innerHTML = marks.join('');
    el('aim').setAttribute('transform','translate('+project(cursor).join(' ')+')');
    reveal.setAttribute('aria-pressed', String(showLabels));
    reveal.textContent = showLabels ? 'Hide labels' : 'Show labels';
    const locations = el('locations');
    locations.hidden = !showLabels;
    if (!showLabels) locations.open = false;
    locations.querySelector('ol').innerHTML = showLabels ? inside.map(([x,y]) =>
      '<li>'+Math.round((x-patch.x)*100)+' cm right, '+Math.round((y-patch.y)*100)+' cm up</li>').join('') : '';
    clear.hidden = !guess;
    root.dataset.phase = guess ? 'scored' : showLabels ? 'revealed' : 'blind';
    if (guess) {
      root.dataset.distanceCm = String(guess.distance*100);
      root.dataset.match = guess.matched ? 'hit' : 'miss';
    } else {
      delete root.dataset.distanceCm; delete root.dataset.match;
    }
  }
  function openPatch() {
    patch = patches[index];
    inside = centers.filter(([x,y]) => x>=patch.x && x<=patch.x+patch.width && y>=patch.y && y<=patch.y+patch.height);
    cursor = [patch.x+patch.width/2,patch.y+patch.height/2];
    guess = null; showLabels = false;
    board.disabled = !centers.length; reveal.disabled = !centers.length; next.disabled = patches.length < 2;
    root.dataset.patch = scan.labels.tile_id+'/'+patch.slot;
    drawPoints(); drawMarkers();
    if (!centers.length) status.textContent = 'This scan has no labeled plants.';
    else if (!indices.length) status.textContent = 'No laser returns landed in this patch. Show the labels to see where plants were generated.';
    else status.textContent = 'Place a pin where you think a plant is centered.';
  }
  function place() {
    let nearest = centers[0], distance = Infinity;
    for (const center of centers) {
      const d = Math.hypot(cursor[0]-center[0],cursor[1]-center[1]);
      if (d < distance) { nearest = center; distance = d; }
    }
    const matched = distance**2 <= MATCH_METERS**2 + 1e-12;
    guess = {position:[...cursor], nearest, distance, matched};
    drawMarkers();
    status.textContent = (matched ? 'Match. ' : 'Outside the 15 cm tolerance. ') +
      'Your pin is '+(distance*100).toFixed(1)+' cm from the nearest plant label. '+
      (inside.includes(nearest) ? 'The dashed circle marks 15 cm.' : 'That center lies outside this patch.');
  }
  board.addEventListener('click', event => {
    if (event.detail !== 0) {
      const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      cursor = [patch.x+bound(point.x/WIDTH,0,1)*patch.width, patch.y+(1-bound(point.y/HEIGHT,0,1))*patch.height];
    }
    place();
  });
  const arrows = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowDown:[0,-1],ArrowUp:[0,1]};
  board.addEventListener('keydown', event => {
    if (!Object.hasOwn(arrows,event.key)) return;
    event.preventDefault();
    const [dx,dy] = arrows[event.key], step = event.shiftKey ? .25 : .05;
    cursor = [bound(cursor[0]+dx*step,patch.x,patch.x+patch.width),bound(cursor[1]+dy*step,patch.y,patch.y+patch.height)];
    let returns = 0, highest = -Infinity;
    for (const i of indices) {
      if ((scan.xyz[i]-cursor[0])**2 + (scan.xyz[i+1]-cursor[1])**2 <= MATCH_METERS**2) {
        returns++; highest = Math.max(highest,scan.xyz[i+2]);
      }
    }
    if (guess) {
      guess = null;
      drawMarkers();
    } else el('aim').setAttribute('transform','translate('+project(cursor).join(' ')+')');
    status.textContent = 'Aim '+Math.round(100*(cursor[0]-patch.x))+' cm right and '+Math.round(100*(cursor[1]-patch.y))+
      ' cm up from the lower-left corner. '+(returns ? returns+' returns within 15 cm. Highest '+Math.round(100*highest)+' cm.' : 'No returns within 15 cm.');
  });
  reveal.addEventListener('click', () => {
    showLabels = !showLabels;
    guess = null;
    drawMarkers();
    status.textContent = showLabels
      ? inside.length+' labeled '+(inside.length===1?'center':'centers')+' in this patch. Crosses mark their locations.'
      : 'Labels hidden. Place a pin to try again.';
  });
  clear.addEventListener('click', () => {
    guess = null; showLabels = false; drawMarkers(); board.focus();
    status.textContent = 'Pin cleared. Place another pin.';
  });
  next.addEventListener('click', () => { index = (index+1)%patches.length; openPatch(); });

  return {setScan(value) {
    scan = value;
    centers = plantCenters(scan); patches = lessonPatches(scan,centers); index = 0;
    openPatch();
  }};
}
