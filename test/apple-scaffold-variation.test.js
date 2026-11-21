import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../trainer/generator/field.js';
import {makeRecipe} from '../trainer/models/data.js';
import {getSensor} from '../trainer/generator/sensors.js';
import {specimenPair} from '../trainer/plants/portrait.js';
import {formsFor} from '../trainer/plants/forms.js';

const forms = formsFor('apple');
const seeds = [0, 1733, 542913, 827153];
const epsilon = 1e-10;

function tree(seed, form, plantArchitecture, canopy = 'leafy') {
  return specimenPair('apple', forms, {seed, form, plantArchitecture, canopy, radius:1.18});
}

function positionOnStem(point, stem) {
  const delta = stem.slice(0,3).map((start, i) => stem[i+3] - start);
  const offset = delta.map((_, i) => point[i] - stem[i]);
  const t = delta.reduce((sum, d, i) => sum + d*offset[i], 0) / Math.hypot(...delta)**2;
  const distance = Math.hypot(...delta.map((d,i) => offset[i] - t*d));
  return t >= -epsilon && t <= 1+epsilon && distance < epsilon ? t : null;
}

test('v2 and v3 apple forms retain the previous cut and intact wood and leaves', () => {
  // All organ dimensions and coordinates before introducing heterogeneous scaffolds.
  const expected = {
    'central-leader': ['6ebe2cb9b9031dead99658427b2127c5d7879b024f712b0bc63d71238b816f94',
      '9b3cf2de875ce5cd6455c504ff5b0de1685fbdf38e465856f5cf1161d4d66b3d'],
    'open-vase': ['0f539fd915a1df9a439fbf0746c1310aab08adda15e6f54471344fe5161f6e6b',
      '2be553e522ff62c0aab83513ff630d38b0fdc8f527c45324e619074006854e9c']
  };
  for (const {id} of forms) for (const version of [2,3]) {
    const {intact, damaged} = tree(542913, id, version);
    const signatures = [intact,damaged].map(organs => {
      const rounded = organs.map(([kind,args]) => [kind,...args.map(n => n.toFixed(9))]);
      return createHash('sha256').update(JSON.stringify(rounded)).digest('hex');
    });
    assert.deepEqual(signatures, expected[id]);
  }
});

test('v4 preserves branch paths and foliage and replays each scaffold hierarchy', () => {
  for (const {id} of forms) {
    const weakestIndices = new Set();
    for (const seed of seeds) {
      const old = tree(seed,id,3), current = tree(seed,id,4);
      assert.deepEqual(tree(seed,id,4), current);
      for (const condition of ['intact','damaged']) {
        const paths = organs => organs.map(([kind,args]) => [kind,kind==='stem' ? args.slice(0,6) : args]);
        assert.deepEqual(paths(current[condition]), paths(old[condition]));
      }
      const wood = current.intact.filter(([kind]) => kind==='stem').map(([,args]) => args);
      const oldWood = old.intact.filter(([kind]) => kind==='stem').map(([,args]) => args);
      assert.deepEqual(tree(seed,id,4,'dormant').intact, wood.map(args => ['stem',args]));
      assert.deepEqual(wood[0],oldWood[0]);
      const scales = [];
      for (let i=1; i<wood.length; i++) {
        const limb = wood[i];
        if (positionOnStem(limb,wood[0]) !== null) scales.push(limb[6]/oldWood[i][6]);
      }
      assert.ok(scales.length >= (id==='open-vase' ? 3 : 7));
      assert.ok(Math.min(...scales) >= .35-epsilon && Math.min(...scales) <= .80+epsilon);
      assert.ok(Math.abs(Math.max(...scales)-1) < epsilon);
      assert.equal(new Set(scales).size, scales.length);
      weakestIndices.add(scales.indexOf(Math.min(...scales)));
    }
    assert.ok(weakestIndices.size > 1, 'different seeds can assign dominance to different limbs');
  }
});

test('v4 daughter wood fits the local parent radius and a cut preserves its original taper', () => {
  for (const {id} of forms) for (const seed of seeds) {
    const {intact, damaged} = tree(seed,id,4,'dormant');
    const wood = intact.map(([,args]) => args);
    const depth = [0];
    for (let i=1; i<wood.length; i++) {
      const limb = wood[i];
      const parentIndex = wood.slice(0,i).findIndex(parent => positionOnStem(limb,parent) !== null);
      assert.ok(parentIndex >= 0, 'every stem joins earlier wood');
      const parent = wood[parentIndex];
      depth[i] = depth[parentIndex]+1;
      const t = positionOnStem(limb,parent);
      const parentRadius = parent[6] + t * (parent[7]-parent[6]);
      assert.ok(limb[7] > 0 && limb[7] < limb[6]);
      const allowedRatio = depth[i]===3 ? .70 : 1;
      assert.ok(limb[6] <= allowedRatio*parentRadius + epsilon, 'daughter is sized to its parent at the joint');
    }
    assert.ok(depth.includes(3), 'checks primary limbs, secondary wood and shoots');
    const intactShapes = new Set(intact.map(organ => JSON.stringify(organ)));
    const changed = damaged.filter(organ => !intactShapes.has(JSON.stringify(organ)));
    assert.equal(changed.length,1,'surviving branches replay exactly, except for the cut limb');
    const stub = changed[0][1];
    const limb = wood.find(branch => branch.slice(0,3).every((coord,i) => coord===stub[i]));
    assert.ok(limb);
    assert.ok(Math.abs(positionOnStem(stub.slice(3,6),limb)-.36) < epsilon);
    assert.equal(stub[6],limb[6]);
    assert.ok(Math.abs(stub[7] - (limb[6] + .36*(limb[7]-limb[6]))) < epsilon);
  }
});

test('the orchard field sampler sees the new wood on the same seeded planting', () => {
  const recipe = {...makeRecipe(827153,true,getSensor('reference'),'apple',4,'open-vase','healthy'),
    appleCanopy:'dormant', points:3500};
  const old = field({...recipe,plantArchitecture:3});
  const current = field(recipe);
  const replay = field(JSON.parse(JSON.stringify(current.p)));
  const bases = scan => scan.labels.boxes.map(box => box.base_xy_m);
  assert.deepEqual(bases(current),bases(old));
  assert.deepEqual(current.skeleton,old.skeleton);
  assert.notEqual(current.labels.tile_id,old.labels.tile_id);
  assert.notDeepEqual(current.xyz,old.xyz);
  assert.deepEqual(replay.xyz,current.xyz);
  assert.deepEqual(replay.labels,current.labels);
});
