import assert from 'node:assert/strict';
import test from 'node:test';
import {trainNetworkCPU} from '../trainer/models/neural.js';

test('changing only the final label contributes its exact logistic gradient', async () => {
  const count = 1057; // 33 complete batches of 32 and one final row.
  const x = new Float32Array(count);
  x[count - 1] = 1;
  const labels = new Float32Array(count);
  const flipped = labels.slice();
  flipped[count - 1] = 1;

  for (const batchSize of [32, 0]) {
    const options = {dims:1, hiddenLayers:[], epochs:1, lr:.25, batchSize};
    const a = await trainNetworkCPU(x, labels, options);
    const b = await trainNetworkCPU(x, flipped, options);
    // A 0→1 label flip changes the logit gradient by -1. SGD divides by
    // the actual update's sample count. The final input is 1, so the input weight and bias change equally.
    const expected = options.lr / (batchSize === 0 ? count : 1);
    for (let i = 0; i < 2; i++) {
      const delta = b.weights[i] - a.weights[i];
      assert.ok(Math.abs(delta - expected) < 1e-6, `batch ${batchSize}, parameter ${i}: ${delta}`);
    }
  }
});
