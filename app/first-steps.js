import {setupWeightLesson} from './weight-lesson.js';

// The same two leaf silhouettes are both drawn and sampled in this side-view sketch.
const plants = [
  {x:132, size:1, leaves:[[-63,22,27],[56,24,26],[-27,52,19],[24,47,20],[-8,59,14]]},
  {x:239, size:.62, leaves:[[-34,27,12],[37,34,11],[-8,36,8]]}
];
const soilY = 135;
const svgNS = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes) {
  const element = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawRow(count) {
  const svg = document.getElementById('rayRow');
  const art = document.createDocumentFragment();
  art.append(svgElement('path', {d:'M0 135H420V166H0Z', fill:'#314538'}));
  const colors = ['#527950','#678a54','#72945b','#8eac6c','#97b570'];
  for (const plant of plants) {
    for (const [index,[width,tip,lift]] of plant.leaves.entries()) {
      const w = width * plant.size, h = tip * plant.size, bulge = lift * plant.size;
      const middle = plant.x + w/2;
      const d = 'M'+plant.x+' '+soilY+' Q'+middle+' '+(soilY-h/2-2*bulge)+' '+(plant.x+w)+' '+(soilY-h)
        +' Q'+middle+' '+(soilY-h/2+bulge*.4)+' '+plant.x+' '+soilY+'Z';
      art.append(svgElement('path', {d,fill:colors[index],stroke:'#193b2e','stroke-width':1}));
    }
  }
  art.append(svgElement('path', {d:'M0 135H420',stroke:'#89a388','stroke-width':1}));
  const hits = new Set();
  for (let i=0; i<count; i++) {
    const x = (i+.5)*420/count;
    let height = 0;
    for (const plant of plants) {
      for (const [width,tip,lift] of plant.leaves) {
        const u = (x-plant.x)/(width*plant.size);
        if (u<0 || u>1) continue;
        height = Math.max(height, plant.size*(u*tip + 4*lift*u*(1-u)));
        hits.add(plant);
      }
    }
    const y = soilY-height;
    const ray = svgElement('g', {class:'rowRay'});
    ray.style.setProperty('--arrival', i/count*.65+'s');
    ray.append(svgElement('path', {d:'M'+x+' 15V'+y,stroke:'#accabb','stroke-width':1,'stroke-dasharray':'3 3'}));
    ray.append(svgElement('circle', {cx:x,cy:y,r:3.5,fill:'#f2ffae',stroke:'#152d23','stroke-width':1}));
    art.append(ray);
  }
  svg.replaceChildren(art);
  const finding = hits.size===2 ? 'Dots now reach both plants. The extra rays caught the small seedling.' :
    'Only the larger plant has dots. The small seedling sits between two rays.';
  document.getElementById('rayFinding').textContent = finding;
}

export function setupFirstSteps(openPractice) {
  const guide = document.getElementById('guide');
  const tabs = [...guide.querySelectorAll('[role=tab]')];
  function showTab(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.tabIndex = active ? 0 : -1;
      item.setAttribute('aria-selected', String(active));
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
    if (tab.id === 'pinTab') openPractice();
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showTab(tab));
    tab.addEventListener('keydown', event => {
      const next = {ArrowRight:(index+1)%tabs.length, ArrowLeft:(index+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      showTab(tabs[next]);
      tabs[next].focus();
    });
  }
  for (const button of guide.querySelectorAll('[data-lesson-step]')) {
    button.addEventListener('click', () => {
      const next = document.getElementById(button.dataset.lessonStep);
      showTab(next);
      next.focus({preventScroll:true});
      guide.scrollIntoView({block:'start'});
    });
  }
  for (const choice of guide.querySelectorAll('[name=rowDensity]')) {
    choice.addEventListener('change', () => drawRow(Number(choice.value)));
  }
  drawRow(Number(guide.querySelector('[name=rowDensity]:checked').value));

  setupWeightLesson();
  function followLessonLink() {
    if (location.hash !== '#learnWeight') return;
    showTab(document.getElementById('fitTab'));
    requestAnimationFrame(() => document.getElementById('learnWeight').scrollIntoView({block:'start'}));
  }
  window.addEventListener('hashchange', followLessonLink);
  followLessonLink();
}
