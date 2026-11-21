// A cultivated globe artichoke has a divided rosette and can bear flower buds.
const spiral = Math.PI * (3 - Math.sqrt(5));

export function artichoke({x, y, z, radius, random, leaf, stem, ellipsoid, damaged, plantArchitecture, form = 'single-bud'}) {
  const phase = random() * 2 * Math.PI;
  const vegetative = form === 'rosette';
  const count = (vegetative ? 8 : 11) + Math.floor(3 * random());
  const spread = radius * (vegetative ? .77 : 1);
  if (vegetative && plantArchitecture >= 3) {
    // The compact vegetative axis joins the stacked rosette leaf bases to the soil.
    stem(x, y, z, x, y, z + .27 * radius, .067 * radius, .040 * radius);
  }
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = phase + spiral * i + .25 * (random() - .5);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const reach = spread * (.95 - .31 * t) * (.9 + .18 * random());
    const baseZ = z + radius * (.05 + .22 * t);
    const rise = radius * (.07 + .44 * t), arch = radius * (.25 + .09 * random());
    // Deep divisions leave a narrow midrib between pairs of outward-pointing lobes.
    const stripped = damaged && Math.cos(angle - phase) > .44;
    if (!stripped) leaf(x, y, baseZ, x + reach * dx, y + reach * dy, baseZ + rise, .074 * reach, arch, 3);
    for (const along of [.26, .50, .72]) {
      const midX = x + reach * along * dx, midY = y + reach * along * dy;
      const midZ = baseZ + rise * along + arch * 4 * along * (1 - along);
      const spread = reach * (.30 - .16 * along);
      for (const side of [-1, 1]) {
        const lateral = side * spread * (.90 + .20 * random());
        if (!stripped) leaf(midX, midY, midZ, midX + .15 * reach * dx - lateral * dy,
          midY + .15 * reach * dy + lateral * dx, midZ - .035 * radius, .07 * reach, .05 * radius, 2);
      }
    }
  }

  if (vegetative) return;

  // A closed terminal flower head. Overlapping bracts emerge from successive collars.
  const headX = x + radius * .11 * Math.cos(phase), headY = y + radius * .11 * Math.sin(phase);
  const headZ = z + radius * (.95 + .24 * random()), size = radius * (.14 + .04 * random());
  stem(x, y, z, headX, headY, headZ, .067 * radius, .042 * radius);
  // A removed terminal head leaves its exposed stalk and any lateral buds.
  if (!damaged) bud(headX, headY, headZ, size, phase);
  if (form === 'branched-buds') {
    // The central head is higher and larger than the lateral heads.
    for (const side of [-1, 1]) {
      const angle = phase + side * (1.1 + .3 * random());
      const branchX = headX + .41 * radius * Math.cos(angle);
      const branchY = headY + .41 * radius * Math.sin(angle);
      const branchZ = headZ - radius * (.20 + .09 * random());
      stem(x + (headX-x)*.48, y + (headY-y)*.48, (z+headZ)*.5,
        branchX, branchY, branchZ, .038 * radius, .025 * radius);
      bud(branchX, branchY, branchZ, size * (.66 + .14 * random()), angle);
    }
  }

  function bud(cx, cy, cz, scale, rotation) {
    ellipsoid(cx, cy, cz, .74 * scale, .74 * scale, .99 * scale);
    for (let i = 0; i < 15; i++) {
      const tier = i / 14, angle = rotation + spiral * i;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const collar = -.82 + 1.21 * tier;
      let root = scale * (.43 + .34 * Math.sin(Math.PI * tier));
      if (plantArchitecture >= 3) {
        // An ellipsoid narrows toward each pole. Seat this bract slightly
        // inside the core's horizontal section at the actual collar height.
        root = Math.min(root, .99 * .74 * scale * Math.sqrt(1 - (collar / .99) ** 2));
      }
      const tip = scale * (1.05 - .72 * tier);
      leaf(cx + dx * root, cy + dy * root, cz + scale * collar,
        cx + dx * tip, cy + dy * tip, cz + scale * (.08 + .99 * tier),
        scale * (.36 - .09 * tier), scale * .1);
    }
  }
}
