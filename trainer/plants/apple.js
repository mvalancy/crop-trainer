import {seededRandom} from './traits.js';

// The wood gets its own deterministic sequence. Picking a limb to dominate
// must never advance the sequence used for branching, leaves or pruning.
function scaffoldScales(count, heightDraw) {
  const random = seededRandom((heightDraw * 4294967296) ^ 0x1573ac93);
  const weakest = .35 + .45 * random();
  const scales = Array.from({length:count}, (_, i) => weakest + (1 - weakest) * i / (count - 1));
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [scales[i], scales[j]] = [scales[j], scales[i]];
  }
  return scales;
}

// Orchard training changes the permanent wood as well as the leaf envelope.
// Rotated ellipsoids represent leaf clusters. Dimensions are synthetic metres.
export function apple({x, y, z, radius, random, ellipsoid, stem, form, damaged, plantArchitecture}) {
  const variableWood = plantArchitecture >= 4;
  const heightDraw = random();
  const height = 2.25 + .55 * heightDraw;
  const trunkRadius = .045 + .022 * random();
  const leanX = (random() - .5) * .16;
  const leanY = (random() - .5) * .16;
  const phase = 2 * Math.PI * random();

  function leafyShoot(ax, ay, az, direction, length, rise, intact, shootBase) {
    const dx = Math.cos(direction) * length, dy = Math.sin(direction) * length;
    if (intact) stem(ax, ay, az, ax + dx, ay + dy, az + rise, shootBase, shootBase / 3);
    // Clusters overlap the woody shoot at each attachment, leaving the
    // older, proximal part of the scaffold exposed.
    for (const t of [.45, .85]) {
      const size = (.10 + .05 * random()) * radius;
      const angle = direction + (random() - .5) * .5;
      if (intact) ellipsoid(ax + t * dx, ay + t * dy, az + t * rise,
        1.25 * size, .79 * size, .86 * size, angle);
    }
  }

  if (form === 'open-vase') {
    const fork = .55 + .12 * random();
    stem(x, y, z, x, y, z + fork, trunkRadius * 1.24, trunkRadius * .85);
    const limbs = 3 + Math.floor(2 * random());
    const scales = variableWood ? scaffoldScales(limbs, heightDraw) : null;
    for (let i = 0; i < limbs; i++) {
      const intact = !damaged || i !== Math.floor(phase * limbs / (2 * Math.PI));
      const angle = phase + 2 * Math.PI * i / limbs + .3 * (random() - .5);
      const startZ = z + fork - .045 * i;
      const bx = x + .49 * radius * Math.cos(angle), by = y + .49 * radius * Math.sin(angle);
      const bz = z + height * (.45 + .07 * random());
      const remaining = intact ? 1 : .36;
      const scale = scales?.[i] ?? 1;
      const primaryBase = trunkRadius * .68 * scale;
      const primaryTip = trunkRadius * .48 * scale;
      const cutRadius = variableWood ? primaryBase + remaining * (primaryTip-primaryBase) : trunkRadius * .60;
      stem(x, y, startZ, x + remaining * (bx-x), y + remaining * (by-y),
        startZ + remaining * (bz-startZ), primaryBase, intact ? primaryTip : cutRadius);
      // Fork again near the outside of the crown. Keep both leafy heads
      // outside the center opened by removal of the original leader.
      for (const side of [-1, 1]) {
        const direction = angle + side * (.40 + .25 * random());
        const reach = radius * (.32 + .17 * random());
        const dx = reach * Math.cos(direction), dy = reach * Math.sin(direction);
        const dz = height * (.27 + .12 * random());
        const secondaryBase = trunkRadius * .40 * scale, secondaryTip = .009 * scale;
        if (intact) stem(bx, by, bz, bx + dx, by + dy, bz + dz, secondaryBase, secondaryTip);
        for (let j = 0; j < 3; j++) {
          const t = .17 + .37 * j;
          const shootAngle = direction + (j % 2 ? -side : side) * (.65 + .49 * random());
          const parentRadius = secondaryBase + t * (secondaryTip-secondaryBase);
          leafyShoot(bx + t * dx, by + t * dy, bz + t * dz, shootAngle,
            radius * (.18 + .18 * random()), .10 + .19 * random(), intact,
            variableWood ? Math.min(.012 * scale, .70 * parentRadius) : .012);
        }
      }
    }
    return;
  }

  const branchCount = 7 + Math.floor(3 * random());
  const scales = variableWood ? scaffoldScales(branchCount, heightDraw) : null;
  stem(x, y, z, x + leanX, y + leanY, z + height, trunkRadius, .009);
  for (let i = 0; i < branchCount; i++) {
    const intact = !damaged || i !== Math.floor(phase * branchCount / (2 * Math.PI));
    const tier = i / (branchCount - 1);
    const at = .23 + .63 * tier + (random() - .5) * .028;
    const ax = x + at * leanX, ay = y + at * leanY, az = z + at * height;
    const angle = phase + i * 2.40 + (random() - .5) * .58;
    const reach = radius * (1 - .64 * tier) * (.77 + .21 * random());
    const bend = angle + (random() - .5) * .47;
    const bx = ax + .51 * reach * Math.cos(angle), by = ay + .51 * reach * Math.sin(angle);
    const bz = az + reach * (.12 + .22 * random());
    const dx = .49 * reach * Math.cos(bend), dy = .49 * reach * Math.sin(bend);
    const dz = reach * (random() * .25 - .12);
    const scale = scales?.[i] ?? 1;
    const thickness = trunkRadius * (.51 - .22 * tier) * scale;
    const remaining = intact ? 1 : .36;
    const primaryTip = thickness * .72;
    const cutRadius = variableWood ? thickness + remaining * (primaryTip-thickness) : thickness * .88;
    stem(ax, ay, az, ax + remaining * (bx-ax), ay + remaining * (by-ay),
      az + remaining * (bz-az), thickness, intact ? primaryTip : cutRadius);
    const secondaryTip = .007 * scale;
    if (intact) stem(bx, by, bz, bx + dx, by + dy, bz + dz, primaryTip, secondaryTip);

    const firstSide = random() < .5 ? -1 : 1;
    for (let j = 0; j < 3; j++) {
      const t = .07 + j * .44 + random() * .05;
      const side = j % 2 ? -firstSide : firstSide;
      const direction = bend + side * (.55 + .7 * random());
      const parentRadius = primaryTip + t * (secondaryTip-primaryTip);
      leafyShoot(bx + t * dx, by + t * dy, bz + t * dz, direction,
        radius * (.16 + .13 * random()) * (1 - .32 * tier), .13 + .20 * random(), intact,
        variableWood ? Math.min(.012 * scale, .70 * parentRadius) : .012);
    }
  }
  // The growing tip carries leaves on the upper leader as well.
  ellipsoid(x + leanX, y + leanY, z + height, .09 * radius, .07 * radius, .10, phase);
}
