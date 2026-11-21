// Canvas pixels do not inherit CSS colors. Resolve the same palette as the map keys once per repaint.
export function plotPalette(canvas) {
  const style = getComputedStyle(canvas);
  const read = name => style.getPropertyValue('--' + name).trim();
  return {
    paper:read('paper'), ink:read('ink'), muted:read('muted'), grid:read('plot-line'),
    returns:read('plot-return'), plant:read('plot-label'), alert:read('plot-alert'),
    selection:read('plot-selection'), survey:read('plot-survey')
  };
}
