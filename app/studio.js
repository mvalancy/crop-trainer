import {installInstrument} from './studio-instrument.js';
import {createStudioNarration} from './studio-narration.js';
import {studioReading} from './studio-reading-context.js';
import {initFieldFilm} from './field-film.js?v=film-school2';
// Keep each instrument's DOM, files, canvas and running worker alive while readers switch activities.
const root = new URL('../', import.meta.url);
const tasks = {
  learn:{label:'Learn',title:'Field lessons', tool:'field', path:'', steps:{film:['Field film','fieldFilm'],lessons:['Practice','guide'],journal:['Journal','missions']}},
  scan:{label:'Scan',title:'Field generator', tool:'field', path:'', steps:{generate:['Generate','field'],recipe:['Plant & scanner','advanced-scan'],study:['Compare scans','scan-study']}},
  train:{label:'Train',title:'Training shed', tool:'trainer', path:'trainer/', steps:{fit:['Fit & monitor','controls'],model:['Model','detector'],settings:['Settings','settingsTitle'],results:['Results','resultsTitle']}},
  compare:{label:'Compare',title:'Detector benchmark', tool:'benchmark', path:'benchmark/', steps:{experiment:['Experiment','benchForm'],presets:['Presets','benchExamples'],'compare-results':['Results','benchResults']}},
  test:{label:'Field test',title:'Field test', tool:'trainer', path:'trainer/', steps:{test:['Test a plot','field-test']}},
  docs:{label:'Docs',title:'Illustrated field guide', tool:'docs', path:'guide/', steps:{docs:['Chapters','']}}
};
// The illustrated experiment is a shareable section of its instrument.
for (const view of ['learn','scan','train','compare','test']) {
  const entries = Object.entries(tasks[view].steps);
  entries.splice(view==='learn'?2:1,0,['explore',['Explore','explore-'+view]]);
  tasks[view].steps = Object.fromEntries(entries);
}
const paths = {
  learn:'M3 4q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z M12 5v14',
  scan:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5 M7 12h10m-5-5v10',
  train:'M4 7l8 5-8 5m8-5 8-5m-8 5 8 5 M4 5v4m0 6v4m8-9v4m8-9v4m0 6v4',
  compare:'M3 20h18M5 17v-6h3v6zm6 0V4h3v13zm6 0V8h3v9z',
  test:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z M9 10l2 2 4-5',
  docs:'M5 3h10l4 4v14H5z M14 3v5h5M8 12h8m-8 4h6'
};
const panes = new Map(), remembered = new Map();
const paneHost = document.querySelector('#panes');
let active, referenceScan;
const firstStep = view => Object.keys(tasks[view].steps)[0];

function address(view, step = firstStep(view)) {
  const previous = panes.get(tasks[view].tool)?.url;
  const url = new URL(tasks[view].path,root);
  if (previous && tasks[view].tool !== 'docs') url.search = previous.search;
  url.hash = tasks[view].steps[step][1];
  return {view,step,url};
}

function shellURL(route) {
  const url = new URL('studio/',root);
  url.searchParams.set('view',route.view);
  const lang=document.documentElement.dataset.language || new URLSearchParams(location.search).get('lang');
  if(lang && lang!=='en')url.searchParams.set('lang',lang);
  if (route.step !== firstStep(route.view)) url.searchParams.set('step',route.step);
  const destination = route.url.href.slice(root.href.length);
  if (destination !== tasks[route.view].path + (tasks[route.view].steps[route.step][1] ? '#' + tasks[route.view].steps[route.step][1] : '')) {
    url.searchParams.set('open',destination);
  }
  return url;
}

function toolFor(url) {
  if (!url.href.startsWith(root.href)) return;
  const path = url.pathname.slice(root.pathname.length);
  if (path === '' || path === 'index.html') return 'field';
  if (/^trainer\/(index\.html)?$/.test(path)) return 'trainer';
  if (/^benchmark\/(index\.html)?$/.test(path)) return 'benchmark';
  if (/^guide\/(?:[\w/-]+\.html)?$/.test(path)) return 'docs';
}

