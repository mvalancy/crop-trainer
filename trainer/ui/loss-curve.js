import {plotPalette} from '../../app/plot-palette.js';
// Each saved loss has an explicit epoch. Long runs thin the history and keep the final point.
export function createLossCurve(canvas, slider, readout) {
  let epochs = [], values = [], examples = 0;
  const formatTick = value => Number(value.toPrecision(2)).toLocaleString(undefined, {maximumSignificantDigits:2});

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    if (!values.length) return;

    const colors = plotPalette(canvas);
    const maxLoss = Math.max(...values) || 1;
    const left = 45, right = w - 14, top = 10, bottom = h - 26;
    const x = epoch => left + (right - left) * (epoch - 1) / Math.max(1, epochs.at(-1) - 1);
    const y = loss => bottom - (bottom - top) * loss / maxLoss;
    ctx.font = '12px system-ui, sans-serif';
    for (const tick of [0, maxLoss / 2, maxLoss]) {
      ctx.strokeStyle = colors.grid;
      ctx.beginPath(); ctx.moveTo(left, y(tick)); ctx.lineTo(right, y(tick)); ctx.stroke();
      ctx.fillStyle = colors.muted; ctx.textAlign = 'right';
      ctx.fillText(formatTick(tick), left - 7, y(tick) + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Epoch 1', left, h - 5);
    if (epochs.at(-1) > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(epochs.at(-1).toLocaleString(), right, h - 5);
    }
    ctx.beginPath();
    values.forEach((loss, i) => i ? ctx.lineTo(x(epochs[i]), y(loss)) : ctx.moveTo(x(epochs[i]), y(loss)));
    ctx.strokeStyle = colors.plant; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(x(epochs.at(-1)), bottom); ctx.lineTo(left, bottom); ctx.closePath();
    ctx.fillStyle = 'rgba(86,139,84,.12)'; ctx.fill();

    const i = slider.valueAsNumber;
    ctx.beginPath(); ctx.moveTo(x(epochs[i]), bottom); ctx.lineTo(x(epochs[i]), y(values[i]));
    ctx.setLineDash([3, 3]); ctx.strokeStyle = colors.muted; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x(epochs[i]), y(values[i]), 4, 0, 2 * Math.PI);
    ctx.fillStyle = colors.plant; ctx.fill();
  }

  function select() {
    const i = slider.valueAsNumber;
    const text = 'Epoch ' + epochs[i].toLocaleString() + ' · loss ' + values[i].toPrecision(4) +
      ' · ' + (epochs[i] * examples).toLocaleString() + ' example visits';
    readout.textContent = text;
    slider.setAttribute('aria-valuetext', text);
    draw();
  }

  window.addEventListener('crop-theme-change', draw);
  new ResizeObserver(draw).observe(canvas);
  slider.addEventListener('input', select);
  return function show(fit, sampleCount) {
    epochs = fit.lossEpochs;
    values = fit.loss;
    examples = sampleCount;
    slider.max = values.length - 1;
    slider.value = slider.max;
    slider.closest('label').hidden = values.length <= 1;
    select();
  };
}
