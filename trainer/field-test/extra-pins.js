const byId = id => document.getElementById(id);

function nearestCenter(pin, references) {
  let nearest = null;
  references.forEach((center, index) => {
    const meters = Math.hypot(pin.localX-center.localX, pin.localY-center.localY);
    if (!nearest || meters < nearest.meters) nearest = {center, index, meters};
  });
  return nearest;
}

export function plotCoordinates(canvas) {
  const inset = 26, side = canvas.width-2*inset;
  return {px:x => inset+x*side/10, py:y => inset+(10-y)*side/10};
}

export function drawExtraPins(ctx, px, py, pins, references, view) {
  ctx.fillStyle = '#88808e';
  for (const center of references) {
    ctx.beginPath(); ctx.arc(px(center.localX),py(center.localY),1.8,0,2*Math.PI); ctx.fill();
  }
  ctx.fillStyle = '#a1381e';
  for (const id of view.ids) {
    const pin = pins[id];
    ctx.fillRect(px(pin.localX)-3,py(pin.localY)-3,6,6);
  }
  if (view.id === undefined) return;
  const pin = pins[view.id], x = px(pin.localX), y = py(pin.localY);
  ctx.save();
  if (view.nearest) {
    const center = view.nearest.center, cx = px(center.localX), cy = py(center.localY);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(cx,cy);
    ctx.strokeStyle = '#644883'; ctx.lineWidth = 2; ctx.setLineDash([4,3]); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cx,cy,5.5,0,2*Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(x-7,y-7,14,14);
  ctx.strokeStyle = '#14291e'; ctx.lineWidth = 2.5; ctx.strokeRect(x-7,y-7,14,14);
  ctx.restore();
}

export function initExtraPins(redraw) {
  const toggle = byId('testExtraOnly'), panel = byId('testExtraInspector');
  const ordinal = byId('testExtraIndex'), canvas = byId('testMap');
  let previousPins, previousAssignment, ids = [], selectedId;

  function selectAt(position) {
    selectedId = ids[position];
    redraw();
  }
  function reset() {
    toggle.checked = false;
    previousPins = previousAssignment = selectedId = undefined;
    ids = [];
    canvas.classList.remove('pickExtraPin');
    panel.hidden = true;
  }
  function render(pins, assignment, references, distance) {
    byId('testExtraControl').hidden = !assignment;
    if (!assignment) toggle.checked = false;
    const active = toggle.checked;
    panel.hidden = !active;
    canvas.classList.toggle('pickExtraPin',active);
    if (!active) return null;
    if (previousPins !== pins || previousAssignment !== assignment) {
      const matched = new Set(assignment);
      ids = [];
      for (let i=0; i<pins.length; i++) if (!matched.has(i)) ids.push(i);
      if (previousPins !== pins || !ids.includes(selectedId)) selectedId = ids[0];
      previousPins = pins; previousAssignment = assignment;
    }
    const pin = pins[selectedId], nearest = pin ? nearestCenter(pin,references) : null;
    byId('testExtraTitle').textContent = pin ? 'Why is this pin extra?' : 'No extra pins';
    byId('testSelectedExtraKey').hidden = !pin;
    byId('testNearestKey').hidden = !nearest;
    byId('testSurveyKey').hidden = !references.length;
    byId('testExtraNavigation').hidden = !pin;
    byId('testExtraCount').textContent = 'of '+ids.length;
    ordinal.max = String(ids.length);
    ordinal.value = pin ? String(ids.indexOf(selectedId)+1) : '';
    byId('testExtraPrev').disabled = byId('testExtraNext').disabled = ids.length<2;
    const detail = byId('testExtraDetail'), reason = byId('testExtraReason');
    if (pin) {
      const facts = ['Pin '+(selectedId+1)+' · plot X '+pin.localX.toFixed(2)+' m, Y '+pin.localY.toFixed(2)+' m.'];
      if (Number.isFinite(pin.score)) facts.push('Model score '+pin.score.toFixed(3)+'.');
      if (Number.isFinite(pin.support)) facts.push('Height-band support '+pin.support.toFixed(3)+'.');
      facts.push(nearest ? 'Nearest surveyed center is '+(nearest.meters*100).toFixed(1)+' cm away.' : 'The survey lists no centers.');
      detail.replaceChildren(...facts.map((fact,index) => {
        const line = document.createElement('span');
        line.textContent = (index ? ' ' : '')+fact;
        return line;
      }));
      reason.textContent = !nearest ? 'Every prediction counts as extra against an empty survey.' :
        nearest.meters <= distance/100 ? 'Another pin matched this nearby center. Each center can count once.' :
        (nearest.meters*100).toFixed(1) === distance.toFixed(1) ? 'The nearest center lies at the displayed match boundary. This pin was left unpaired.' :
        'This pin falls outside the '+distance+' cm match distance for every surveyed center.';
    } else {
      detail.textContent = pins.length ? 'Every prediction matched a surveyed center at '+distance+' cm.' : 'This detector placed no pins on this scan.';
      reason.textContent = '';
    }
    return {ids, id:selectedId, nearest};
  }
  toggle.addEventListener('change',redraw);
  function selectOrdinal() {
    if (ordinal.validity.valid && ordinal.value!=='' && Number.isInteger(ordinal.valueAsNumber)) selectAt(ordinal.valueAsNumber-1);
    else redraw();
  }
  ordinal.addEventListener('change',selectOrdinal);
  ordinal.addEventListener('keydown',event => {
    if (event.key === 'Enter') {event.preventDefault(); selectOrdinal();}
  });
  for (const [button,direction] of [['testExtraPrev',-1],['testExtraNext',1]]) {
    byId(button).addEventListener('click',() => {
      if (ids.length) selectAt((ids.indexOf(selectedId)+direction+ids.length)%ids.length);
    });
  }
  canvas.addEventListener('click',event => {
    if (!toggle.checked || !ids.length) return;
    const rect = canvas.getBoundingClientRect(), {px,py} = plotCoordinates(canvas);
    const clickX = event.clientX-rect.left, clickY = event.clientY-rect.top;
    let hit, radius = 20; // CSS pixels, independent of the canvas display size.
    ids.forEach((id, position) => {
      const pin = previousPins[id];
      const delta = Math.hypot(px(pin.localX)*rect.width/canvas.width-clickX,py(pin.localY)*rect.height/canvas.height-clickY);
      if (delta < radius) {hit = position; radius = delta;}
    });
    if (hit !== undefined) selectAt(hit);
  });
  return {render,reset};
}