function readAddress() {
  const params = new URLSearchParams(location.search);
  const view = Object.hasOwn(tasks,params.get('view')) ? params.get('view') : 'learn';
  const step = Object.hasOwn(tasks[view].steps,params.get('step')) ? params.get('step') : firstStep(view);
  const route = address(view,step);
  // A copied or restored address is independent of the current instrument's recipe.
  route.url.search = '';
  if (params.has('open')) {
    try {
      const url = new URL(params.get('open'),root);
      if (toolFor(url) === tasks[view].tool) route.url = url;
    } catch { /* Fall back to the task's entry point for malformed bookmarks. */ }
  }
  return route;
}

function classify(url, doc) {
  const tool = toolFor(url);
  if (!tool) return;
  const id = url.hash.slice(1);
  const target = doc?.getElementById(id);
  const within = selector => target?.closest(selector);
  const labView = id.startsWith('explore-') && id.slice(8);
  if (tasks[labView]?.tool === tool && tasks[labView]?.steps.explore) return {view:labView,step:'explore',url};
  let view,step;
  if (tool === 'field') {
    view = ['guide','learnWeight','placePin','sampleRow','missions'].includes(id) || within('#guide,#missions') || (!id && !url.search) ? 'learn' : 'scan';
    if (view === 'learn') step = id === 'missions' || within('#missions') ? 'journal' : 'lessons';
    else step = id === 'scan-study' || within('#scan-study,.samplingGuide') ? 'study' :
      id === 'advanced-scan' || within('#advanced-scan') ? 'recipe' : 'generate';
  } else if (tool === 'trainer') {
    view = id === 'field-test' || within('#field-test') || (!id && url.searchParams.has('fieldExample')) ? 'test' : 'train';
    if (view === 'train') step = within('#detector') || id === 'detector' ? 'model' :
      within('.advancedPanel') || id === 'settingsTitle' ? 'settings' :
      within('#runReview') || id === 'resultsTitle' ? 'results' : 'fit';
  } else if (tool === 'benchmark') {
    view = 'compare';
    step = within('#benchExamples') || id === 'benchExamples' ? 'presets' : within('#benchResults') || id === 'benchResults' ? 'compare-results' : 'experiment';
  } else view = 'docs';
  return {view,step:step || firstStep(view),url};
}

// These shareable routes now reveal settings alongside their live instrument.
const panelSteps = {recipe:'generate', model:'fit', settings:'fit', presets:'experiment'};
const benchViews = {scan:'generate', train:'fit', compare:'experiment', test:'test'};
const compact = matchMedia('(max-width:1000px), (max-height:500px) and (max-width:1150px)');
const settingsButton = document.getElementById('openSettings');
const shade = document.getElementById('drawerShade');
const narration = createStudioNarration(document.getElementById('listenSlot'));
let currentInspector;
function refreshReading() {
  if (!active || active.step === 'film') return;
  const pane = panes.get(tasks[active.view].tool);
  if (pane?.ready && !pane.frame.hidden) {
    narration.set(studioReading(active,pane.frame.contentDocument,currentInspector,tasks[active.view].steps[active.step][0]));
  }
}
function reflectInspector() {
  const modal = Boolean(currentInspector?.modal);
  settingsButton.setAttribute('aria-expanded', String(Boolean(currentInspector?.expanded)));
  shade.hidden = !modal;
  for (const el of document.querySelectorAll('.studioBar,#activities,.deskHead,.studio>.skip')) el.inert = modal;
}
const inspectorShell = {
  compact,
  changed(source) { if (source === currentInspector) { reflectInspector(); refreshReading(); } },
  remember() {
    if (!history.state?.studioDrawer) history.pushState({studioDrawer:true}, '', location.href);
  },
  dismissed(source) {
    if (source !== currentInspector) return;
    reflectInspector();
    refreshReading();
    settingsButton.focus({preventScroll:true});
    if (history.state?.studioDrawer) history.back();
    else if (Object.hasOwn(panelSteps,active.step)) navigate(address(active.view),'replace');
  }
};
settingsButton.addEventListener('click', () => {
  if (currentInspector?.expanded) currentInspector.dismiss();
  else currentInspector?.open();
});
shade.addEventListener('click', () => currentInspector?.dismiss());

