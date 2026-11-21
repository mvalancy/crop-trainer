// Yield one planting at a time. Legacy plants use the same random stream
// while growing, before the next position is drawn.
export function* plantingRow(recipe, profile, row, random, size = 10) {
  const lettuce = (recipe.crop ?? 'lettuce') === 'lettuce';
  const y = lettuce ? 1.5 + (row >> 1) * 2.1 + (row % 2) * .36 : (row + .5) * size / profile.rows;
  const phase = random() * (2 * Math.PI);
  const edge = lettuce ? .25 : recipe.radius * 1.45;
  const end = lettuce ? 9.74 : size - edge;
  for (let x = edge + random() * .12; x < end; x += recipe.spacing) {
    if (random() < .05) continue;
    yield {
      x: x + (random() - .5) * .04,
      y: y + .035 * Math.sin(x + phase) + (random() - .5) * .024,
      radius: recipe.radius * (.8 + .4 * random())
    };
  }
}
