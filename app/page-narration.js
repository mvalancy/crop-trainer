import {createStudioNarration} from './studio-narration.js';
import {studioReading} from './studio-reading-context.js';

// Standalone instruments and chapters share the studio player. Embedded pages use their host's player.
export function installPageNarration() {
  if(window!==window.top || document.querySelector('#listenSlot,.pageListen'))return;
  const chapter=document.querySelector('.guideChapter'), main=document.querySelector('main');
  if(!main)return;
  const home=document.createElement('div');
  home.className='pageListen';
  const header=document.querySelector('.siteBar .barInner');
  if(!header)return;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./studio-narration.css',import.meta.url).href;document.head.append(sheet);
  header.insertBefore(home,header.querySelector('.themeChoice'));
  const narration=createStudioNarration(home);
  function update(){
    const url=new URL(location.href);
    const anchor=document.getElementById(url.hash.slice(1));
    const target=anchor?.closest('section,article') || main;
    const title=target.querySelector('h1,h2,h3')?.textContent || document.title;
    const view=chapter?'docs':document.body.matches('.shed')?'train':document.body.matches('.benchmark')?'compare':'scan';
    if(chapter)narration.set(studioReading({view,step:'chapter',url},document,null,title));
    else narration.set({key:url.href,title,roots:[target],cue:target===main?{scan:'generate',train:'fit',compare:'experiment'}[view]:null});
  }
  update();
  window.addEventListener('hashchange',update);
  window.addEventListener('crop-language-change',update);
  document.addEventListener('guide-figure-change',update);
}
