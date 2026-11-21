// data-help explains an element directly. data-help-label gives a changing value a stable name.
const bindings = new WeakMap();
const fieldButtons = new WeakMap();
const disabledButtons = new WeakMap();
const descriptions = new Map();
const tabStops = new WeakMap();
const actionSelector = 'a,button,input,select,textarea,summary,label,[role="button"],[role="tab"],[data-help-action]';
const bank = document.createElement('div');
bank.hidden = true;
const popup = document.createElement('div');
popup.id = 'crop-context-help';
popup.className = 'helpBubble';
popup.setAttribute('role', 'tooltip');
popup.hidden = true;
const title = document.createElement('strong');
const message = document.createElement('span');
popup.append(title, message);
document.body.append(bank, popup);

let nextId = 0;
let active;
let pinned = false;
let hoverTimer;
let hold;
let heldTarget;
let pointerType;
let activated;

function nameOf(source) {
  if (source.dataset.helpLabel) return source.dataset.helpLabel;
  if (source.getAttribute('aria-label')) return source.getAttribute('aria-label');
  const label = source.matches('label') ? source : source.labels?.[0];
  if (label) {
    const caption = label.querySelector('.helpCaption');
    if (caption) return caption.textContent.trim();
    const words = Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    const text = words.map(node => node.textContent.trim()).join(' ').trim();
    if (text) return text;
    if (label.querySelector('span')) return label.querySelector('span').textContent.trim();
  }
  if (source.matches('dd') && source.previousElementSibling?.matches('dt')) {
    return source.previousElementSibling.textContent.trim();
  }
  return source.textContent.trim() || source.id || 'Help';
}

// Keep descriptions available to assistive technology before a tooltip opens. Values in a column
// share one description; replaced result rows release their references to it.
function unbind(target) {
  const old = bindings.get(target);
  if (!old) return;
  const ids = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== old.description.id);
  if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
  else target.removeAttribute('aria-describedby');
  if (--old.description.users === 0) {
    old.description.node.remove();
    descriptions.delete(old.text);
  }
  bindings.delete(target);
}

function bind(target, source) {
  const text = source.dataset.help?.trim();
  const old = bindings.get(target);
  if (old?.source === source && old.text === text) return;
  unbind(target);
  if (!text) return;
  let description = descriptions.get(text);
  if (!description) {
    const node = document.createElement('span');
    node.id = 'crop-help-text-' + ++nextId;
    node.textContent = text;
    bank.append(node);
    description = {node, id:node.id, users:0};
    descriptions.set(text, description);
  }
  description.users++;
  const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(description.id);
  target.setAttribute('aria-describedby', [...ids].join(' '));
  bindings.set(target, {source, text, description});
}

function disclosure(name, className) {
  const proxy = className === 'helpDisabledProxy';
  const button = document.createElement(proxy ? 'span' : 'button');
  if (proxy) { button.tabIndex = 0; button.setAttribute('role', 'button'); }
  else button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', 'Help with ' + name);
  button.setAttribute('aria-controls', popup.id);
  button.setAttribute('aria-expanded', 'false');
  return button;
}

function field(label, source) {
  const control = label.control;
  let button = fieldButtons.get(label);
  if (!button) {
    const check = control?.matches('[type=checkbox],[type=radio]');
    const group = document.createElement('span');
    group.className = 'helpGroup ' + (check ? 'helpAction' : 'helpField');
    label.before(group);
    group.append(label);
    if (!check) {
      const first = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (first) {
        const caption = document.createElement('span');
        caption.className = 'helpCaption';
        first.before(caption);
        caption.append(first);
      }
    }
    button = disclosure(nameOf(source), 'helpTrigger');
    group.append(button);
    fieldButtons.set(label, button);
  }
  button.setAttribute('aria-label', 'Help with ' + nameOf(source));
  bind(label, source);
  if (control) bind(control, source);
  bind(button, source);
}

// Native disabled controls cannot take focus. A sibling in the tab order explains them
// and draws the focus outline on the original control without changing its disabled behavior.
function syncDisabled(target) {
  const binding = bindings.get(target);
  let proxy = disabledButtons.get(target);
  if (binding && target.matches('button:disabled') && !target.hidden) {
    if (!proxy) {
      proxy = disclosure(nameOf(binding.source), 'helpDisabledProxy');
      target.after(proxy);
      disabledButtons.set(target, proxy);
    }
    proxy.setAttribute('aria-label', 'Help with ' + nameOf(binding.source));
    bind(proxy, binding.source);
  } else if (proxy) {
    proxy.remove();
    unbind(proxy);
    disabledButtons.delete(target);
  }
}

