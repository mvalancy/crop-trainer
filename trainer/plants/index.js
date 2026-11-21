import {BENCH_HEIGHT_M, TROUGH_HEIGHT_M} from '../growing-systems.js?v=plants3';
import {apple} from './apple.js';
import {grapevine} from './grapevine.js';
import {highWireTomato} from './high-wire-tomato.js';
import {lettuce, benchLettuce} from './lettuce.js?v=plants3';
import {artichoke} from './artichoke.js?v=plants3';
import {youngTomato} from './young-tomato.js';
import {plantSurfaces} from './surfaces.js';

const generators = {
  lettuce, artichoke, tomato: youngTomato, apple, grapevine,
  'bench-lettuce': benchLettuce, 'high-wire-tomato': highWireTomato
};

// Crop modules place organs in metres. The sampler owns scan order, occlusion
// and bounds, so a new crop only needs to describe its plant architecture.
export function growOrgans(crop, ctx, canopy = 'leafy') {
  // Leaf removal happens after the growth decisions so the woody plant replays.
  if (crop === 'apple' && canopy === 'dormant') ctx = {...ctx, ellipsoid() {}};
  generators[crop](ctx);
}

export function structuredPlant(crop, options) {
  const {x, y, radius, random} = options;
  const grounded = options.plantArchitecture >= 3;
  const bed = crop === 'bench-lettuce' ? (grounded ? BENCH_HEIGHT_M : .74)
    : crop === 'high-wire-tomato' ? (grounded ? TROUGH_HEIGHT_M : .20) : 0;
  const z = options.soil + bed;
  const bounds = {min: [x, y, z], max: [x, y, z]};
  const surfaces = plantSurfaces(options.rays, options.write, options.skeleton, bounds);
  growOrgans(crop, {x, y, z, radius, random, plantArchitecture: options.plantArchitecture, form: options.form, damaged: options.damaged, ...surfaces}, options.canopy);
  return bounds;
}