function showFrame(pane) {
  const doc = pane.frame.contentDocument;
  if (!doc || !active || tasks[active.view].tool !== pane.tool || !pane.ready) return;
  const {view,step,url} = active;
  doc.documentElement.dataset.activity = view;
  const workStep = panelSteps[step] || step;
  doc.documentElement.dataset.step = workStep;
  currentInspector = workStep === benchViews[view] ? pane.inspectors?.[view] : null;
  currentInspector?.activate(true);
  settingsButton.disabled = !currentInspector;
  reflectInspector();
  pane.frame.title = tasks[view].title;
  const win = pane.frame.contentWindow;
  if (win.location.href !== url.href) {
    const oldURL = win.location.href;
    win.history.replaceState(null,'',url);
    win.dispatchEvent(new win.HashChangeEvent('hashchange',{oldURL,newURL:url.href}));
  }
  if (view === 'learn' && ['sampleRow','placePin','learnWeight'].includes(url.hash.slice(1))) {
    doc.getElementById({sampleRow:'rowTab',placePin:'pinTab',learnWeight:'fitTab'}[url.hash.slice(1)]).click();
  }
  const disclosures = {recipe:['anatomySettings','sensorSettings','obstacleSettings'], study:['scan-study'], model:['modelOptions'],settings:['fitOptions','datasetOptions','scanOptions','detectorOptions'],presets:['benchExamples']};
  for (const id of disclosures[step] || []) doc.getElementById(id).open = true;
  const target = doc.getElementById(url.hash.slice(1));
  if (panelSteps[step] || url.hash.slice(1) !== tasks[view].steps[step][1]) currentInspector?.reveal(target);
  else if (history.state?.studioDrawer && compact.matches) currentInspector?.open(undefined,false);
  if (target && url.hash.slice(1) !== tasks[view].steps[step][1]) {
    for (let el=target;el;el=el.parentElement) if (el.tagName==='DETAILS') el.open=true;
    target.scrollIntoView({behavior:'instant',block:'start'});
  } else win.scrollTo({top:0,behavior:'instant'});
  refreshReading();
}

