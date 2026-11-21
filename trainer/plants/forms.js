const lettuce = [
  ['looseleaf','Loose-leaf rosette'], ['butterhead','Cupped butterhead'], ['romaine','Upright romaine']
];
const catalog = {
  lettuce, 'bench-lettuce': lettuce,
  artichoke: [['rosette','Vegetative rosette'], ['single-bud','Terminal bud'], ['branched-buds','Branching buds']],
  tomato: [['seedling','First true leaves'], ['transplant','Leafy transplant'], ['branching','Branching young plant']],
  apple: [['central-leader','Central leader'], ['open-vase','Open vase']],
  grapevine: [['bilateral-cordon','Two cordon arms'], ['unilateral-cordon','One cordon arm'], ['pruned-cordon','Dormant spur-pruned vine']],
  'high-wire-tomato': [['single-leader','Single fruiting leader'], ['twin-leader','Twin fruiting leaders'], ['young-leader','Young leader, no fruit']]
};

export function formsFor(crop) {
  if (!Object.hasOwn(catalog,crop)) throw Error('Choose a supported crop.');
  return catalog[crop].map(([id,label]) => ({id,label}));
}

export function checkPlantForm(crop, form = 'mixed') {
  if (form !== 'mixed' && !formsFor(crop).some(({id}) => id === form)) throw Error('Choose a plant form for this crop.');
  return form;
}

export function checkPlantCondition(condition = 'healthy') {
  if (!['healthy','damaged','mixed'].includes(condition)) throw Error('Choose a supported plant condition.');
  return condition;
}

export function plantGuide(crop) {
  return crop === 'tomato' ? 'young-tomato' : crop;
}
