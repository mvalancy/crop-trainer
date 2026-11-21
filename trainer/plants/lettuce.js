// Leaf angles, dimensions and organ counts are seeded approximations in metres.
const spiral = Math.PI * (3 - Math.sqrt(5));

const lettuceForms = {
  looseleaf: {leaves:17, spread:1, inner:.23, height:.62, width:.31, lobes:5, outerRise:.13, collar:.06},
  butterhead: {leaves:24, spread:.91, inner:.11, height:.85, width:.36, lobes:2, outerRise:.24, collar:.22},
  romaine: {leaves:16, spread:.84, inner:.23, height:1.58, width:.21, lobes:1, outerRise:.46, collar:.09}
};

function lettuceRosette({x, y, z, radius, random, leaf, stem, damaged, plantArchitecture}, form) {
  const phase = random() * 2 * Math.PI;
  const leaves = form.leaves + Math.floor(4 * random());
  const aspect = .82 + .15 * random();
  const height = radius * form.height * (.92 + .18 * random());
  stem(x, y, z, x, y, z + .48 * height, .065 * radius, .04 * radius);

  for (let i = 0; i < leaves; i++) {
    const inward = i / (leaves - 1);
    const angle = phase + spiral * i + .24 * (random() - .5);
    const dx = Math.cos(angle), dy = aspect * Math.sin(angle);
    // Broad ruffled blades stay open on loose-leaf types. Butterhead's inner
    // blades fold in over the heart; romaine keeps a tight column of long blades.
    const reach = radius * (form.spread * (1 - inward) + form.inner * inward) * (.9 + .16 * random());
    const start = radius * (.035 + form.collar * inward);
    const width = radius * form.width * (1 - .47 * inward) * (.86 + .26 * random());
    const baseZ = z + height * (.05 + .42 * inward);
    const tipZ = z + height * (form.outerRise + (1 - form.outerRise) * inward + .12 * random());
    // Remove exterior blades in one sector and shorten its neighbor. Decide
    // after sampling shape so damage never moves the surviving leaves.
    const exposure = Math.cos(angle - phase);
    if (damaged && inward < .78 && exposure > .59) continue;
    const torn = damaged && inward < .68 && exposure > .17;
    const tip = torn ? start + .56 * (reach - start) : reach;
    if (plantArchitecture >= 3) {
      // A short basal petiole connects each blade collar to this plant’s own stem.
      stem(x, y, baseZ, x + start * dx, y + start * dy, baseZ, .030 * radius, .016 * radius);
    }
    leaf(x + start * dx, y + start * dy, baseZ, x + tip * dx, y + tip * dy,
      torn ? baseZ + .59 * (tipZ - baseZ) : tipZ, torn ? width * .76 : width,
      height * (.21 - .1 * inward), form.lobes);
  }
}

export function lettuce(ctx) { lettuceRosette(ctx, lettuceForms[ctx.form ?? 'looseleaf']); }
export function benchLettuce(ctx) { lettuceRosette(ctx, lettuceForms[ctx.form ?? 'butterhead']); }
