import {setupWeightLesson} from './weight-lesson.js';

import {rowPlate,sampleRow,rayMarks} from './row-sampling.js';

function drawRow(count) {
  const svg = document.getElementById('rayRow');
  const rays = sampleRow(count);
  svg.innerHTML = `<image href="${rowPlate}" width="600" height="400"/>` + rayMarks(rays);
  document.getElementById('rayFinding').textContent = rays.some(ray=>ray.plant===1)
    ? 'Dots now reach both plants. The extra rays caught the small seedling.'
    : 'Only the larger plant has dots. The small seedling sits between two rays.';
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
