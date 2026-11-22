// The same fields stay in their owning document and form at every window size.
export function createInspector(workbench, name, shell, onSelect) {
  const doc = workbench.ownerDocument;
  const drawer = doc.createElement('dialog');
  drawer.className = 'instrumentInspector';
  drawer.setAttribute('aria-label', name + ' settings');
  drawer.innerHTML = `<header class="inspectorHeader">
    <button type="button" class="inspectorBack" aria-label="All settings sections">‹</button>
    <h2 tabindex="-1"></h2>
    <button type="button" class="inspectorClose" aria-label="Close settings">×</button>
  </header><nav class="instrumentTopics" aria-label="Settings sections"></nav>`;
  const heading = drawer.querySelector('h2');
  const topics = drawer.querySelector('nav');
  const back = drawer.querySelector('.inspectorBack');
  const close = drawer.querySelector('.inspectorClose');
  const panels = new Map();
  let selected;
  let active = false;
  let docked = true;
  let requested = false;

  function display(panel, focus = false) {
    selected = panel;
    for (const item of panels.keys()) item.hidden = item !== panel;
    topics.hidden = Boolean(panel);
    back.hidden = !panel;
    heading.textContent = panel?.getAttribute('aria-label') || name + ' settings';
    if (panel) onSelect?.(panel);
    if (active) shell.changed(api);
    if (focus) heading.focus({preventScroll:true});
  }
  function addPanel(label, description, ...content) {
    const panel = doc.createElement('section');
    panel.id = workbench.dataset.instrument + '-inspector-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    panel.className = 'instrumentPanel';
    panel.setAttribute('aria-label', label);
    panel.tabIndex = 0;
    panel.hidden = true;
    const button = doc.createElement('button');
    button.className = 'topicButton';
    button.type = 'button';
    const title = doc.createElement('span');
    title.textContent = label;
    const detail = doc.createElement('small');
    detail.textContent = description;
    button.append(title, detail);
    button.setAttribute('aria-label', label);
    detail.id = panel.id + '-hint';
    button.setAttribute('aria-describedby', detail.id);
    button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => { requested = true; display(panel,true); });
    panels.set(panel, button);
    topics.append(button);
    panel.append(...content);
    drawer.append(panel);
    return panel;
  }
  function sync() {
    const modal = drawer.matches(':modal');
    workbench.toggleAttribute('data-compact', shell.compact.matches);
    if (!active || modal !== shell.compact.matches) {
      if (drawer.open) drawer.close();
    }
    if (active && !drawer.open) {
      if (!shell.compact.matches && docked) drawer.open = true;
      else if (shell.compact.matches && requested) {
        drawer.showModal();
        shell.remember();
      }
      if (requested && drawer.open) heading.focus({preventScroll:true});
    }
    if (active) shell.changed(api);
  }
  function open(panel = selected, remember = true) {
    if (!active) return;
    requested = true;
    display(panel);
    if (shell.compact.matches) {
      if (!drawer.open) {
        drawer.showModal();
        if (remember) shell.remember();
      }
    } else {
      docked = true;
      drawer.open = true;
    }
    shell.changed(api);
    heading.focus({preventScroll:true});
  }
  function dismiss() {
    if (!drawer.open) return;
    const wasModal = drawer.matches(':modal');
    requested = false;
    if (!wasModal) docked = false;
    drawer.close();
    shell.dismissed(api, wasModal);
  }
  function reveal(target, remember = false) {
    const panel = target?.closest('.instrumentPanel');
    if (!panels.has(panel)) return;
    for (let el = target; el && el !== panel; el = el.parentElement) {
      if (el.tagName === 'DETAILS') el.open = true;
    }
    open(panel, remember);
  }
  back.addEventListener('click', () => {
    const previous = panels.get(selected);
    display(null);
    previous?.focus();
  });
  // The browser's sequential navigation can leave an iframe at its last control,
  // even when that frame owns a modal. Keep both ends inside the open sheet.
  drawer.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !drawer.matches(':modal')) return;
    const stops = [...drawer.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.checkVisibility());
    const first = stops[0], last = stops.at(-1);
    const atStart = event.target === first || (event.target === heading && back.hidden);
    if (event.shiftKey ? atStart : event.target === last) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
  close.addEventListener('click', dismiss);
  drawer.addEventListener('cancel', event => {event.preventDefault(); dismiss();});
  drawer.addEventListener('click', event => {
    if (event.target !== drawer || !drawer.matches(':modal')) return;
    const r = drawer.getBoundingClientRect();
    if (event.clientX > r.right || event.clientX < r.left || event.clientY < r.top || event.clientY > r.bottom) dismiss();
  });
  workbench.addEventListener('invalid', event => reveal(event.target, true), true);
  // Use the frame's lifetime for listeners; a reloaded instrument must release its old DOM.
  const resize = () => sync();
  shell.compact.addEventListener('change', resize);
  doc.defaultView.addEventListener('pagehide', () => shell.compact.removeEventListener('change', resize), {once:true});
  const api = {drawer, addPanel, reveal, open, dismiss,
    activate(value) { active = value; if (!value) requested = false; sync(); },
    get expanded() { return drawer.open; },
    get modal() { return drawer.matches(':modal'); }
  };
  display(null);
  return api;
}
