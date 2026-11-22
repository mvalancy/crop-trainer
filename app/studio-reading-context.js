// Return only the active activity. Hidden instruments can still be running in other frames.
export function studioReading(route, doc, inspector, defaultTitle) {
  const {view,step,url} = route;
  const find = id => doc.getElementById(id);
  const anchor = find(url.hash.slice(1));
  const key = url.pathname + url.search + ':' + view + ':' + step + url.hash;
  if (step === 'explore') {
    const lesson = find('explore-' + view);
    return {key,cue:'explore-'+view,title:lesson.querySelector('h2')?.textContent || 'Field experiment',roots:[lesson]};
  }
  if (view === 'docs') {
    const figure = doc.querySelector('.guideFigureViewer[open]');
    if (figure) return {key:key+figure.querySelector('.figureHeading').textContent,title:'Study figure',
      roots:[figure.querySelector('.figureExplanation')],host:figure.querySelector('.figureVoiceSlot')};
    const chapter = doc.querySelector('.guideChapter');
    return {key,title:chapter.querySelector('h1')?.textContent || defaultTitle,roots:[chapter],
      anchor:anchor?.matches('h1,h2,h3,h4,h5,h6') ? anchor.textContent.trim() : null};
  }
  if (inspector) {
    const drawer = inspector.drawer;
    const selected = drawer.open && drawer.querySelector('.instrumentPanel:not([hidden])');
    const host = inspector.modal ? drawer.querySelector('.inspectorHeader') : null;
    if (selected) return {key:key + selected.id, cue:selected.id, title:selected.getAttribute('aria-label'), roots:[selected],host};
    if (host) return {key:key + ':settings',title:drawer.getAttribute('aria-label'),roots:[drawer.querySelector('.instrumentTopics')],host};
    const bench = drawer.closest('.instrument');
    return {key,cue:doc.documentElement.dataset.step,title:defaultTitle,
      roots:[bench.querySelector('.instrumentStage'),bench.querySelector('.instrumentTransport')]};
  }
  if (step === 'lessons') {
    const lesson = doc.querySelector('#guide [role="tabpanel"]:not([hidden])');
    return {key:key + lesson.id,cue:lesson.id,title:lesson.querySelector('h3').textContent,roots:[lesson]};
  }
  const selectors = {journal:'#missions',study:'#scan-study,.samplingGuide',results:'#runReview,.resultEmpty','compare-results':'#benchResults'};
  return {key,cue:step,title:defaultTitle,roots:[...doc.querySelectorAll(selectors[step] || 'main')]};
}
