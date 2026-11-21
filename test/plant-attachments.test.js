import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {field} from '../trainer/field.js';
import {makeRecipe} from '../trainer/data.js';
import {getSensor} from '../trainer/sensors.js';
import {formsFor} from '../trainer/plants/forms.js';
import {growOrgans} from '../trainer/plants/index.js';
import {seededRandom} from '../trainer/plants/traits.js';
import {scanFixtures} from '../trainer/growing-systems.js';

function recipe(crop, seed, version, form, condition) {
  return makeRecipe(seed, true, getSensor('reference'), crop, version, form, condition);
}

function organs(crop, form, seed, damaged) {
  const shapes = [];
  const record = kind => (...args) => shapes.push({kind, args});
  growOrgans(crop, {x:0, y:0, z:0, radius:.30, plantArchitecture:3,
    random:seededRandom(seed), form, damaged,
    stem:record('stem'), leaf:record('leaf'), ellipsoid:record('ellipsoid')});
  return shapes;
}

test('plant architecture v2 replays published geometry and labels for every named crop form', () => {
  // node on 2bbb303, with millimetre quantization for geometry and labels.
  const signatures = {
    lettuce:'e5f5d6b2f0ce1d74681457b7', 'bench-lettuce':'b414ebc742b1cce80f906b7d',
    artichoke:'360707f29a3c7bbc00935137', tomato:'d60399b377b520716bdac2f9',
    grapevine:'680c0932540201f6dc11870e', 'high-wire-tomato':'e691824b30bc6781a5e90a10',
    apple:'8906428350ff3181712b3e16'
  };
  for (const [crop, expected] of Object.entries(signatures)) {
    const hash = createHash('sha256');
    for (const form of formsFor(crop)) {
      const scan = field({...recipe(crop, 34431, 2, form.id, 'mixed'), points:3500});
      for (const values of [scan.xyz, scan.skeleton]) {
        const mm = Buffer.alloc(values.length*4);
        values.forEach((v,i) => mm.writeInt32LE(Math.round(v*1000),4*i));
        hash.update(mm);
      }
      hash.update(scan.cls).update(scan.parts);
      hash.update(JSON.stringify(scan.labels, (_,v) => typeof v==='number' ? Math.round(v*1000)/1000 : v));
      hash.update(JSON.stringify(scan.plantReturns));
    }
    assert.equal(hash.digest('hex').slice(0,24), expected, crop);
  }
});

test('v3 lettuce blades attach to petioles on their own planted stem', () => {
  for (const crop of ['lettuce','bench-lettuce']) for (const form of formsFor(crop)) {
    for (const seed of [17,36001,92753]) for (const damaged of [false,true]) {
      const shapes = organs(crop, form.id, seed, damaged);
      const [trunk, ...leaves] = shapes;
      assert.equal(trunk.kind,'stem');
      assert.ok(leaves.length > 0 && leaves.length % 2 === 0);
      for (let i=0; i<leaves.length; i+=2) {
        const [stalk,blade] = leaves.slice(i,i+2);
        assert.equal(stalk.kind,'stem'); assert.equal(blade.kind,'leaf');
        assert.deepEqual(stalk.args.slice(0,2),[0,0]);
        assert.ok(stalk.args[2]>=trunk.args[2] && stalk.args[2]<=trunk.args[5]);
        assert.deepEqual(stalk.args.slice(3,6),blade.args.slice(0,3));
      }
    }
  }
});

test('v3 artichoke basal leaves join a grounded axis and bract collars enter the bud core', () => {
  for (const form of formsFor('artichoke')) for (const seed of [17,36001,92753]) {
    for (const damaged of [false,true]) {
      const shapes = organs('artichoke',form.id,seed,damaged);
      if (form.id==='rosette') {
        const axis = shapes[0];
        assert.equal(axis.kind,'stem');
        assert.deepEqual(axis.args.slice(0,5),[0,0,0,0,0]);
        const bases = shapes.filter(({kind,args})=>kind==='leaf' && args[0]===0 && args[1]===0);
        assert.ok(bases.length>0);
        assert.ok(bases.every(({args})=>args[2]>=0 && args[2]<=axis.args[5]+1e-12));
      }
      shapes.forEach(({kind,args},i)=>{
        if (kind!=='ellipsoid') return;
        const [cx,cy,cz,rx,ry,rz]=args;
        const bracts=shapes.slice(i+1,i+16);
        assert.equal(bracts.length,15);
        for (const bract of bracts) {
          assert.equal(bract.kind,'leaf');
          const [x,y,z]=bract.args;
          assert.ok(Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz)<=1+1e-12);
        }
      });
    }
  }
});

test('v3 greenhouse stems meet the supporting fixture including the end of the bench', () => {
  for (const [crop,rows,expected] of [['bench-lettuce',8,.73],['high-wire-tomato',5,.19]]) {
    const scan=field({...recipe(crop,2563012070,3,'mixed','healthy'),points:2500,scanNoise:null});
    assert.equal(scan.labels.plantArchitecture,3);
    const roots=new Set();
    for (let i=0;i<scan.skeleton.length;i+=6) {
      if (scan.skeleton[i+2]===Math.fround(expected)) roots.add([scan.skeleton[i],scan.skeleton[i+1]].join(','));
    }
    let edge=false;
    for (const box of scan.labels.boxes) {
      const [x,y]=box.base_xy_m;
      if (x<.22 || x>9.78) edge=true;
      assert.ok(roots.has([Math.fround(x),Math.fround(y)].join(',')));
      const heights=[];
      // Probe the full fixture layer at the planting (cables may also cross it).
      scanFixtures(crop,rows,()=>0,(cx,cy,span,visit)=>{
        if (Math.abs(x-cx)<=span && Math.abs(y-cy)<=span) visit(0,x-cx,y-cy);
      },(_,h)=>heights.push(h),3);
      assert.ok(heights.includes(expected));
    }
    if (crop==='bench-lettuce') assert.ok(edge);
  }
});
