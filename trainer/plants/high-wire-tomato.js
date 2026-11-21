// Fruiting single leaders follow Alabama Extension ANR-2955 figs. 2–3.
// Ontario Publication 836 fig. 3 shows two leaders from one planted base.
// Heights, organ counts and angles are procedural choices in metres.
export function highWireTomato(ctx) {
  const {x, y, z, radius, random, stem, form='single-leader', damaged=false} = ctx;
  const young = form === 'young-leader', twin = form === 'twin-leader';
  const vigor = random(), spread = .80+.34*random();
  const height = young ? .44+.32*vigor : 1.65+.51*vigor;
  const forkHeight = twin ? .09+.08*random() : 0;
  if (twin) stem(x, y, z, x, y, z+forkHeight, .016, .013);
  const leaders = twin ? 2 : 1;
  for (let head=0; head<leaders; head++) {
    let lean = radius*(1.10+.72*random());
    if (young) lean *= .23;
    if (twin) lean *= head===0 ? -.66 : .80;
    const phase = 2*Math.PI*random(), skew = .07*(random()-.5);
    const nodes = (young ? 5 : 9)+Math.floor(3*random());
    const rise = (height-forkHeight)*(.94+.06*random());
    const breakNode = nodes-1-Math.floor(.25*nodes*random());
    const broken = damaged && head===leaders-1;
    const firstLeaf = young ? 2 : 3+Math.floor(2*random());
    let previous = [x,y,z+forkHeight];
    for (let i=1; i<=nodes; i++) {
      const t = i/nodes;
      // Lowered stems bend along the row. Upper internodes turn upright
      // under the fixed support wire. Twin heads fan out from the same fork.
      const cx = x+lean*t*(2-t);
      const cy = y+skew*t+.02*Math.sin(Math.PI*t), cz = z+forkHeight+rise*t;
      const node = [cx,cy,cz];
      const baseRadius = (young ? .008 : .013)*(1-.46*(i-1)/nodes);
      const tipRadius = (young ? .008 : .013)*(1-.46*t);
      if (broken && i===breakNode) {
        const stub = previous.map((v, axis) => v+.36*(node[axis]-v));
        stem(...previous, ...stub, baseRadius, tipRadius);
        break;
      }
      stem(...previous, ...node, baseRadius, tipRadius);
      previous = node;
      if (i<firstLeaf) continue;

      const angle = phase+i*2.39996+.42*(random()-.5);
      const reach = radius*spread*(.85+.24*random())*(1-.47*t*t)*(young ? .63 : 1);
      compoundLeaf(ctx, node, reach, angle, (.11*(1-t)+.012)*(young ? .55 : 1));
      if (!young && i%3===0 && i<nodes-1) fruitTruss(ctx, node, angle+1.5, t);
    }
  }
}

function compoundLeaf({random, stem, leaf}, [cx, cy, cz], reach, angle, drop) {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const bow = .03, mx = cx+.5*reach*ux, my = cy+.5*reach*uy, mz = cz+bow;
  const tipX = cx+reach*ux, tipY = cy+reach*uy, tipZ = cz-drop;
  stem(cx, cy, cz, mx, my, mz, .005, .003);
  stem(mx, my, mz, tipX, tipY, tipZ, .003, .002);
  for (let pair=0; pair<2; pair++) {
    for (const side of [-1,1]) {
      const u = (pair===0 ? .31 : .68)+.065*(random()-.5);
      const lx = cx+reach*u*ux, ly = cy+reach*u*uy;
      const lz = u<.5 ? cz+2*u*bow : mz+(2*u-1)*(tipZ-mz);
      const lateral = reach*(.35+.08*random())*(1-.23*pair);
      const forward = reach*(.19+.05*random());
      leaf(lx, ly, lz, lx+forward*ux-side*lateral*uy, ly+forward*uy+side*lateral*ux,
        lz-.035-.025*random(), .32*lateral, .018, 1);
    }
  }
  leaf(tipX, tipY, tipZ, tipX+reach*.26*ux, tipY+reach*.26*uy, tipZ-.046,
    .115*reach, .012, 1);
}

function fruitTruss({random, stem, ellipsoid}, [cx, cy, cz], angle, t) {
  const vx = Math.cos(angle), vy = Math.sin(angle);
  const fx = cx+.09*vx, fy = cy+.09*vy, fz = cz-.018;
  stem(cx, cy, cz, fx, fy, fz, .006, .004);
  const nFruit = 3+Math.floor(3*random()), stalkLength = nFruit*.022;
  stem(fx, fy, fz, fx+vx*stalkLength, fy+vy*stalkLength, fz-nFruit*.037, .004, .002);
  for (let k=1; k<=nFruit; k++) {
    const size = (.030+.014*random())*(1-.22*t);
    const tx = fx+vx*k*.022, ty = fy+vy*k*.022, tz = fz-k*.037;
    const offset = (k%2 ? -1 : 1)*size*.85;
    const ex = tx-vy*offset, ey = ty+vx*offset;
    stem(tx, ty, tz, ex, ey, tz-.015, .002, .002);
    ellipsoid(ex, ey, tz-.015-.85*size, size, size, size*.85);
  }
}
