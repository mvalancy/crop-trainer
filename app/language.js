import {observePlate,startArtLanguage} from './language-art.js';
import {core,languages,languageTags,localFinding} from './language-core.js';
const store='crop-trainer-language';
const normalize=text=>text.trim().replace(/\s+/gu,' ');
const numbers=/\d+(?:[.,]\d+)*/g;
const pattern=text=>text.replace(numbers,'\u0001');
const attrs=['aria-label','aria-description','aria-valuetext','title','alt','placeholder','data-help','data-help-label'];
const ignore='script,style,code,pre,kbd,samp,textarea,[contenteditable=true],[translate=no],.languageChoice,.listenTranscript';
const originals=new WeakMap(), catalogs=new Map();
let locale='en', dictionary={}, variations=new Map(), revision=0, select, observer;
export const language=()=>locale;
export function preferredLanguage() {
  const query=new URLSearchParams(location.search).get('lang');
  let saved,host;
  try {if(parent!==window)host=parent.document.documentElement.dataset.language || new URL(parent.location.href).searchParams.get('lang');} catch {}
  try {saved=localStorage.getItem(store);} catch {}
  const match=[host,query,saved,...navigator.languages || []].map(value=>value?.split('-')[0]).find(value=>Object.hasOwn(languages,value));
  return match || 'en';
}
function lookup(source,split=true) {
  if (locale==='en' || !source) return source;
  const key=normalize(source);
  let result=core(key,locale) ?? localFinding(key,locale);
  if(!result && key.startsWith('The five predictions stay fixed. ')){
    const tail=key.slice('The five predictions stay fixed. '.length);
    const translated=core(tail,locale) || dictionary[tail];
    if(translated)result=core('The five predictions stay fixed.',locale)+' '+translated;
  }
  result ??=dictionary[key];
  if (!result && /\d/.test(key)) {
    const template=variations.get(pattern(key));
    if (template) {
      const values=key.match(numbers);
      result=template.replace(/\u0001(\d+)\u0001/g,(_,i)=>values[i]);
    }
  }
  if(!result && split){
    // Status strips and replay links often join translated labels to run-specific numbers or names.
    const parts=key.split(/( · | — |: | →|(?<=[.!?]) (?=[A-Z]))/u);
    if(parts.length>1){
      const translated=parts.map((p,i)=>i%2===0?lookup(p,false):locale==='ar' && p===' →'?' ←':p);
      if(translated.some((p,i)=>p!==parts[i]))result=translated.join('');
    }
  }
  if (!result) return source;
  return source.match(/^\s*/u)[0]+result+source.match(/\s*$/u)[0];
}
export const translate=source=>lookup(source);
function remember(node,name,value,write) {
  let entries=originals.get(node);
  const last=entries?.get(name);
  const source=last && last.shown===value ? last.source : value;
  const shown=translate(source);
  if (shown!==value) write(shown);
  if (shown!==source || last) {
    if (!entries) originals.set(node,entries=new Map());
    entries.set(name,{source,shown});
  }
}
function textNode(node) {
  if (!node.data.trim() || !node.parentElement || node.parentElement.closest(ignore)) return;
  const p=node.parentElement;
  // An option with no value submits its visible label. Keep the original recipe key.
  if (p.localName==='option' && !p.hasAttribute('value')) p.value=p.textContent;
  remember(node,'text',node.data,value=>{node.data=value;});
  // Mark whole untranslated phrases for assistive technology, without altering control values.
  if(p.childNodes.length===1 && (!p.hasAttribute('lang') || p.hasAttribute('data-source-language'))){
    const original=originals.get(node)?.get('text')?.source ?? node.data;
    const remainsEnglish=locale!=='en' && node.data===original && /^[A-Za-z][^\u0600-\u06ff\u4e00-\u9fff]* [a-z]{2}/u.test(original)
      && !dictionary[normalize(original)] && !core(normalize(original),locale);
    if(remainsEnglish){p.lang='en';p.dataset.sourceLanguage='';}
    else if(p.hasAttribute('data-source-language')){p.removeAttribute('lang');delete p.dataset.sourceLanguage;}
  }
}
function element(el) {
  if (el.matches(ignore) || el.closest(ignore)) return;
  if(el.localName==='img')observePlate(el,translate);
  for (const key of attrs) if (el.hasAttribute(key)) remember(el,key,el.getAttribute(key),v=>el.setAttribute(key,v));
}
function scan(node) {
  if (node.nodeType===3) {textNode(node);return;}
  if (node.nodeType!==1 || node.closest(ignore)) return;
  // Scan overlays can add thousands of geometric marks without any language content.
  if(node.namespaceURI==='http://www.w3.org/2000/svg' && !node.matches('text,tspan,desc,title,[aria-label]') &&
      !node.querySelector('text,tspan,desc,title,[aria-label]'))return;
  const walk=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
    acceptNode:n=>n.nodeType===1 && n.matches(ignore)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT
  });
  element(node);
  while (walk.nextNode()) {const n=walk.currentNode;if(n.nodeType===3)textNode(n);else element(n);}
}
async function apply(code) {
  const ticket=++revision;
  if(document.documentElement.dataset.language===code && locale===code)return;
  let next={};
  if(code!=='en') {
    if(!catalogs.has(code)) catalogs.set(code,fetch(new URL('../art/languages/'+code+'.json',import.meta.url)).then(r=>{
      if(!r.ok)throw Error('Language unavailable');return r.json();
    }));
    try {next=await catalogs.get(code);} catch {catalogs.delete(code);if(ticket===revision && select)select.value=locale;return;}
  }
  if(ticket!==revision)return;
  dictionary=Object.assign(Object.create(null),next);locale=code;variations=new Map();
  for(const [key,value] of Object.entries(next)){
    const digits=key.match(numbers);
    if(!digits)continue;
    const copy=[...digits];let safe=true;
    const template=value.replace(numbers,n=>{
      const i=copy.indexOf(n);
      if(i<0){safe=false;return n;}copy[i]=null;return '\u0001'+i+'\u0001';
    });
    if(safe && copy.every(n=>n===null))variations.set(pattern(key),template);
  }
  document.documentElement.lang=languageTags[code];
  document.documentElement.dir=code==='ar'?'rtl':'ltr';
  document.documentElement.dataset.language=code;
  if(window===window.top){
    const address=new URL(location.href);
    if(code!=='en')address.searchParams.set('lang',code);
    else address.searchParams.delete('lang');
    if(address.href!==location.href)history.replaceState(history.state,'',address);
  }
  if(select){select.value=code;select.setAttribute('aria-label',translate('Language'));}
  observer?.disconnect();startArtLanguage(code,translate);scan(document.documentElement);
  if(code!=='en') observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  window.dispatchEvent(new CustomEvent('crop-language-change',{detail:code}));
}
export function installLanguages(theme) {
  // Reading a sentence as a unit preserves grammar across inline links and emphasis.
  document[Symbol.for('crop-original-text')]=(node,attr)=>originals.get(node)?.get(attr)?.source;
  const host=document.createElement('label');
  host.className='languageChoice';host.setAttribute('translate','no');
  host.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4.2" ry="9"/><path d="M3 12h18"/></svg>';
  select=document.createElement('select');select.id='siteLanguage';select.setAttribute('aria-label','Language');
  for(const [code,name] of Object.entries(languages)){
    const option=new Option(name,code);option.lang=languageTags[code];option.dir=code==='ar'?'rtl':'ltr';select.add(option);
  }
  host.append(select);theme.after(host);
  observer=new MutationObserver(records=>{
    for(const r of records) {
      if(r.type==='characterData')textNode(r.target);
      else if(r.type==='attributes')element(r.target);
      else for(const n of r.addedNodes)scan(n);
    }
  });
  select.addEventListener('change',()=>{
    const code=select.value;
    try{localStorage.setItem(store,code);}catch{}
    apply(code);
    for(const f of document.querySelectorAll('iframe.studioFrame'))f.contentWindow?.postMessage({type:'crop-language',code},location.origin);
  });
  addEventListener('message',e=>{if(e.origin===location.origin && e.source===parent && e.data?.type==='crop-language' && Object.hasOwn(languages,e.data.code))apply(e.data.code);});
  addEventListener('storage',e=>{if(e.key===store && Object.hasOwn(languages,e.newValue))apply(e.newValue);});
  const code=preferredLanguage();
  if(window===window.top && new URLSearchParams(location.search).get('lang')===code){try{localStorage.setItem(store,code);}catch{}}
  if(code!=='en')apply(code);
}
