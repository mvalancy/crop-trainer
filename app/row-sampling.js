// Upper leaf margins traced in the 600 × 400 illustrated side view.
// The sample and the overlay use exactly the same first intersection.
export const rowPlate = new URL('../art/field-lab-row.webp',import.meta.url).href;
const outlines = [
  [[6,221],[12,196],[15,164],[24,148],[40,140],[56,141],[57,123],[72,108],[84,100],[100,98],[111,94],[122,95],[142,107],[167,100],[186,103],[202,115],[211,148],[224,141],[237,135],[251,140],[267,158],[264,168],[246,178],[236,200],[261,196],[273,201],[280,221]],
  [[410,247],[415,239],[423,237],[434,236],[446,247],[454,233],[469,229],[477,234],[475,250],[484,251],[490,256]]
];
export function sampleRow(count) {
  return Array.from({length:count},(_,i) => {
    const x = (i+.735)*600/count;
    for (const [plant,edge] of outlines.entries()) {
      // Several leaf margins may lie on the ray. Only the highest one is visible.
      let y = Infinity;
      for (let n=1;n<edge.length;n++) {
        const [a,h] = edge[n-1], [b,k] = edge[n];
        if (x >= Math.min(a,b) && x <= Math.max(a,b) && a !== b) y=Math.min(y,h+(k-h)*(x-a)/(b-a));
      }
      if (Number.isFinite(y)) return {x,y,plant};
    }
    return {x,y:282,plant:null};
  });
}
export function rayMarks(rays) {
  return rays.map(({x,y,plant},i) => `<g class="rowRay" style="--arrival:${(i/rays.length*.45).toFixed(2)}s">
    <path d="M${x} 19V${y}" fill="none" stroke="#f2f8d9" stroke-width="1.5" stroke-dasharray="4 5"/>
    <circle cx="${x}" cy="${y}" r="4.8" fill="${plant===null?'#d3baa1':'#ffe297'}" stroke="#203b30" stroke-width="1.6"/></g>`).join('');
}
