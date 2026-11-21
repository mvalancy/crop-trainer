// A page-sized dialog also works on iPhone, in embeds and while a native
// fullscreen request is pending. Keep the canvas and the camera it owns.
export function enableViewerFullscreen(host, name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'viewExpandButton';
  host.append(button);
  let dialog, home, scrollPosition, useNative = false;
  let hiddenBackground = [];

  function describe(expanded) {
    host.classList.toggle('viewExpanded', expanded);
    button.textContent = expanded ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'View '+name+' fullscreen');
    button.dataset.help = expanded
      ? 'Return to the page at the same scroll position. Your current view stays in place.'
      : 'Expand the '+name+' to fill your display. Use Exit fullscreen or Escape to return to the page.';
  }
  describe(false);

  function leave() {
    if (!dialog) return;
    const panel = dialog;
    dialog = null;
    useNative = false;
    if (document.fullscreenElement === host) document.exitFullscreen().catch(()=>{});
    if (panel.open && panel.close) panel.close();
    for (const element of hiddenBackground) element.removeAttribute('aria-hidden');
    hiddenBackground = [];
    home.replaceWith(host);
    panel.remove();
    document.documentElement.classList.remove('viewDialogOpen');
    describe(false);
    button.focus({preventScroll:true});
    window.scrollTo({...scrollPosition,behavior:'instant'});
  }

  button.addEventListener('click', () => {
    if (dialog) { leave(); return; }
    scrollPosition = {top:scrollY,left:scrollX};
    home = document.createElement(host.localName);
    home.className = host.className;
    home.style.height = host.getBoundingClientRect().height+'px';
    home.style.visibility = 'hidden';
    home.setAttribute('aria-hidden','true');

    const panel = dialog = document.createElement('dialog');
    panel.className = 'viewFullscreenDialog';
    panel.setAttribute('aria-label', name);
    host.replaceWith(home);
    panel.append(host);
    document.body.append(panel);
    panel.addEventListener('close', () => { if (dialog === panel) leave(); }, {once:true});
    if (panel.showModal) panel.showModal();
    else {
      panel.setAttribute('open','');
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      hiddenBackground = [...document.body.children].filter(el=>el!==panel && !el.hasAttribute('aria-hidden'));
      for (const element of hiddenBackground) element.setAttribute('aria-hidden','true');
    }
    document.documentElement.classList.add('viewDialogOpen');
    describe(true);
    button.focus({preventScroll:true});
    if (document.fullscreenEnabled && host.requestFullscreen) {
      // Unsupported and denied native requests leave the working dialog in place.
      host.requestFullscreen().catch(()=>{});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === host) {
      if (dialog) useNative = true;
      else document.exitFullscreen().catch(()=>{}); // User already closed the dialog.
    } else if (useNative) leave(); // System exit (Esc, swipe or browser controls).
  });
  host.addEventListener('keydown', event => {
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      leave();
    } else if (event.key === 'Tab') {
      const targets = [...host.querySelectorAll('button:enabled,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const end = event.shiftKey ? targets[0] : targets.at(-1);
      if (document.activeElement === end) {
        event.preventDefault();
        (event.shiftKey ? targets.at(-1) : targets[0]).focus();
      }
    }
  });
  return leave;
}
