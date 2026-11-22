// Magnify the original plate with its own stylesheet. CSS animations stay inside
// the sandboxed SVG document, where the reader can pause or scrub their clocks.
export function installFigureReader(chapter) {
  const art = new URL('../art/',import.meta.url).href;
  const images = [...chapter.querySelectorAll('img')].filter(img=>img.src.startsWith(art) && new URL(img.src).pathname.endsWith('.svg'));
  if (!images.length) return;
  const dialog = document.createElement('dialog');
  dialog.className='guideFigureViewer';
  dialog.setAttribute('aria-label','Study an illustration');
  dialog.innerHTML='<header><strong class="figureHeading"></strong><span class="figureVoiceSlot"></span><button type="button" aria-label="Close illustration">Close</button></header>'+
    '<div class="figureViewport" tabindex="0" aria-label="Illustration, scroll to pan when magnified"><div class="figureCanvas"></div></div>'+
    '<p class="figureExplanation"></p><div class="figureTools"><button type="button" data-command="previous">Previous</button><button type="button" data-command="next">Next</button>'+
    '<button type="button" data-command="zoom" aria-pressed="false">Magnify</button><button type="button" data-command="play">Pause motion</button>'+
    '<label>Animation time <input type="range" min="0" step=".05" value="0"></label></div>';
  document.body.append(dialog);
  const get=s=>dialog.querySelector(s);
  const command=name=>get('[data-command="'+name+'"]');
  const heading=get('.figureHeading'), explanation=get('.figureExplanation'), canvas=get('.figureCanvas');
  const seek=get('input'), play=command('play'), zoom=command('zoom');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let index=0, animations=[], running=false, clock=0;
  function notify() { document.dispatchEvent(new Event('guide-figure-change')); }
  function toggleMotion(state) {
    running=state;
    for (const animation of animations) state ? animation.play() : animation.pause();
    play.textContent=state?'Pause motion':'Play motion';
    cancelAnimationFrame(clock);
    if (state) {
      function showTime() {
        const now=Number(animations[0]?.currentTime || 0)/1000;
        seek.value=String(now % Number(seek.max));
        clock=requestAnimationFrame(showTime);
      }
      showTime();
    }
  }
  function openPlate(n) {
    index=n;
    const img=images[n];
    heading.textContent='Illustration '+(n+1)+' of '+images.length;
    explanation.textContent=img.alt || 'Illustration from this chapter.';
    command('previous').disabled=n===0;
    command('next').disabled=n===images.length-1;
    toggleMotion(false);
    animations=[];
    play.hidden=seek.parentElement.hidden=true;
    seek.value='0';
    zoom.setAttribute('aria-pressed','false');
    canvas.classList.remove('magnified');
    const frame=document.createElement('iframe');
    frame.tabIndex=-1;
    frame.title=img.alt || 'Chapter illustration';
    frame.setAttribute('sandbox','allow-same-origin');
    frame.addEventListener('load',()=>{
      if (!frame.isConnected || !dialog.open) return;
      const doc=frame.contentDocument;
      if (doc?.documentElement.localName!=='svg') return;
      const svg=doc.documentElement;
      svg.style.width='100vw'; svg.style.height='100vh'; svg.style.display='block';
      svg.getBoundingClientRect();
      animations=doc.getAnimations();
      if (!animations.length || reduced.matches) return;
      const duration=Math.max(...animations.map(a=>{
        const t=a.effect.getTiming();
        return (Number(t.duration)||0)+Math.max(0,t.delay);
      }));
      if (!duration) return;
      seek.max=String(duration/1000);
      play.hidden=seek.parentElement.hidden=false;
      toggleMotion(true);
    });
    frame.src=img.src;
    canvas.replaceChildren(frame);
    notify();
  }
  for (const [n,img] of images.entries()) {
    const button=document.createElement('button');
    button.type='button';
    button.className='figureOpener';
    button.textContent='Study figure';
    button.setAttribute('aria-haspopup','dialog');
    (img.closest('a') || img).after(button);
    button.addEventListener('click',()=>{
      dialog.showModal();
      openPlate(n);
    });
  }
  get('header button').addEventListener('click',()=>dialog.close());
  command('previous').addEventListener('click',()=>openPlate(index-1));
  command('next').addEventListener('click',()=>openPlate(index+1));
  zoom.addEventListener('click',()=>zoom.setAttribute('aria-pressed',String(canvas.classList.toggle('magnified'))));
  play.addEventListener('click',()=>toggleMotion(!running));
  seek.addEventListener('input',()=>{
    toggleMotion(false);
    for (const animation of animations) animation.currentTime=Number(seek.value)*1000;
  });
  reduced.addEventListener('change',()=>{if(dialog.open) openPlate(index);});
  dialog.addEventListener('close',()=>{toggleMotion(false);animations=[];canvas.replaceChildren();notify();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && dialog.open) toggleMotion(false);});
}