function annotate(source) {
  const label = source.matches('label') ? source : source.matches('input,select,textarea') && source.labels?.[0];
  if (label) {
    field(label, source);
    return;
  }
  bind(source, source);
  const pairedTerm = source.matches('dd') ? source.previousElementSibling : null;
  const pairedValue = source.matches('dt') ? source.nextElementSibling : null;
  if (pairedTerm?.matches('dt:not([data-help])')) bind(pairedTerm, source);
  if (pairedValue?.matches('dd:not([data-help])')) bind(pairedValue, source);
  if (source.matches('button')) syncDisabled(source);
  if (!source.matches(actionSelector) && !source.closest('th,td') &&
      !source.querySelector(actionSelector) && !source.hasAttribute('tabindex')) {
    source.tabIndex = 0;
  }
}

function headerHelp(cell) {
  return cell.hasAttribute('data-help') ? cell : cell.querySelector('[data-help]');
}

function tableHelp(table) {
  const rows = table.tHead ? [...table.tHead.rows] : [table.rows[0]].filter(row => row?.querySelector('th'));
  const columns = [];
  const filled = [];
  rows.forEach((row, index) => {
    let column = 0;
    for (const cell of row.cells) {
      while (filled[column] > index) column++;
      const source = headerHelp(cell);
      for (let i = 0; i < cell.colSpan; i++) {
        if (source) columns[column + i] = source;
        filled[column + i] = index + cell.rowSpan;
      }
      column += cell.colSpan;
    }
  });
  const focusable = [];
  for (const row of table.rows) {
    const rowHeader = !rows.includes(row) && (row.querySelector('th[scope=row]') || row.cells[0]?.closest('th'));
    const rowLabel = rowHeader && headerHelp(rowHeader);
    let column = 0;
    for (const cell of row.cells) {
      const explicit = cell.hasAttribute('data-help') ? cell : null;
      const header = rows.includes(row);
      const source = explicit || (header ? headerHelp(cell) : (cell.colSpan === 1 && columns[column]) || rowLabel);
      column += cell.colSpan;
      if (!source) {
        if (bindings.has(cell)) {
          unbind(cell);
          cell.removeAttribute('tabindex');
          cell.querySelectorAll('a:not([data-help]),button:not([data-help])').forEach(unbind);
        }
        continue;
      }
      bind(cell, source);
      for (const link of cell.querySelectorAll('a,button')) {
        if (!link.hasAttribute('data-help') && !link.matches('.helpTrigger,.helpDisabledProxy')) {
          bind(link, source);
          if (link.matches('button:disabled')) syncDisabled(link);
        }
      }
      focusable.push(cell);
    }
  }
  if (!focusable.length) return;
  const stop = tabStops.get(table);
  const first = focusable.includes(stop) ? stop : focusable[0];
  for (const cell of focusable) cell.tabIndex = cell === first ? 0 : -1;
  tabStops.set(table, first);
}

function install(root) {
  if (root.matches?.('[data-help]')) annotate(root);
  root.querySelectorAll?.('[data-help]').forEach(annotate);
}

function subject(node) {
  for (let el = node instanceof Element ? node : null; el; el = el.parentElement) {
    if (bindings.has(el)) return el;
  }
}

function actualBox(target) {
  return target.matches('.helpDisabledProxy') ? target.previousElementSibling : target;
}

function anchorBounds(target, anchor) {
  const box = anchor?.getBoundingClientRect();
  const label = target.matches('.helpTrigger') ? target.previousElementSibling :
    target.matches('label') ? target : target.labels?.[0];
  if (!box?.width || !label || !fieldButtons.has(label)) return box;
  // Keep the complete field available to edit, including controls linked with label[for].
  const parts = [box, label.getBoundingClientRect(), label.control?.getBoundingClientRect()]
    .filter(rect => rect?.width && rect.height);
  return {field:true, left:box.left, right:box.right, width:box.width,
    top:Math.min(...parts.map(rect => rect.top)), bottom:Math.max(...parts.map(rect => rect.bottom))};
}

