// Use the instrument's finished counts. A zero denominator has no percentage.
export function paintReadings(host, rows) {
  host.classList.add('fieldReadings');
  host.hidden=!rows.length;
  host.replaceChildren();
  if (!rows.length) return;
  const choice=document.createElement('label');
  choice.className='readingChoice';
  choice.append('Show ');
  const select=document.createElement('select');
  select.add(new Option('Counts','count'));
  select.add(new Option('Percentages','percent'));
  select.value=host.dataset.units || 'count';
  choice.append(select);
  const charts=rows.map(({label,parts})=>{
    const figure=document.createElement('figure'), caption=document.createElement('figcaption');
    const total=parts.reduce((n,p)=>n+p.count,0);
    caption.textContent=label+' · '+total.toLocaleString();
    const bar=document.createElement('div'),key=document.createElement('div');
    bar.className='readingBar'; key.className='readingKey';
    bar.setAttribute('aria-hidden','true');
    const labels=parts.map(({label,count,color})=>{
      const mark=document.createElement('i');
      mark.className=color;
      mark.style.width=(total ? 100*count/total : 0)+'%';
      bar.append(mark);
      const item=document.createElement('span');
      item.className=color;
      key.append(item);
      return () => {
        const value=select.value==='count' ? count.toLocaleString() : total ? (100*count/total).toFixed(1)+'%' : '—';
        item.textContent=label+' '+value;
      };
    });
    figure.append(caption,bar,key);
    return {figure,labels};
  });
  host.append(choice,...charts.map(chart=>chart.figure));
  function display() {
    host.dataset.units=select.value;
    charts.forEach(chart=>chart.labels.forEach(update=>update()));
  }
  select.addEventListener('change',display);
  display();
}

export function matchReadings({tp,fp,fn}) {
  const matches={label:'Matched',count:tp,color:'leaf'};
  return [
    {label:'Reference centers',parts:[matches,{label:'Missed',count:fn,color:'soil'}]},
    {label:'Predicted pins',parts:[matches,{label:'Extra',count:fp,color:'amber'}]}
  ];
}
