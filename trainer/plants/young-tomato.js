// Vegetative tomato plants, before fruit set. Organ dimensions and counts vary
// procedurally within each growth stage. The seedling retains both cotyledons.
export function youngTomato({x, y, z, radius, random, stem, leaf, damaged, form = 'transplant'}) {
  const phase = random() * 2 * Math.PI;
  const seedling = form === 'seedling', branching = form === 'branching';
  const spread = radius * (seedling ? .48 : 1);
  const height = spread * (1.45 + .35 * random()) * (branching ? 1.20 : 1);
  const leanX = spread * .15 * Math.cos(phase), leanY = spread * .15 * Math.sin(phase);
  // A snapped shoot ends shortly above its last surviving node.
  const tip = damaged ? .76 : 1;
  stem(x, y, z, x + tip * leanX, y + tip * leanY, z + tip * height,
    .032 * spread, (damaged ? .016 : .009) * spread);

  if (seedling || (!branching && random() < .65)) {
    for (const side of [-1, 1]) {
      const dx = side * Math.sin(phase), dy = -side * Math.cos(phase);
      const baseX = x + .19 * leanX, baseY = y + .19 * leanY;
      const reach = spread * (seedling ? .65 : .27);
      leaf(baseX, baseY, z + .19 * height, baseX + dx * reach,
        baseY + dy * reach, z + .21 * height, .17 * reach, .06 * reach);
    }
  }

  const count = (seedling ? 2 : branching ? 7 : 5) + Math.floor(2 * random());
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), node = .32 + .65 * t;
    const angle = phase + i * 2.4 + .28 * (random() - .5);
    const reach = spread * (1 - .7 * t) * (.90 + .15 * random());
    compoundLeaf(x + node * leanX, y + node * leanY, z + node * height,
      angle, reach, reach * (.05 + .35 * t), seedling ? 1 : 3, node <= tip);
  }

  if (branching) {
    // A lateral shoot rises from a leaf axil, carrying a separate set of leaves.
    const node = .32, angle = phase + .24;
    const baseX = x + leanX * node, baseY = y + leanY * node, baseZ = z + height * node;
    const dx = .58 * spread * Math.cos(angle), dy = .58 * spread * Math.sin(angle), dz = .48 * height;
    stem(baseX, baseY, baseZ, baseX + dx, baseY + dy, baseZ + dz, .025 * spread, .007 * spread);
    for (let i = 0; i < 3; i++) {
      const t = .40 + .28 * i, reach = spread * (.65 - .15 * i);
      compoundLeaf(baseX + t * dx, baseY + t * dy, baseZ + t * dz,
        angle + 1 + i * 2.4, reach, .14 * reach, 2);
    }
  }

  function compoundLeaf(baseX, baseY, baseZ, angle, reach, rise, pairs, intact = true) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    if (intact) stem(baseX, baseY, baseZ, baseX + .77 * reach * dx, baseY + .77 * reach * dy,
      baseZ + .77 * rise, .023 * reach, .009 * reach);
    for (let i = 0; i < pairs; i++) {
      const along = .34 + .20 * i;
      for (const side of [-1, 1]) {
        const offset = along + .04 * (random() - .5);
        const px = baseX + dx * reach * offset, py = baseY + dy * reach * offset;
        const pz = baseZ + rise * offset;
        const span = reach * (.31 - .10 * along) * (.87 + .23 * random());
        if (intact) leaf(px, py, pz, px + span * (.45 * dx - side * dy),
          py + span * (.45 * dy + side * dx), pz - .11 * span, span * .28, span * .12, 2);
      }
    }
    if (intact) leaf(baseX + .75 * reach * dx, baseY + .75 * reach * dy, baseZ + .75 * rise,
      baseX + 1.11 * reach * dx, baseY + 1.11 * reach * dy, baseZ + rise + .06 * reach,
      .108 * reach, .035 * reach, 2);
  }
}
