// Keep the original animated paths and geometry. Localize the words painted on the plate.
export function translatePlate(svg,translate,lang) {
  svg.setAttribute('lang',lang);
  for(const el of svg.querySelectorAll('text,tspan,title,desc')) {
    for(const node of el.childNodes)if(node.nodeType===3)node.data=translate(node.data);
    if(lang==='ar' && el.localName==='text' && /[\u0600-\u06ff]/u.test(el.textContent)) {
      const anchor=el.getAttribute('text-anchor') || svg.getAttribute('text-anchor') || 'start';
      el.setAttribute('direction','rtl');
      el.setAttribute('text-anchor',anchor==='start'?'end':anchor==='end'?'start':anchor);
    }
  }
}
const sources=new WeakMap();
const plates=new Map();
let activeLanguage='en',watch;
export function observePlate(image,translate) {
  if(activeLanguage==='en' || image.closest('.brand') || !image.src || image.dataset.translatedPlate===activeLanguage)return;
  const src=sources.get(image) || image.src;
  const url=new URL(src);
  if(url.origin!==location.origin || !/\/art\/(?:plants\/)?[\w-]+\.svg$/i.test(url.pathname))return;
  sources.set(image,src);
  watch?.observe(image);
}
export function startArtLanguage(lang,translate) {
  watch?.disconnect();
  for(const image of document.querySelectorAll('img[data-translated-plate]')){
    const src=sources.get(image);if(src)image.src=src;
    delete image.dataset.translatedPlate;
  }
  for(const promise of plates.values())promise.then(url=>{if(url)URL.revokeObjectURL(url);});
  plates.clear();activeLanguage=lang;
  if(lang==='en')return;
  watch=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      const img=entry.target;watch.unobserve(img);
      const src=sources.get(img);
      if(!plates.has(src))plates.set(src,fetch(src).then(async r=>{
        if(!r.ok || activeLanguage!==lang)return;
        const doc=new DOMParser().parseFromString(await r.text(),'image/svg+xml');
        if(doc.documentElement.localName!=='svg' || !doc.querySelector('text'))return;
        translatePlate(doc.documentElement,translate,lang);
        for(const image of doc.querySelectorAll('image[href]')){
          const ref=image.getAttribute('href');if(ref && !ref.startsWith('#'))image.setAttribute('href',new URL(ref,src).href);
        }
        return URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)],{type:'image/svg+xml'}));
      }).catch(()=>undefined));
      plates.get(src).then(url=>{if(url && img.isConnected && activeLanguage===lang){img.dataset.translatedPlate=lang;img.src=url;}});
    }
  },{rootMargin:'180px'});
}
export const originalPlate=img=>sources.get(img) || img.src;