function mount(tool) {
  const frame = document.createElement('iframe');
  frame.className = 'studioFrame'; frame.allowFullscreen = true;
  const pane = {tool,frame,ready:false,url:null};
  panes.set(tool,pane);
  function connectDocument() {
    const doc=frame.contentDocument;
    if (!doc || pane.document===doc || toolFor(new URL(doc.URL))!==tool) return;
    pane.document=doc;
    const css=doc.createElement('link');
    css.rel='stylesheet'; css.href=new URL('app/studio-frame.css',root);
    css.addEventListener('load', () => {
      if (pane.document===doc && frame.contentDocument===doc) frame.dataset.styled='true';
    });
    doc.head.append(css);
    const voiceStyle = doc.createElement('link');
    voiceStyle.rel = 'stylesheet';
    voiceStyle.href = new URL('app/studio-narration.css',root);
    doc.head.append(voiceStyle);
    if (tool === 'docs') doc.addEventListener('guide-figure-change',refreshReading);
    doc.defaultView.addEventListener('crop-language-change',refreshReading);
    if (document.documentElement.dataset.language) pane.frame.contentWindow.postMessage({type:'crop-language',code:document.documentElement.dataset.language},location.origin);
    if (tool === 'field') {
      doc.addEventListener('crop-scan-address', event => {
        const route = classify(event.detail.url,doc);
        if (route) event.detail.url = shellURL(route);
      });
      const footer = doc.querySelector('.siteFoot');
      footer.className = 'journalResources';
      doc.getElementById('missions').append(footer);
      const tabs = doc.querySelector('#guide [role="tablist"]');
      new MutationObserver(() => {
        if (active?.step === 'lessons' && pane.frame.contentDocument === doc) refreshReading();
      }).observe(tabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
    }
    if (tool!=='docs') {
      const view = {field:'scan', trainer:'train', benchmark:'compare'}[tool];
      pane.inspectors = {[view]:installInstrument(doc,tool,referenceScan,inspectorShell)};
    }
    if (tool==='trainer') {
      pane.inspectors.test=installInstrument(doc,'test',null,inspectorShell);
      doc.getElementById('runPreset').addEventListener('change', event => {
        if (event.target.value==='custom') {
          navigate(address('train','settings'));
          doc.getElementById('stopMode').focus();
        }
      });
      const empty=doc.createElement('section');
      empty.className='panel resultEmpty';
      empty.innerHTML='<img src="../art/scan-learn-find.svg" alt="A field scan becomes measurements, then plant predictions."><h2>Score a fresh planting</h2><p>Fit a detector to see its matches, extra pins and missed plants here.</p><a href="#controls">Set up a training run</a>';
      const review=doc.querySelector('#runReview');
      review.after(empty);
      const testFit = doc.createElement('a');
      testFit.className = 'textLink';
      testFit.href = '#testModelSource';
      testFit.textContent = 'Test this detector on a plot';
      testFit.addEventListener('click', event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const source = doc.getElementById('testModelSource');
        if (source.disabled || source.querySelector('[value=current]').disabled) return;
        source.value = 'current';
        source.dispatchEvent(new Event('change',{bubbles:true}));
      });
      review.append(testFit);
      const update=() => {
        if (empty.hidden!==!review.hidden) empty.hidden=!review.hidden;
        const running=!doc.getElementById('cancel').disabled;
        const indicator=document.querySelector('[data-view=train] .runIndicator');
        indicator.hidden=!running; indicator.textContent=running?'Running':'';
      };
      new MutationObserver(update).observe(doc.querySelector('#main'),{subtree:true,attributes:true,attributeFilter:['hidden','disabled']});
      update();
    }
    doc.addEventListener('click',event => {
      const link=event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || link.target==='_blank') return;
      let url=new URL(link.href);
      if (link.id==='scanLink' && url.pathname===new URL('studio/',root).pathname && url.searchParams.has('open')) {
        url=new URL(url.searchParams.get('open'),root);
      }
      const next=classify(url, url.pathname===doc.location.pathname ? doc : null);
      if (next) {
        if (link.id==='trainLayout' && !doc.getElementById('ply').disabled) {
          const trainer=panes.get('trainer');
          const trainerDoc=trainer?.ready && trainer.frame.contentDocument;
          if (trainerDoc && !trainerDoc.getElementById('cancel').disabled) {
            event.preventDefault();
            navigate(address('train','fit'));
            return;
          }
          const map=doc.getElementById('map');
          const thumb=doc.createElement('canvas');
          thumb.width=Math.min(900,map.width);
          thumb.height=Math.max(1,Math.round(thumb.width*map.height/map.width));
          thumb.getContext('2d').drawImage(map,0,0,thumb.width,thumb.height);
          referenceScan={image:thumb.toDataURL('image/webp'),label:doc.getElementById('fieldCaption').textContent,search:url.search};
          if (trainerDoc) trainerDoc.dispatchEvent(new CustomEvent('studio-scan-reference',{detail:referenceScan}));
        }
        event.preventDefault();navigate(next);
      }
      else if (['https:','http:'].includes(url.protocol)) {link.target='_blank';link.rel='noopener';}
    });
    doc.addEventListener('invalid',event=>{
      if (doc.documentElement.dataset.activity==='test' || !event.target.id) return;
      const url=new URL(doc.URL);url.hash=event.target.id;
      const route=classify(url,doc);
      if (route && route.step!==active.step) navigate(route);
      currentInspector?.reveal(event.target,true);
    },true);
    if (tool==='field') doc.getElementById('grow').addEventListener('submit',event=>{
      if (event.submitter?.id==='applyScanSettings' && currentInspector?.expanded) currentInspector.dismiss();
    });
    pane.ready=true;
    // Resolve deep anchors against the actual document after a cross-tool replay.
    if (active && tasks[active.view].tool===tool && active.url.hash && doc.getElementById(active.url.hash.slice(1))) {
      const resolved=classify(active.url,doc);
      if (resolved.step!==active.step || resolved.view!==active.view) {navigate(resolved,'replace');return;}
    }
    showFrame(pane);
  }
  frame.addEventListener('crop-document-ready',connectDocument);
  frame.addEventListener('load',connectDocument);
  paneHost.append(frame);
  return pane;
}

