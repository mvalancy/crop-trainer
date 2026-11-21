import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../trainer/generator/field.js';
import {makeRecipe, buildDataset, features} from '../trainer/models/data.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {cropProfile} from '../trainer/generator/crops.js';
import {formsFor} from '../trainer/plants/forms.js';

// Archived unversioned recipe outputs measured at dc6d21d. Comparing the scan
// geometry, return classes and label coordinates catches hidden changes even
// if an older recipe still produces its original tile ID.
const legacyCrops = [
  ['lettuce', .17, .34, '8288fe7b00369181', 'dc9f08cb69ea402a3fed7054'],
  ['artichoke', .44, 1.4, '76a162533c6aceaf', 'e7b55bb58bc17c1a56fd4389'],
  ['tomato', .23, .61, 'eb9e5177c2ed0d20', '248306019e70a9c7dafbc970'],
  ['apple', .92, 2.18, 'c6dfb7b051961d5c', '0bda595960527cf747bf1ddc'],
  ['grapevine', .71, 1.33, '20309ba73bb263ef', 'c0c20836e700ddc3d5807c3e'],
  ['bench-lettuce', .17, .38, '0d020fe547ac4b5d', '639359ce6d63eb4b22df3776'],
  ['high-wire-tomato', .31, .66, 'a1205e97938b3442', '3c4d1ab3c14605c6a55733bc']
];

function signature(scan) {
  const millimeters = Buffer.allocUnsafe(scan.xyz.length * 4);
  scan.xyz.forEach((value, i) => millimeters.writeInt32LE(Math.round(1000 * value), 4 * i));
  const labels = scan.labels.boxes.map(box => [...box.min, ...box.max, ...(box.base_xy_m ?? [])]
    .map(value => Math.round(1000 * value)));
  return createHash('sha256').update(millimeters).update(scan.cls)
    .update(JSON.stringify(labels)).digest('hex').slice(0, 24);
}

test('unversioned saved crop recipes reproduce historical scans and label coordinates', () => {
  for (const [crop, radius, spacing, id, fingerprint] of legacyCrops) {
    const recipe = {crop, seed: 39061, ground: true, points: 12000,
      radius, spacing, weeds: true, sticks: true, boards: true};
    const scan = field(recipe);
    const explicit = field({...recipe, plantArchitecture: 1});
    assert.equal(explicit.labels.tile_id, id, crop);
    assert.equal(signature(explicit), fingerprint, crop);
    assert.equal(scan.labels.tile_id, id, crop);
    assert.equal(signature(scan), fingerprint, crop);
  }
});

test('the bookmarked lettuce from the first-steps guide regenerates its original tile', () => {
  const savedLink = new URL('https://mvalancy.github.io/crop-trainer/?crop=lettuce&seed=627223796&sensor=even-sweep&ground=true&tile=1947da1f756d90e1&box=3');
  const q = savedLink.searchParams;
  const recipe = makeRecipe(Number(q.get('seed')), q.get('ground') === 'true',
    getSensor(q.get('sensor')), q.get('crop'));
  const scan = field(recipe);
  assert.equal(scan.labels.tile_id, q.get('tile'));
  assert.equal(scan.labels.boxes.length, 199);
});

test('v2 parts stay aligned with the same plants through scan noise and soil removal', () => {
  const noisy = {seed: 17, xy: .5, z: .6, density: 20, gaps: 2, stray: .2, cluster: 12};
  for (const [crop] of legacyCrops) {
    const recipe = {...makeRecipe(39061, true, getSensor('reference'), crop, 2),
      points: 12000, scanNoise: noisy};
    const full = field(recipe);
    const bare = field({...recipe, ground: false});
    assert.equal(recipe.plantArchitecture, 2, crop);
    assert.equal(full.labels.plantArchitecture, 2, crop);
    assert.notEqual(full.labels.tile_id, field({...recipe, plantArchitecture: 1}).labels.tile_id, crop);
    assert.equal(full.parts.length, full.cls.length, crop);
    assert.ok(full.parts instanceof Uint8Array, crop);
    const foliage = crop === 'apple' ? 3 : 2;
    assert.ok(full.parts.includes(foliage), crop+' scan must sample some crown or leaf tissue');
    assert.ok(full.parts.every((part, i) => part <= 3 && (full.cls[i] === 1 || part === 0)), crop);
    assert.deepEqual(bare.parts, full.parts.filter((part, i) => full.cls[i] !== 0), crop);
    assert.deepEqual(bare.labels.boxes, full.labels.boxes, crop);
    if (cropProfile(crop).system) {
      assert.ok(full.labels.boxes.every(box => box.base_xy_m?.length === 2 &&
        box.base_xy_m.every((v, axis) => v >= box.min[axis] && v <= box.max[axis])), crop+' plant base');
    }
    assert.deepEqual(bare.plantReturns, full.plantReturns, crop);
    assert.deepEqual(full.parts, field(recipe).parts, crop);
    assert.ok(full.skeleton instanceof Float32Array, crop);
    assert.equal(full.skeleton.length % 6, 0, crop);
    assert.ok(full.skeleton.every(Number.isFinite), crop);
    assert.deepEqual(bare.skeleton, full.skeleton, crop);
  }
});

