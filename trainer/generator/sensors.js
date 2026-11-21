// Generic synthetic sampling patterns.
export const mixedProfiles=[
 ['reference','grid',0,0],
 ['wide-lines','lines',8,15],['sparse-lines','lines',9,18],['medium-lines','lines',5,12],['fine-lines','lines',3,10],
 ['even-sweep','sweep',4,4],['coarse-sweep','sweep',6,6],['wide-rings','rings',1,16,1024,64],
 ['tight-rings','rings',1,16,1024,64],['long-rings','rings',1,31,2000,32],['short-rings','rings',1,31,1800,32],
 ['row-lines','lines',5,8],['narrow-lines','lines',3,9],['fine-sweep','sweep',2,3]
].map(([key,pattern,along,across,alongCount,acrossCount])=>({key,pattern,along,across,alongCount,acrossCount}));

const hardwareProfiles = [
  {key:'os1-32', name:'Ouster OS1-32', pattern:'rings', along:1, across:31, alongCount:512, acrossCount:32},
  {key:'os1-64', name:'Ouster OS1-64', pattern:'rings', along:1, across:16, alongCount:1024, acrossCount:64},
  {key:'os1-128', name:'Ouster OS1-128', pattern:'rings', along:1, across:8, alongCount:2048, acrossCount:128}
];
export const allProfiles = [...mixedProfiles, ...hardwareProfiles];

export function getSensor(key) {
  const profile = allProfiles.find(profile => profile.key === key);
  if (!profile) throw new Error('Unknown scanner profile: ' + key);
  return profile;
}

export function sensorName(profile) {
  return profile.name || profile.key.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
}

export function sensorOptions(select, includeMixed = false) {
  select.replaceChildren();
  if (includeMixed) select.add(new Option('Mixed synthetic profiles (14)', 'mixed'));
  for (const [label, profiles] of [['Synthetic layouts', mixedProfiles], ['Hardware-inspired layouts', hardwareProfiles]]) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const profile of profiles) group.append(new Option(sensorName(profile), profile.key));
    select.append(group);
  }
}

export function validationSensorOptions(select) {
  sensorOptions(select, true);
  select.prepend(new Option('Follow training layout', 'follow'));
  select.value = 'follow';
}

export function sensorDetails(key) {
  if (key === 'mixed') return 'Cycles through 14 seeded synthetic profiles. Each field keeps its scanner for both ground variants.';
  const profile = getSensor(key);
  if (profile.alongCount) return profile.acrossCount + ' rings × ' + profile.alongCount + ' angular columns. Projects a ring lattice onto the plot; the point budget caps sampled rays.';
  if (profile.pattern === 'grid') return 'One jittered sample per selected grid cell covers the plot uniformly.';
  return profile.pattern === 'lines'
    ? 'Parallel tracks spaced about ' + profile.across + ' cm apart, with about ' + profile.along + ' cm between samples along a track.'
    : 'Offset sweeps distribute rays across the plot using an anisotropic repeating pattern.';
}

export const MAX_SCAN_RAYS = 1_000_000;
export const DEFAULT_GENERATOR_RAYS = 262_144;
export const RAY_BUDGETS = [12000, 30000, 60000, 100000, DEFAULT_GENERATOR_RAYS, 500_000, MAX_SCAN_RAYS];

// Synthetic line spacings are centimetres on a 1,000 cm plot. Ring layouts
// carry their own column and channel counts.
export function layoutDimensions(sensor) {
  if (!sensor || sensor.key === 'reference') return null;
  return [
    sensor.alongCount ?? Math.max(1, Math.round(1000 / sensor.along)),
    sensor.acrossCount ?? Math.max(1, Math.round(1000 / sensor.across))
  ];
}

export function layoutCapacity(sensor) {
  const size = layoutDimensions(sensor);
  return size ? Math.min(MAX_SCAN_RAYS, size[0] * size[1]) : MAX_SCAN_RAYS;
}

export function rayBudgetOptions(select, requested, seededLabel = 'Seeded · 26–42k rays') {
  select.replaceChildren(new Option(seededLabel, '0'));
  for (const rays of RAY_BUDGETS) select.add(new Option(rays.toLocaleString(), String(rays)));
  if (RAY_BUDGETS.includes(Number(requested))) select.value = String(Number(requested));
}

export const ALTERNATING_BUDGET = 'alternating';
export const DENSITY_BUDGETS = [12000, 60000];

export function trainingRayOptions(select, requested) {
  rayBudgetOptions(select, requested);
  select.add(new Option('Alternate 12k and 60k by field', ALTERNATING_BUDGET));
  if (requested === ALTERNATING_BUDGET) select.value = requested;
}

export function trainingRayValue(select) {
  return select.value === ALTERNATING_BUDGET ? select.value : Number(select.value);
}
