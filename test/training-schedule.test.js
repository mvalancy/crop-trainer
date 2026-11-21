import test from 'node:test';
import assert from 'node:assert/strict';
import {runPresets, startingPreset} from '../trainer/ui/sandbox.js';

test('new Shed visits practice for 30 seconds and benchmark replays keep their field and epoch budgets', () => {
  const preset = query => runPresets[startingPreset(new URLSearchParams(query))];
  assert.deepEqual(preset(''), {train:16, validation:8, stopMode:'time', length:0.5});
  assert.deepEqual(preset('plan=quick'), {train:6, validation:3, stopMode:'epochs', length:40});
  assert.equal(preset('utm_source=guide'), runPresets.practice);
  assert.equal(preset('plan=practice&crop=tomato&sensor=os1-32'), runPresets.practice);
  assert.equal(preset('crop=artichoke&seed=308'), runPresets.quick);
  assert.equal(preset('embed'), runPresets.quick);
  assert.equal(preset('plan=practice&epochs=100'), runPresets.quick);
});
