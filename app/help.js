// Add data-help to a control, its label, or a short term; data-help-label overrides its name.
const tips = new WeakMap();
let active;
let pinned = false;
let delay;
let nextId = 0;

function subjectText(host, label) {
  if (host.dataset.helpLabel) return host.dataset.helpLabel;
  if (host.hasAttribute('aria-label')) return host.getAttribute('aria-label');
  if (label) {
    const words = Array.from(label.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim()).join(' ').trim();
    if (words) return words;
    const caption = label.querySelector('span');
    if (caption) return caption.textContent.trim();
  }
  const words = Array.from(host.childNodes).filter(node => !node.classList?.contains('helpGroup'));
  return words.map(node => node.textContent).join('').trim() || host.id || 'this setting';
}

function describe(control, id) {
  const ids = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(id);
  control.setAttribute('aria-describedby', [...ids].join(' '));
}

function addHelp(host) {
  const label = host.matches('label') ? host : host.labels?.[0];
  const subject = subjectText(host, label);
  const existing = tips.get(host);
  if (existing) {
    existing.title.textContent = subject;
    existing.body.textContent = host.dataset.help;
    existing.button.setAttribute('aria-label', 'Help with ' + subject);
    return;
  }

  const target = label || host;
  const control = label?.control || host;
  const field = label && !control.matches('input[type="checkbox"],input[type="radio"]');
  const group = document.createElement('span');
  group.className = 'helpGroup' + (field ? ' helpField' : label || host.matches('button,a,input,select') ? ' helpAction' : ' helpTerm');
  const button = document.createElement('button');
  button.className = 'helpTrigger';
  button.type = 'button';
  button.setAttribute('aria-label', 'Help with ' + subject);
  button.setAttribute('aria-expanded', 'false');

  const tip = document.createElement('span');
  tip.id = 'cropHelp-' + (++nextId);
  tip.className = 'helpBubble';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const title = document.createElement('strong');
  title.textContent = subject;
  title.setAttribute('aria-hidden', 'true');
  const body = document.createElement('span');
  body.id = tip.id + '-text';
  body.textContent = host.dataset.help;
  tip.append(title, body);
  button.setAttribute('aria-controls', tip.id);
  describe(button, body.id);
  if (control.matches('input,select,button,textarea,a[href]')) describe(control, body.id);

  if (group.classList.contains('helpTerm')) {
    const heading = target.closest('h1,h2,h3,h4,h5,h6,th');
    if (heading && !heading.hasAttribute('aria-label') && !heading.hasAttribute('aria-labelledby')) {
      heading.setAttribute('aria-label', heading.textContent.trim());
    }
    target.append(group);
  } else {
    target.before(group);
    group.append(target);
    if (field) {
      const caption = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (caption) {
        const text = document.createElement('span');
        text.className = 'helpCaption';
        caption.before(text);
        text.append(caption);
      }
    }
  }
  group.append(button, tip);
  const entry = {group, host, button, tip, title, body};
  tips.set(host, entry);
  button.addEventListener('focus', () => { if (button.matches(':focus-visible')) show(entry); });
  button.addEventListener('click', () => {
    if (active === entry && pinned) close();
    else { show(entry); pinned = true; }
  });
  button.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || pinned) return;
    clearTimeout(delay);
    delay = setTimeout(() => show(entry), 150);
  });
  const leave = event => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(delay);
    if (active === entry && !pinned && !button.matches(':focus-visible')) {
      delay = setTimeout(close, 200);
    }
  };
  button.addEventListener('pointerleave', leave);
  tip.addEventListener('pointerenter', () => clearTimeout(delay));
  tip.addEventListener('pointerleave', leave);
}

function close() {
  clearTimeout(delay);
  if (!active) return;
  const {group, button, tip} = active;
  active = undefined;
  pinned = false;
  button.setAttribute('aria-expanded', 'false');
  tip.hidden = true;
  group.append(tip);
}

function place() {
  if (!active) return;
  const {button, tip} = active;
  const box = button.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const width = viewport?.width || document.documentElement.clientWidth;
  const height = viewport?.height || document.documentElement.clientHeight;
  if (!button.isConnected || !box.width || box.bottom <= top || box.top >= top + height || box.right <= left || box.left >= left + width) {
    close();
    return;
  }
  const edge = 8, gap = 4;
  tip.style.maxWidth = 'min(20rem, ' + Math.max(1, width - edge * 2) + 'px)';
  const above = box.top - top - edge - gap;
  const below = top + height - edge - box.bottom - gap;
  // Prefer below when the explanation fits there, otherwise use the roomier side.
  const goesBelow = tip.scrollHeight + 2 <= below || below >= above;
  tip.style.maxHeight = Math.max(44, goesBelow ? below : above) + 'px';
  const x = Math.max(left + edge, Math.min(box.left, left + width - edge - tip.offsetWidth));
  const y = goesBelow ? box.bottom + gap : box.top - gap - tip.offsetHeight;
  tip.style.left = Math.round(x) + 'px';
  tip.style.top = Math.round(Math.max(top + edge, y)) + 'px';
}

function show(entry) {
  clearTimeout(delay);
  if (active !== entry) {
    close();
    active = entry;
    entry.button.setAttribute('aria-expanded', 'true');
    const layer = entry.button.closest('dialog[open], :fullscreen') || document.body;
    layer.append(entry.tip);
    entry.tip.hidden = false;
  }
  place();
}

function install(root) {
  if (root.matches?.('[data-help]')) addHelp(root);
  root.querySelectorAll?.('[data-help]').forEach(addHelp);
}

install(document);
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes') {
      if (record.attributeName !== 'hidden' && record.target.hasAttribute('data-help')) addHelp(record.target);
      continue;
    }
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('helpGroup')) install(node);
    }
  }
  if (active && !active.button.getClientRects().length) close();
}).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['data-help','data-help-label','hidden']});

function outside(event) {
  if (active && !active.button.contains(event.target) && !active.tip.contains(event.target)) close();
}
document.addEventListener('pointerdown', outside, true);
document.addEventListener('focusin', outside);
window.addEventListener('blur', close);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && active) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}, true);
window.addEventListener('scroll', place, {capture:true, passive:true});
window.addEventListener('resize', place);
window.visualViewport?.addEventListener('resize', place);
window.visualViewport?.addEventListener('scroll', place);
