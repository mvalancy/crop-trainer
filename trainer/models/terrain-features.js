export function checkFeatureMode(mode = 'absolute') {
  if (mode !== 'absolute' && mode !== 'local-ground') {
    throw Error('Choose absolute or local-ground feature mode.');
  }
  return mode;
}

// The existing XYZ grid has 5 cm cells. Use centers from 15 through 30 cm
// around the peak, leaving the inner plant patch out of the floor estimate.
const annulus = [];
for (let dy = -6; dy <= 6; dy++) {
  for (let dx = -6; dx <= 6; dx++) {
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= 9 && distanceSquared <= 36) annulus.push([dx, dy]);
  }
}

export function localSurfaceFeatures(minima, maxima, side, x, y) {
  const observed = [];
  for (const [dx, dy] of annulus) {
    const column = x + dx, row = y + dy;
    if (column < 0 || column >= side || row < 0 || row >= side) continue;
    const low = minima[row * side + column];
    if (Number.isFinite(low)) observed.push(low);
  }
  if (observed.length < 3) return [0, 0];
  observed.sort((a, b) => a - b);
  const low = observed[Math.ceil(.2 * observed.length) - 1];
  const high = observed[Math.ceil(.8 * observed.length) - 1];

  // Peaks lie at least one cell from the boundary. An above-floor proposal
  // always has a positive measured return somewhere in this 3 by 3 window.
  let top = -Infinity;
  for (let row = y - 1; row <= y + 1; row++) {
    for (let column = x - 1; column <= x + 1; column++) {
      const index = row * side + column;
      if (Number.isFinite(minima[index])) top = Math.max(top, maxima[index]);
    }
  }
  return [Number.isFinite(top) ? top - low : 0, high - low];
}