function close() {
  clearTimeout(hoverTimer);
  if (!active) return;
  if (active.matches('.helpTrigger,.helpDisabledProxy')) active.setAttribute('aria-expanded', 'false');
  active = undefined;
  pinned = false;
  popup.hidden = true;
  if (popup.parentElement !== document.body) document.body.append(popup);
  visibility.disconnect();
}

function place() {
  if (!active) return;
  const anchor = actualBox(active);
  const box = anchorBounds(active, anchor);
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const width = viewport?.width || document.documentElement.clientWidth;
  let height = viewport?.height || document.documentElement.clientHeight;
  // A field tooltip may extend across the scene, but leave the fixed run action reachable.
  const workbench = anchor.closest('.instrumentPanel')?.closest('.instrument');
  if (workbench) {
    const bar = workbench.querySelector('.instrumentTransport').getBoundingClientRect();
    if (box && box.left < bar.right && box.right > bar.left) height = Math.min(height, bar.top - top);
  }
  if (!box?.width || !anchor.isConnected || box.bottom <= top || box.top >= top + height || box.right <= left || box.left >= left + width) {
    close();
    return;
  }
  const edge = 8, gap = 4;
  popup.style.maxWidth = 'min(20rem, ' + Math.max(1, width - edge * 2) + 'px)';
  const above = box.top - top - edge - gap;
  const below = top + height - edge - box.bottom - gap;
  if (box.field && Math.max(above, below) < 44) { close(); return; }
  const goesBelow = popup.scrollHeight + 2 <= below || below >= above;
  popup.style.maxHeight = Math.max(44, goesBelow ? below : above) + 'px';
  const x = Math.max(left + edge, Math.min(box.left, left + width - edge - popup.offsetWidth));
  const y = goesBelow ? box.bottom + gap : box.top - gap - popup.offsetHeight;
  popup.style.left = Math.round(x) + 'px';
  popup.style.top = Math.round(Math.max(top + edge, y)) + 'px';
}

const visibility = new IntersectionObserver(records => {
  if (active && records.some(r => r.target === actualBox(active) && !r.isIntersecting)) close();
});

function show(target, pin = false) {
  const binding = bindings.get(target);
  const anchor = actualBox(target);
  if (!binding || !anchor?.isConnected) return;
  if (active !== target) close();
  clearTimeout(hoverTimer);
  active = target;
  pinned = pin;
  if (target.matches('.helpTrigger,.helpDisabledProxy')) target.setAttribute('aria-expanded', 'true');
  title.textContent = nameOf(binding.source);
  message.textContent = binding.text;
  const layer = anchor.closest('dialog[open], :fullscreen') || document.body;
  if (popup.parentElement !== layer) layer.append(popup);
  popup.hidden = false;
  place();
  if (active) visibility.observe(anchor);
}

function mouseEnter(event) {
  if (event.pointerType !== 'mouse' || pinned) return;
  if (popup.contains(event.target)) { clearTimeout(hoverTimer); return; }
  const target = subject(event.target);
  if (target === activated) return;
  if (target && target !== subject(event.relatedTarget)) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(target), 150);
  }
}
document.addEventListener('pointerover', mouseEnter, true);
document.addEventListener('pointerout', event => {
  if (activated && subject(event.target) === activated && subject(event.relatedTarget) !== activated) activated = undefined;
  if (event.pointerType !== 'mouse' || pinned || popup.contains(event.relatedTarget)) return;
  if (subject(event.target) === subject(event.relatedTarget) && !popup.contains(event.target)) return;
  clearTimeout(hoverTimer);
  if (active && !active.matches(':focus-visible')) hoverTimer = setTimeout(close, 200);
}, true);