test('training and validation manifests replay the selected architecture in both soil settings', async () => {
  const settings = {crop: 'lettuce', seed: 27, trainFields: 2, valFields: 1, sensorMode: 'mixed'};
  const legacy = await buildDataset(settings);
  const updated = await buildDataset({...settings, plantArchitecture: 2, plantForm: 'butterhead', plantCondition: 'damaged'});
  assert.deepEqual(updated.stats.fieldSeeds, legacy.stats.fieldSeeds);
  for (const [index, tile] of updated.manifest.entries()) {
    assert.equal(tile.recipe.plantArchitecture, 2);
    assert.equal(tile.recipe.plantForm, 'butterhead');
    assert.equal(tile.recipe.plantCondition, 'damaged');
    const replay = field(JSON.parse(JSON.stringify(tile.recipe)));
    assert.equal(replay.labels.tile_id, tile.tile_id);
    assert.ok(replay.labels.boxes.every(box => box.plant_form === 'butterhead' && box.plant_condition === 'damaged'));
    assert.notEqual(legacy.manifest[index].tile_id, tile.tile_id);
  }
  assert.equal(legacy.validation[0].tile_id, '1947da1f756d90e1');
});

test('leaf-off orchard scans expose woody returns while retaining the trees and branch skeleton', () => {
  const recipe = {...makeRecipe(39061, true, getSensor('reference'), 'apple', 2),
    points: 120000, scanNoise: null, weeds: false, boards: false, sticks: false};
  const leafy = field(recipe);
  const dormant = field({...recipe, appleCanopy: 'dormant'});
  assert.equal(field({...recipe, appleCanopy: 'leafy'}).labels.tile_id, leafy.labels.tile_id);
  assert.notEqual(dormant.labels.tile_id, leafy.labels.tile_id);
  assert.deepEqual(dormant.labels.boxes.map(box => box.base_xy_m), leafy.labels.boxes.map(box => box.base_xy_m));
  assert.deepEqual(dormant.skeleton, leafy.skeleton);
  assert.ok(dormant.skeleton instanceof Float32Array && dormant.skeleton.length >= 12);
  const skeleton = dormant.skeleton;
  let trunk = false, branch = false;
  for (let i = 0; i < skeleton.length; i += 6) {
    const horizontal = Math.hypot(skeleton[i+3]-skeleton[i], skeleton[i+4]-skeleton[i+1]);
    const vertical = Math.abs(skeleton[i+5]-skeleton[i+2]);
    if (vertical > 1 && horizontal < vertical/4) trunk = true;
    if (horizontal > .1 && horizontal > vertical) branch = true;
  }
  assert.ok(trunk && branch, 'Expected upright wood and laterally extending branches in the orchard.');
  assert.ok(leafy.parts.includes(3), 'The leafy scan should sample crown volumes.');
  assert.ok(!dormant.parts.includes(3), 'The dormant scan should remove crown volumes.');
  // The organ colors and structural overlay are simulator annotations. A
  // detector sees exactly the features available from an ordinary XYZ scan.
  assert.deepEqual(features(leafy), features({xyz: leafy.xyz}));
  assert.ok(dormant.parts.filter(part => part === 1).length > leafy.parts.filter(part => part === 1).length,
    'Removing leaves should expose more wood to the same overhead rays.');
});

