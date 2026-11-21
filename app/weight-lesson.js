// One logistic unit. These two examples share a height input of 1 and a fixed bias of 0.
const height = 1, label = 1, learningRate = 1;

export function heightScore(weight) {
  return 1 / (1 + Math.exp(-weight * height));
}

export function learnHeightWeight(weight) {
  return weight + learningRate * (label - heightScore(weight)) * height;
}

export function setupWeightLesson() {
  const figure = document.getElementById('weightBench');
  const learn = document.getElementById('oneUpdate');
  const reset = document.getElementById('resetWeight');
  const finding = document.getElementById('weightFinding');
  const weightValue = document.getElementById('lessonWeight');
  const scores = ['practiceScore', 'weedScore'].map(id => document.getElementById(id));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let stepTimer, weight;

  function show(phase, message) {
    figure.dataset.phase = phase;
    finding.textContent = message;
    document.getElementById('lessonPlantLabel').textContent = phase==='ready' ? 'Labeled crop' : 'Crop target 1.00';
  }
  function scoreBoth() {
    const result = heightScore(weight).toFixed(2);
    for (const score of scores) score.textContent = result;
  }
  function startOver() {
    clearTimeout(stepTimer);
    weight = 0;
    weightValue.textContent = weight.toFixed(2);
    scoreBoth();
    show('ready', 'The height weight starts at zero. Both plants get a crop score of 0.50.');
    reset.disabled = true;
    learn.textContent = 'Learn from the plant';
  }
  function updateWeight() {
    weight = learnHeightWeight(weight);
    weightValue.textContent = weight.toFixed(2);
  }
  function finish() {
    clearTimeout(stepTimer);
    if (weight === 0) updateWeight();
    scoreBoth();
    show('done', 'Both scores rose to 0.62. Only the lettuce supplied a label. The weed received the same score because it was just as tall.');
  }
  learn.addEventListener('click', () => {
    startOver();
    // Commit the initial pose when replay starts during an existing sweep.
    figure.getBoundingClientRect();
    reset.disabled = false;
    learn.textContent = 'Replay update';
    if (motion.matches) { finish(); return; }
    show('label', 'The lettuce is labeled as a crop. Its target score is 1.00, but the model predicted 0.50.');
    stepTimer = setTimeout(() => {
      updateWeight();
      show('update', 'The model was low by 0.50. This learning step turns the height weight from 0.00 to 0.50.');
      stepTimer = setTimeout(() => {
        show('score', 'Now the same weight sends the height clue to both predictions. Watch the two scores.');
        stepTimer = setTimeout(finish, 1200);
      }, 1500);
    }, 1600);
  });
  reset.addEventListener('click', () => { startOver(); learn.focus({preventScroll:true}); });
  motion.addEventListener('change', () => {
    if (motion.matches && !['ready','done'].includes(figure.dataset.phase)) finish();
  });
  startOver();
}
