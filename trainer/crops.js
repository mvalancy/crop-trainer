// Approximate plant forms for synthetic experiments. Dimensions are in metres.
export const crops = {
  lettuce: {name: 'Lettuce', radiusFactor: 1, spacingFactor: 1, rows: 8, leafCount: 17, peakHeight: .035, pinSeparation: .125},
  artichoke: {name: 'Globe artichoke', radiusFactor: 2.6, spacingFactor: 4.1, rows: 5, leafCount: 13, peakHeight: .065, pinSeparation: .40},
  tomato: {name: 'Young tomato', radiusFactor: 1.35, spacingFactor: 1.8, rows: 7, leafCount: 10, peakHeight: .065, pinSeparation: .22}
};

export function cropProfile(key = 'lettuce') {
  if (!Object.hasOwn(crops, key)) throw new Error('Choose lettuce, artichoke or tomato.');
  return crops[key];
}

// Leaf widths are fractions of blade length. Repeated wide and narrow regions
// form deep lobes on artichoke leaves and leaflet pairs on tomato shoots.
export function bladeWidth(crop, u, phase) {
  const taper = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.72);
  if (crop === 'artichoke') {
    const lobes = Math.sin(4 * Math.PI * u + 0.2 * Math.sin(phase)) ** 2;
    return taper * (0.08 + 0.22 * lobes);
  }
  const leaflets = Math.sin(3 * Math.PI * u) ** 4;
  return taper * (0.025 + 0.38 * leaflets);
}

export function bladeHeight(crop, radius, tier, u, across) {
  if (crop === 'artichoke') {
    return radius * (0.23 + 0.45 * tier + 0.4 * Math.sin(Math.PI * u) - 0.15 * u + 0.05 * across ** 2);
  }
  return radius * (0.42 + 1.05 * tier + 0.35 * Math.sin(Math.PI * u) - 0.2 * u);
}