test('mixed and named crop forms preserve plantings and expose reproducible form labels', () => {
  for (const [crop] of legacyCrops) {
    const forms = formsFor(crop);
    assert.ok(forms.length >= 2, crop+' needs distinct named forms');
    const ids = new Set(forms.map(form => form.id));
    assert.equal(ids.size, forms.length);
    assert.ok(forms.every(form => form.id !== 'mixed' && form.id && form.label));
    const recipe = {...makeRecipe(39061, true, getSensor('reference'), crop, 2),
      points: 12000, scanNoise: null, weeds: false, boards: false, sticks: false};
    delete recipe.plantForm;
    const mixed = field(recipe);
    const explicitMixed = field({...recipe, plantForm: 'mixed'});
    assert.equal(mixed.labels.plantForm, 'mixed', crop);
    assert.equal(mixed.labels.tile_id, explicitMixed.labels.tile_id, crop);
    assert.deepEqual(mixed.labels.boxes, explicitMixed.labels.boxes, crop);
    assert.deepEqual(mixed.xyz, explicitMixed.xyz, crop);
    const chosen = mixed.labels.boxes.map(box => box.plant_form);
    assert.ok(chosen.every(id => ids.has(id)), crop);
    assert.ok(new Set(chosen).size > 1, crop+' mixed planting should contain multiple forms');

    const signatures = new Set();
    const tileIds = new Set([mixed.labels.tile_id]);
    for (const {id} of forms) {
      const named = field({...recipe, plantForm: id});
      assert.equal(named.p.plantForm, id);
      assert.equal(named.labels.plantForm, id);
      assert.equal(named.labels.boxes.length, mixed.labels.boxes.length);
      assert.ok(named.labels.boxes.every(box => box.plant_form === id), crop);
      if (cropProfile(crop).system) {
        assert.deepEqual(named.labels.boxes.map(box => box.base_xy_m),
          mixed.labels.boxes.map(box => box.base_xy_m), crop);
      }
      const pointBytes = new Uint8Array(named.xyz.buffer, named.xyz.byteOffset, named.xyz.byteLength);
      signatures.add(createHash('sha256').update(pointBytes).digest('hex'));
      tileIds.add(named.labels.tile_id);
    }
    assert.equal(tileIds.size, forms.length+1, crop+' identities must include the form treatment');
    assert.equal(signatures.size, forms.length, crop+' forms must change the returned XYZ');
  }
});

test('damaged plants keep their identity while changing the observed XYZ', () => {
  for (const [crop] of legacyCrops) {
    const recipe = {...makeRecipe(39061, true, getSensor('reference'), crop, 2),
      points: 12000, scanNoise: null, weeds: false, boards: false, sticks: false};
    delete recipe.plantCondition;
    const original = field(recipe);
    const healthy = field({...recipe, plantCondition: 'healthy'});
    const damagedRecipe = {...recipe, plantCondition: 'damaged'};
    const damaged = field(damagedRecipe);
    const mixed = field({...recipe, plantCondition: 'mixed'});
    assert.equal(mixed.labels.plantCondition, 'mixed');
    assert.deepEqual(new Set(mixed.labels.boxes.map(box => box.plant_condition)), new Set(['healthy', 'damaged']), crop);
    assert.deepEqual(healthy.xyz, original.xyz, crop);
    assert.equal(healthy.labels.tile_id, original.labels.tile_id);
    assert.ok(healthy.labels.boxes.every(box => box.plant_condition === 'healthy'), crop);
    assert.ok(damaged.labels.boxes.every(box => box.plant_condition === 'damaged'), crop);
    assert.notEqual(damaged.labels.tile_id, healthy.labels.tile_id);
    assert.notDeepEqual(damaged.xyz, healthy.xyz, crop+' health treatment should affect the sampled organs');
    assert.deepEqual(field(damagedRecipe).xyz, damaged.xyz, crop+' damage should replay');
    assert.deepEqual(damaged.labels.boxes.map(box => box.plant_form),
      healthy.labels.boxes.map(box => box.plant_form), crop+' keeps the same plants and forms');
    if (cropProfile(crop).system) {
      assert.deepEqual(damaged.labels.boxes.map(box => box.base_xy_m),
        healthy.labels.boxes.map(box => box.base_xy_m), crop);
    }
  }
});
