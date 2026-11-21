// Vertical first returns from oriented organs. Every surface uses the same
// nearest-hit buffer as the terrain, neighboring plants and field fixtures.
const widthProfiles = new Map();
function bladeProfile(lobes) {
  if (widthProfiles.has(lobes)) return widthProfiles.get(lobes);
  const steps = Math.max(16, 8 * lobes);
  const profile = Float64Array.from({length: steps + 1}, (_, i) => {
    const t = i / steps;
    if (!i || i === steps) return 0;
    return Math.sin(Math.PI * t) ** .72 * (1 - .27 * Math.sin(lobes * Math.PI * t) ** 2);
  });
  widthProfiles.set(lobes, profile);
  return profile;
}

export function plantSurfaces(rays, write, skeleton, bounds) {
  const {min, max} = bounds;
  function include(x, y, z, rx = 0, ry = 0, rz = 0) {
    min[0] = Math.min(min[0], x - rx); max[0] = Math.max(max[0], x + rx);
    min[1] = Math.min(min[1], y - ry); max[1] = Math.max(max[1], y + ry);
    min[2] = Math.min(min[2], z - rz); max[2] = Math.max(max[2], z + rz);
  }

  function ellipsoid(x, y, z, rx, ry, rz, angle = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    include(x, y, z, Math.hypot(rx*c, ry*s), Math.hypot(rx*s, ry*c), rz);
    rays(x, y, Math.max(rx, ry), (i, dx, dy) => {
      const u = (c*dx + s*dy) / rx, v = (c*dy - s*dx) / ry;
      const depth = 1 - u*u - v*v;
      if (depth >= 0) write(i, z + rz * Math.sqrt(depth), 3);
    });
  }

  // A truncated cone with two flat caps, in the local frame of the branch.
  // The implicit cone gives up to two intersections along one vertical ray.
  function stem(ax, ay, az, bx, by, bz, base, tip) {
    const dx = bx-ax, dy = by-ay, dz = bz-az, length = Math.hypot(dx, dy, dz);
    if (!length) return;
    skeleton.push(ax, ay, az, bx, by, bz);
    const nx = dx/length, ny = dy/length, nz = dz/length;
    const ex = Math.hypot(ny,nz), ey = Math.hypot(nx,nz), ez = Math.hypot(nx,ny);
    include(ax, ay, az, base*ex, base*ey, base*ez);
    include(bx, by, bz, tip*ex, tip*ey, tip*ez);
    const slope = (tip-base)/length, factor = 1+slope*slope, qa = 1-factor*nz*nz;
    const span = Math.max(Math.abs(dx),Math.abs(dy))/2 + Math.max(base,tip);
    rays(ax+dx/2, ay+dy/2, span, (i, mx, my) => {
      const x = mx+dx/2, y = my+dy/2, r2 = x*x+y*y;
      const along = x*nx+y*ny, qb = -2*nz*(factor*along + base*slope);
      const qc = r2 - along*along - (base+slope*along)**2;
      let top = -Infinity;
      function side(h) {
        const t = along + nz*h;
        if (t >= 0 && t <= length) top = Math.max(top,h);
      }
      if (Math.abs(qa) < 1e-10) {
        if (Math.abs(qb) > 1e-12) side(-qc/qb);
      } else {
        const discriminant = qb*qb-4*qa*qc;
        if (discriminant >= 0) {
          const root = Math.sqrt(discriminant);
          side((-qb+root)/(2*qa)); side((-qb-root)/(2*qa));
        }
      }
      if (Math.abs(nz) > 1e-10) {
        const start = -along/nz, end = (length-along)/nz;
        if (r2+start*start <= base*base) top = Math.max(top,start);
        if ((x-dx)**2+(y-dy)**2+(end-dz)**2 <= tip*tip) top = Math.max(top,end);
      }
      if (Number.isFinite(top)) write(i,az+top,1);
    });
  }

  // Sweep a blade profile along an arched midrib; the margins curl upwards.
  function leaf(ax, ay, az, bx, by, bz, halfWidth, arch = 0, lobes = 0) {
    const dx = bx-ax, dy = by-ay, length = Math.hypot(dx,dy);
    if (!length || !halfWidth) return;
    const cx = dx/length, cy = dy/length;
    const profile = bladeProfile(lobes), steps = profile.length-1;
    for (let k=0; k<=steps; k++) {
      const t=k/steps, width=halfWidth*profile[k];
      include(ax+dx*t,ay+dy*t,az+(bz-az)*t,Math.abs(cy)*width,Math.abs(cx)*width);
    }
    // The edge and midrib elevations are quadratics, including their extrema.
    for (const bend of [arch, arch+.12*halfWidth]) {
      if (!bend) continue;
      const t = .5 + (bz-az)/(8*bend);
      if (t>0 && t<1) {
        const z=az+(bz-az)*t+4*bend*t*(1-t);
        min[2]=Math.min(min[2],z); max[2]=Math.max(max[2],z);
      }
    }
    const span = Math.max(Math.abs(dx)/2+Math.abs(cy)*halfWidth, Math.abs(dy)/2+Math.abs(cx)*halfWidth);
    rays(ax+dx/2, ay+dy/2, span, (i, mx, my) => {
      const t = .5+(mx*cx+my*cy)/length;
      if (t<=0 || t>=1) return;
      const slot=t*steps, k=Math.floor(slot);
      const width=halfWidth*(profile[k]+(slot-k)*(profile[k+1]-profile[k]));
      const across = (-mx*cy+my*cx)/width;
      if (Math.abs(across)<=1) write(i,az+(bz-az)*t+4*t*(1-t)*(arch+.12*halfWidth*across*across),2);
    });
  }
  return {ellipsoid, stem, leaf};
}
