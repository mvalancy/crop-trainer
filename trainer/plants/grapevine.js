// VSP fruiting wall from AgriLife EHT-121 fig. 2. UGA B1505 fig. 6 shows
// the woody bilateral cordon after spur pruning. Dimensions are assumptions.
export function grapevine({x, y, z, radius, random, stem, leaf, ellipsoid, form='bilateral-cordon', damaged=false}) {
  const unilateral = form === 'unilateral-cordon';
  const vigor = .76+.42*random(), spread = .75+.5*random();
  const cordonZ = z+.82+.18*random();
  const headX = x+.19*(random()-.5), headY = y+.09*(random()-.5);
  const bend = [x+.10*(random()-.5), y+.05*(random()-.5), z+.44];
  const head = [headX, headY, cordonZ];
  stem(x, y, z, ...bend, .047, .037);
  stem(...bend, ...head, .037, .03);

  // Draw all woody positions before growing the shoots. The dormant and
  // fruiting bilateral vines therefore share their exact trunk, arms and spurs.
  const shoots = [];
  for (const side of unilateral ? [1] : [-1, 1]) {
    const armLength = radius*(.76+.23*random())*(unilateral ? 1.8 : 1);
    const spurs = (unilateral ? 5 : 3)+Math.floor((unilateral ? 3 : 2)*random());
    const breakAt = 1+Math.floor(.4*spurs*random());
    let previous = head;
    for (let i=0; i<spurs; i++) {
      const along = (i+.65+.27*random())/spurs;
      const node = [headX+side*along*armLength, headY+.055*(random()-.5), cordonZ+.07*(random()-.5)];
      const thickness = .027-.014*along;
      const sx = node[0]+.04*(random()-.5), sy = node[1]+.04*(random()-.5);
      const sz = node[2]+.045+.035*random();
      if (damaged && side===1 && i>=breakAt) {
        if (i===breakAt) {
          const stump = previous.map((v, axis) => v+.4*(node[axis]-v));
          stem(...previous, ...stump, thickness+.004, thickness);
        }
      } else {
        stem(...previous, ...node, thickness+.004, thickness);
        stem(...node, sx, sy, sz, .016, .012);
        shoots.push([sx, sy, sz]);
      }
      previous = node;
    }
  }
  if (form === 'pruned-cordon') return;

  for (const [sx, sy, sz] of shoots) {
    const rise = (.64+.32*random())*vigor;
    const dx = .32*(random()-.5), dy = .19*spread*(random()-.5);
    stem(sx, sy, sz, sx+dx, sy+dy, sz+rise, .009, .004);
    const firstSide = random()<.5 ? -1 : 1;
    const nodeCount = 4+Math.floor(3*random());
    for (let j=0; j<nodeCount; j++) {
      const t = (j+.6+.22*random())/nodeCount;
      const ax = sx+dx*t, ay = sy+dy*t, az = sz+rise*t;
      const angle = (j%2 ? -1 : 1)*firstSide*Math.PI/2+1.8*(random()-.5);
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const petiole = .028+.024*random();
      const bx = ax+ux*petiole, by = ay+uy*petiole, bz = az+.015;
      stem(ax, ay, az, bx, by, bz, .004, .002);
      const length = (.14+.075*random())*(1-.28*t)*spread;
      leaf(bx, by, bz, bx+ux*length, by+uy*length, bz-.025-.06*random(), .48*length, .034, 2);
    }

    // A short hanging cluster with individual berry attachments in the fruit zone.
    if (random()<.55) {
      const fx = sx+.055*(random()-.5), fy = sy+firstSide*.06, fz = sz+.11;
      stem(sx+dx*.18, sy+dy*.18, sz+rise*.18, fx, fy, fz, .005, .003);
      stem(fx, fy, fz, fx, fy, fz-.072, .003, .001);
      const phase = 2*Math.PI*random();
      for (let k=0; k<7; k++) {
        const a = phase+k*2.39996, offset = .025*(1-k/7), berry = .014+.004*random();
        const bx = fx+offset*Math.cos(a), by = fy+offset*Math.sin(a), bz = fz-.012*k;
        stem(fx, fy, bz, bx, by, bz-.003, .0015, .001);
        ellipsoid(bx, by, bz-.003-berry, berry, berry, berry*1.13);
      }
    }
  }
}
