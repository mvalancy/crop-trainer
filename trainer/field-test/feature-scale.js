import {featureNamesFor} from '../models/network.js?v=scale-probe1';

const measurementUnits = ['m','m','m','m','m','m','','','','','','cells²','m'];

function measurementDescription(index, mode) {
  const descriptions = [
    'The grid smooths the tallest returns in nearby cells to measure this peak.',
    mode === 'local-ground' ? 'Height of the nearby top return above a low surface measured around the peak.' : 'Height of the tallest return in the peak’s grid cell.',
    'Average height of the tallest returns in the cells closest to the peak.',
    'Average height of the tallest returns in a ring around the peak.',
    'Average height of the tallest returns in the outer ring around the peak.',
    'Smoothed peak height minus the average height in the outer ring.',
    'Fraction of middle-ring cells with a return above both 7 cm and 65% of the smoothed peak height.',
    'Fraction of outer-ring cells with a return above both 7 cm and 65% of the smoothed peak height.',
    'Fraction of inner cells that received at least one laser return.',
    'Fraction of outer-ring cells that received at least one laser return.',
    'Natural logarithm of one plus the number of nearby laser returns.',
    'Difference between the peak’s spread along X and along Y, weighted by height. A round peak gives a value near zero.',
    mode === 'local-ground' ? 'Difference between the 80th and 20th percentiles of low returns in surrounding cells.' : 'Tallest nearby return above the average of capped outer-ring heights.'
  ];
  return descriptions[index];
}

function formatted(value) {
  if (value === 0) return '0';
  return String(Number(value.toPrecision(4)));
}

export function initFeatureScale(onToggle) {
  const panel = document.getElementById('testFeatureScale');
  const select = document.getElementById('testFeatureIndex');
  const description = document.getElementById('testScaleMeasure');
  const peak = document.getElementById('testScalePeak');
  const source = document.getElementById('testScaleSource');
  const meaning = document.getElementById('testScaleMeaning');
  const numbers = ['Raw','Mean','Divisor','Input'].map(key => document.getElementById('testScale'+key));
  const ruler = panel.querySelector('.featureScaleRuler');
  const ticks = ruler.querySelectorAll('.featureScaleTicks span');
  let sample;

  function render() {
    const index = Number(select.value);
    const value = sample.inputs[index];
    description.textContent = measurementDescription(index,sample.featureMode);
    const values = [sample.raw[index],sample.means[index],sample.divisors[index],value];
    for (const [i, item] of values.entries()) {
      const unit = i === 3 ? '' : measurementUnits[index];
      numbers[i].textContent = formatted(item) + (unit ? ' '+unit : '');
      numbers[i].dataset.value = String(item);
    }
    ruler.hidden = !Number.isFinite(value);
    if (ruler.hidden) {
      meaning.textContent = 'This measurement exceeds the range of a finite model input.';
      return;
    }
    // Keep zero centered and show a whole number of steps on each side.
    const extent = Math.max(2, Math.ceil(Math.abs(value)));
    ruler.style.setProperty('--point', (50 + 50*value/extent)+'%');
    ruler.style.setProperty('--step', (50/extent)+'%');
    ticks[0].textContent = '−'+formatted(extent);
    ticks[2].textContent = '+'+formatted(extent);
    meaning.textContent = value === 0 ? 'This measurement equals the training mean.' :
      'This measurement is '+formatted(Math.abs(value))+' saved '+(Math.abs(value)===1?'step':'steps')+
      (value < 0 ? ' below' : ' above')+' the training mean.';
  }
  select.addEventListener('change',render);
  panel.addEventListener('toggle',onToggle);
  function setSample(next, modelName) {
    sample = next;
    panel.hidden = !sample;
    if (!sample) {
      peak.textContent = source.textContent = description.textContent = meaning.textContent = '';
      for (const item of numbers) { item.textContent = ''; delete item.dataset.value; }
      return;
    }
    const selected = select.value || '0';
    select.replaceChildren(...featureNamesFor(sample.featureMode).map((name,i) => new Option(name,String(i))));
    select.value = selected;
    const [x,y] = sample.xy;
    peak.textContent = 'Nearest of '+sample.count.toLocaleString()+' peaks to the plot center · X '+x.toFixed(2)+'\u00a0m, Y '+y.toFixed(2)+'\u00a0m.';
    source.textContent = modelName+' scored this peak '+formatted(sample.score)+' from all 13 inputs before cutoff.';
    render();
  }
  return {setSample, visiblePeak:() => panel.open && !panel.hidden ? sample.xy : null};
}