function navigate(route,historyMode='push') {
  narration.loading();
  currentInspector?.activate(false);
  currentInspector = null;
  reflectInspector();
  const {view,step,url}=route;
  const config=tasks[view];
  const workStep = panelSteps[step] || step;
  settingsButton.hidden = workStep !== benchViews[view];
  settingsButton.disabled = true;
  const isFilm = view==='learn' && step==='film';
  const pane=isFilm ? null : panes.get(config.tool) || mount(config.tool);
  document.getElementById('film').hidden=!isFilm;
  if (!isFilm) pauseFilm();
  active=route;
  const atStart=step===firstStep(view);
  activityPicker.options[0].textContent=atStart ? '' : config.label+' · '+config.steps[step][0];
  activityPicker.value=atStart ? view : '';
  remembered.set(view,route);
  if (historyMode!=='restore' && shellURL(route).href!==location.href) {
    history[historyMode==='replace'?'replaceState':'pushState'](null,'',shellURL(route));
  }
  for (const item of panes.values()) item.frame.hidden=item!==pane;
  for (const link of document.querySelectorAll('#activities a')) {
    if (link.dataset.view===view) link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  document.title=config.title+' · Crop Trainer';
  document.getElementById('activityTitle').textContent=config.title;
  steps.replaceChildren();
  for (const [key,[label]] of Object.entries(config.steps)) {
    if (Object.keys(config.steps).length===1) break;
    if (panelSteps[key]) continue;
    const link=document.createElement('a');link.textContent=label;link.dataset.step=key;
    const target=new URL(url);target.hash=config.steps[key][1];
    link.href=shellURL({view,step:key,url:target});
    if (workStep===key) link.setAttribute('aria-current','location');
    steps.append(link);
  }
  requestAnimationFrame(revealCurrentStep);
  if (isFilm) { narration.set(null); return; }
  const reload=!pane.url || pane.url.pathname!==url.pathname || pane.url.search!==url.search;
  pane.url=new URL(url);
  if (reload) {delete pane.frame.dataset.styled;pane.ready=false;pane.frame.contentWindow.location.replace(url.href);}
  else showFrame(pane);
}
for (const link of document.querySelectorAll('#activities a')) {
  const view=link.dataset.view;
  link.querySelector('span').innerHTML='<svg viewBox="0 0 24 24"><path d="'+paths[view]+'"/></svg>';
  if (view==='train') {
    const status=document.createElement('small');status.className='runIndicator';status.hidden=true;link.append(status);
  }
}
const steps=document.getElementById('steps');
// Scroll just the section strip. Moving the document would also move the instrument.
function revealCurrentStep() {
  const current=steps.querySelector('[aria-current]');
  if (!current || steps.scrollWidth<=steps.clientWidth) return;
  const tab=current.getBoundingClientRect(), strip=steps.getBoundingClientRect();
  const offset=tab.left<strip.left ? tab.left-strip.left : Math.max(0,tab.right-strip.right);
  if (offset) steps.scrollBy({left:offset,behavior:'instant'});
}
new ResizeObserver(revealCurrentStep).observe(steps);
window.addEventListener('crop-language-change',revealCurrentStep);
const activityPicker=document.getElementById('activityMenu');

function openActivity(view) {
  // Scan and Train return to their main controls. Both keep the active planting or fit.
  const route=['scan','train'].includes(view) ? address(view) : remembered.get(view) || address(view);
  if (view!=='docs' && panes.get(tasks[view].tool)?.url) route.url.search=panes.get(tasks[view].tool).url.search;
  navigate(route);
  document.getElementById('desk').focus({preventScroll:true});
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-view],a[data-step]');
  if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (link.dataset.step) {
    navigate(address(active.view,link.dataset.step));
    document.getElementById('desk').focus({preventScroll:true});
  } else openActivity(link.dataset.view);
  event.preventDefault();
});
window.addEventListener('popstate',()=>{
  if (active && shellURL(active).search === location.search && !history.state?.studioDrawer && !panelSteps[active.step]) {
    // Back from an overlay should return to the settings affordance.
    currentInspector?.activate(false);
    currentInspector?.activate(true);
    settingsButton.focus({preventScroll:true});
    return;
  }
  navigate(readAddress(),'restore');
});
function filmRoute(destination) {
  const route = classify(new URL(destination,root));
  const pane = panes.get(tasks[route.view].tool);
  if (pane?.url && route.view !== 'docs') route.url.search = pane.url.search;
  return route;
}
const pauseFilm = initFieldFilm(destination => shellURL(filmRoute(destination)), destination => {
  navigate(filmRoute(destination));
  document.getElementById('desk').focus({preventScroll:true});
});
navigate(readAddress(),'restore');
