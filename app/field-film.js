export function initFieldFilm(practice) {
  const film=document.getElementById('film');
  const shots=[
    ['Where does the light land?','A laser samples the first surface it meets. Trace a ray down to the edge of a leaf.','Try scanning a row','sampleRow','Light meets the leaves of a butterhead lettuce in a field at dusk.'],
    ['Where is the plant?','Seen from above, the returns form clusters. The gold ring marks one guess at a plant center.','Place a pin','placePin','An illustrated overhead scan shows clusters of green dots with a gold ring on one cluster.'],
    ['Can height fool a detector?','A lettuce and a weed reach the same height. Teach a model using only that clue and watch both scores change.','Try one model update','learnWeight','A side view of a lettuce and a weed shows their leaves meeting the same height line.']
  ];
  // A schematic overhead scan. A leaf's centerline curves outward, with returns spreading across its blade.
  const marks=[];
  for (const [cx,cy,scale] of [[430,196,1.1],[333,84,.73],[528,80,.8],[337,308,.82],[548,288,.94],[156,160,.65]]) {
    for (let leaf=0;leaf<12;leaf++) {
      const angle=leaf*2.4, length=(leaf<6?57:35)*scale;
      for (let i=1;i<=16;i++) for (let j=-2;j<=2;j++) {
        const t=i/17, reach=t*length, across=j*Math.sin(t*Math.PI)*length*.087;
        const x=cx+reach*Math.cos(angle)-across*Math.sin(angle+t*.3);
        const y=cy+reach*Math.sin(angle)+across*Math.cos(angle+t*.3);
        marks.push('<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r=".96" fill="'+(j===0?'#daeaa3':i%3===0?'#9acc86':'#70ac8c')+'"/>');
      }
    }
  }
  document.getElementById('filmReturns').innerHTML=marks.join('');
  const play=document.getElementById('playFilm'),link=document.getElementById('tryShot');
  const buttons=Array.from(film.querySelectorAll('[data-shot-index]'));
  let shot=0, timer;
  function pause() {
    clearTimeout(timer);timer=undefined;film.classList.remove('playing');
    play.textContent=shot===shots.length-1?'Replay story':'Play story';
  }
  function select(index) {
    shot=index;film.dataset.shot=String(index);
    const [title,text,label,target,description]=shots[shot];
    document.getElementById('shotTitle').textContent=title;
    document.getElementById('shotText').textContent=text;
    document.getElementById('sceneDescription').textContent=description;
    link.textContent=label;link.href='?view=learn&step=lessons&open='+encodeURIComponent('#'+target);
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }
  function advance() {
    if (shot===shots.length-1) {pause();return;}
    select(shot+1);timer=setTimeout(advance,7000);
  }
  play.addEventListener('click',()=>{
    if (timer!==undefined) {pause();return;}
    if (shot===shots.length-1) select(0);
    film.classList.add('playing');play.textContent='Pause story';timer=setTimeout(advance,7000);
  });
  buttons.forEach((button,i)=>button.addEventListener('click',()=>{select(i);pause();}));
  link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();pause();practice(shots[shot][3]);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  select(0);
  return pause;
}
