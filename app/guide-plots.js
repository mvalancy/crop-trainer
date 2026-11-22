// Chart homogeneous numeric columns without interpreting signs, ratios or mixed units.
function seriesFor(table) {
  const headers=[...(table.tHead?.rows[0]?.cells || [])].map(c=>c.textContent.trim());
  const rows=[...(table.tBodies[0]?.rows || [])].map(r=>[...r.cells].map(c=>c.textContent.trim()));
  if (rows.length<2 || !headers[0] || rows.some(r=>r.length!==headers.length || !r[0])) return [];
  const result=[];
  for (let column=1;column<headers.length;column++) {
    const points=rows.map(row=>{
      const raw=row[column];
      const match=raw.match(/^([+−-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?))\s*(%|points|mm|cm|m|ms|s)?$/);
      if (!match) return null;
      return {name:row[0],raw,value:Number(match[1].replaceAll(',','').replace('−','-')),unit:match[2] || ''};
    });
    if (points.every(p=>p && p.unit===points[0].unit) && headers[column]) result.push({title:headers[column],points});
  }
  return result;
}

export function installGuidePlots(chapter) {
  for (const table of chapter.querySelectorAll('.guideTable table')) {
    const series=seriesFor(table);
    if (!series.length) continue;
    const chart=document.createElement('details');
    chart.className='guidePlot';
    chart.innerHTML='<summary>Plot these values</summary><label>Measure <select></select></label><div class="plotRows"></div>';
    table.closest('.guideTable').after(chart);
    const select=chart.querySelector('select');
    series.forEach(({title},i)=>select.add(new Option(title,String(i))));
    const bars=chart.querySelector('.plotRows');
    function draw() {
      const {points}=series[Number(select.value)];
      const low=Math.min(0,...points.map(p=>p.value)), high=Math.max(0,...points.map(p=>p.value));
      const span=high-low || 1;
      bars.replaceChildren(...points.map(({name,raw,value})=>{
        const row=document.createElement('div');
        row.className='plotRow';
        const label=document.createElement('span'); label.textContent=name;
        const bar=document.createElement('span'); bar.className='plotBar'; bar.setAttribute('aria-hidden','true');
        const mark=document.createElement('i');
        mark.style.left=(Math.min(0,value)-low)/span*100+'%';
        mark.style.width=Math.abs(value)/span*100+'%';
        bar.style.setProperty('--zero',(-low/span*100)+'%');
        bar.append(mark);
        const number=document.createElement('strong'); number.textContent=raw;
        row.append(label,bar,number);
        return row;
      }));
    }
    chart.addEventListener('toggle',()=>{if(chart.open && !bars.childElementCount) draw();});
    select.addEventListener('change',draw);
  }
}
