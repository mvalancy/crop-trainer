// Approximate plant forms for synthetic experiments. Dimensions are in metres.
export const crops = {
  lettuce: {name: 'Lettuce', radiusFactor: 1, spacingFactor: 1, rows: 8, leafCount: 17, peakHeight: .035, pinSeparation: .125},
  artichoke: {name: 'Globe artichoke', radiusFactor: 2.6, spacingFactor: 4.1, rows: 5, leafCount: 13, peakHeight: .065, pinSeparation: .40},
  tomato: {name: 'Young tomato', radiusFactor: 1.35, spacingFactor: 1.8, rows: 7, leafCount: 10, peakHeight: .065, pinSeparation: .22},
  apple: {name:'Apple orchard', radiusFactor:5.4, spacingFactor:6.4, rows:3, peakHeight:.065, pinSeparation:1.05, system:'orchard', description:'Spaced trees with trunks and uneven crowns. Each target is one planted tree.'},
  grapevine: {name:'Trellised vineyard', radiusFactor:4.2, spacingFactor:3.9, rows:4, peakHeight:.065, pinSeparation:.65, system:'vineyard', fixtures:true, description:'Elongated vine canopies overlap along wires and posts. Each target is one vine base.'},
  'bench-lettuce': {name:'Greenhouse bench lettuce', radiusFactor:1, spacingFactor:1.13, rows:8, peakHeight:.065, pinSeparation:.16, system:'greenhouse', fixtures:true, description:'Rosettes grow on raised benches above a level floor. Each target is one planting position.'},
  'high-wire-tomato': {name:'Greenhouse high-wire tomato', radiusFactor:1.8, spacingFactor:1.95, rows:5, peakHeight:.065, pinSeparation:.31, system:'greenhouse', fixtures:true, description:'Layered foliage grows up slender stems in rows with overhead wires and growing troughs. Each target is one plant base.'}
};

export function cropProfile(key = 'lettuce') {
  if (!Object.hasOwn(crops, key)) throw new Error('Choose one of the supported crops: '+Object.keys(crops).join(', ')+'.');
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
