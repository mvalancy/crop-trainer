// Pick a repeatable proposal independently of the model score or references.
export function featureProbe({pos, X}, inputs, scores, model, featureMode) {
  if (!pos.length) return null;
  let nearest = 0, bestDistance = Infinity;
  for (const [index, [x, y]] of pos.entries()) {
    const distance = (x - 5) ** 2 + (y - 5) ** 2;
    if (distance < bestDistance) {
      nearest = index;
      bestDistance = distance;
    }
  }
  const start = nearest * model.inputs;
  const row = values => Array.from(values.subarray(start, start + model.inputs));
  return {
    xy:pos[nearest], count:pos.length, score:scores[nearest], featureMode,
    raw:row(X), inputs:row(inputs), means:[...model.scaling.means], divisors:[...model.scaling.std]
  };
}
