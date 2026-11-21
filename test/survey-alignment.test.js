import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreSurveyShifts} from '../trainer/field-test/survey-alignment.js';
import {evaluatePins} from '../trainer/field-test/references.js';

const point = (localX, localY) => Object.freeze({localX, localY, x:801000+localX, y:934000+localY});

test('fixed translations move survey centers, keep their order and use plot-local metres', () => {
  const pins = Object.freeze([point(1.25, 1)]);
  const centers = Object.freeze([point(1, 1)]);
  assert.deepEqual(scoreSurveyShifts(pins, centers, 10, 25).map(r=>[r.dxCm,r.dyCm,r.matched]), [
    [0,0,0], [25,0,1], [-25,0,0], [0,25,0], [0,-25,0]
  ]);
});

test('recorded and shifted counts follow official one-to-one matching, including boundary and crowded cases', () => {
  const pins = [point(.1,0), point(0,.04), point(9.99,9.99)];
  const centers = [point(.06,0), point(.16,0), point(9.99,9.99)];
  for (const distance of [7.5, 10, 15]) {
    for (const shift of [10, 25]) {
      for (const row of scoreSurveyShifts(pins,centers,distance,shift)) {
        const shifted = centers.map(p=>point(p.localX+row.dxCm/100, p.localY+row.dyCm/100));
        assert.equal(row.matched, evaluatePins(pins,shifted).scores.find(s=>s.cm === distance).tp);
      }
    }
  }
  assert.equal(scoreSurveyShifts(pins,centers,10,10)[0].matched, 3);
  assert.equal(scoreSurveyShifts([pins[2]],[centers[2]],10,10)[1].matched, 1);
  assert.equal(scoreSurveyShifts([pins[0]],[pins[0],pins[0]],7.5,25)[0].matched, 1);
});

test('empty detections and unsupported check distances are handled explicitly', () => {
  for (const [pins, centers] of [[[], [point(1,2)]], [[point(1,2)], []]]) {
    assert.deepEqual(scoreSurveyShifts(pins,centers,15,25).map(r=>r.matched), [0,0,0,0,0]);
  }
  assert.throws(()=>scoreSurveyShifts([],[],20,10), /match distance/);
  assert.throws(()=>scoreSurveyShifts([],[],10,9), /survey shift/);
});