function cancelHold() {
  if (hold) clearTimeout(hold.timer);
  hold = undefined;
}
document.addEventListener('pointerdown', event => {
  pointerType = event.pointerType;
  cancelHold();
  heldTarget = undefined;
  const target = subject(event.target);
  if (popup.contains(event.target)) return;
  if (active && target !== active) close();
  if (!target || event.pointerType === 'mouse' || event.button !== 0) return;
  const action = event.target.closest(actionSelector);
  if (!action || action.matches('.helpTrigger,.helpDisabledProxy')) return;
  hold = {x:event.clientX, y:event.clientY, id:event.pointerId, target,
    timer:setTimeout(() => { heldTarget = action; show(target, true); }, 550)};
}, true);
document.addEventListener('pointermove', e => {
  if (hold && (e.pointerId !== hold.id || Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10)) cancelHold();
}, {capture:true, passive:true});
document.addEventListener('pointerup', cancelHold, true);
document.addEventListener('pointercancel', cancelHold, true);
document.addEventListener('contextmenu', e => {
  if ((hold || heldTarget) && pointerType !== 'mouse' && subject(e.target)) e.preventDefault();
});
document.addEventListener('click', event => {
  if (heldTarget && (heldTarget === event.target || heldTarget.contains(event.target))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    heldTarget = undefined;
    return;
  }
  const target = subject(event.target);
  if (!target || popup.contains(event.target)) return;
  const disclosure = target.matches('.helpTrigger,.helpDisabledProxy');
  if (disclosure || !event.target.closest(actionSelector)) {
    if (active === target && pinned) close(); else show(target, true);
  } else {
    // An explanation must give the requested animation, download or navigation its turn.
    activated = target;
    close();
  }
}, true);
document.addEventListener('focusin', event => {
  const target = subject(event.target);
  if (target) {
    if (target.matches('th,td')) {
      const table = target.closest('table');
      const previous = tabStops.get(table);
      if (previous && previous !== target) previous.tabIndex = -1;
      target.tabIndex = 0;
      tabStops.set(table, target);
    }
    if (target !== activated && (pointerType !== 'touch' || target.matches('.helpTrigger,.helpDisabledProxy'))) show(target);
  } else if (!popup.contains(event.target)) close();
});
document.addEventListener('keydown', event => {
  pointerType = undefined;
  heldTarget = undefined;
  if (event.key === 'Tab') activated = undefined;
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.helpDisabledProxy')) {
    event.preventDefault();
    event.target.click();
    return;
  }
  if (event.key === 'Escape' && active) {
    event.preventDefault(); event.stopPropagation(); close(); return;
  }
  // Give a dense table one sequential tab stop; arrows inspect the adjacent values.
  const cell = event.target;
  if (!cell.matches?.('th,td') || !bindings.has(cell)) return;
  const row = cell.parentElement, table = cell.closest('table');
  let next;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const cells = [...row.cells].filter(c => bindings.has(c));
    next = cells[cells.indexOf(cell) + (event.key === 'ArrowRight' ? 1 : -1)];
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const step = event.key === 'ArrowDown' ? 1 : -1;
    for (let i = row.rowIndex + step; table.rows[i]; i += step) {
      next = table.rows[i].cells[cell.cellIndex];
      if (next && bindings.has(next)) break;
      next = undefined;
    }
  }
  if (next) {
    event.preventDefault();
    next.focus();
  }
}, true);
window.addEventListener('blur', () => { cancelHold(); close(); });
window.addEventListener('scroll', place, {capture:true, passive:true});
window.addEventListener('resize', place);
window.visualViewport?.addEventListener('resize', place);
window.visualViewport?.addEventListener('scroll', place);

install(document);
document.querySelectorAll('table').forEach(tableHelp);
new MutationObserver(records => {
  const tables = new Set();
  for (const record of records) {
    if (bank.contains(record.target) || popup.contains(record.target)) continue;
    if (record.type === 'attributes') {
      if (record.attributeName === 'hidden' || record.attributeName === 'disabled') {
        syncDisabled(record.target);
        if (record.target.matches('fieldset')) record.target.querySelectorAll('button[data-help]').forEach(syncDisabled);
      }
      else if (record.target.hasAttribute('data-help')) {
        annotate(record.target);
        tables.add(record.target.closest('table'));
        if (active && bindings.get(active)?.source === record.target) show(active, pinned);
      }
      continue;
    }
    for (const node of record.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) continue;
      if (bindings.has(node)) unbind(node);
      node.querySelectorAll('[aria-describedby]').forEach(unbind);
      disabledButtons.get(node)?.remove();
    }
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE || !node.isConnected || node.matches('.helpGroup,.helpDisabledProxy')) continue;
      install(node);
      if (node.matches('table')) tables.add(node);
      node.querySelectorAll('table').forEach(t => tables.add(t));
      if (node.closest('table')) tables.add(node.closest('table'));
    }
  }
  for (const table of tables) if (table) tableHelp(table);
  if (active && !actualBox(active)?.getClientRects().length) close();
}).observe(document.body, {subtree:true, childList:true, attributes:true,
  attributeFilter:['data-help','data-help-label','hidden','disabled']});
