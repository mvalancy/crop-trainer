// The compact picker activates the same real links as the desktop rail. It
// works while the studio modules load, and the router can keep a live fit open.
(() => {
  const picker=document.getElementById('activityMenu');
  const links=new Map();
  for (const link of document.querySelectorAll('#activities a[data-view]')) {
    const view=link.dataset.view;
    links.set(view,link);
    picker.add(new Option(link.lastChild.textContent.trim(),view));
  }
  const initial=new URL(location.href).searchParams.get('view');
  picker.value=links.has(initial) ? initial : 'learn';
  picker.addEventListener('change',()=>links.get(picker.value)?.click());
})();
