// Apply the hand-reviewed strings to a locale catalog after updating the longer translated passages.
import {readFileSync,writeFileSync} from 'node:fs';
import {labels,languages} from '../../app/language-core.js';
const lang=process.argv[2],index=Object.keys(languages).indexOf(lang)-1;
if(index<0)throw Error('Choose ar, es, zh or fr.');
const file=new URL('../../art/languages/'+lang+'.json',import.meta.url);
const catalog=JSON.parse(readFileSync(file));
// In these chapters, "plant" denotes a living organism. Translation models sometimes select a factory.
for(const [source,raw] of Object.entries(catalog)){
  // Markup and shader fragments found in the source never become language-bearing DOM text.
  if(/(?:\b(?:fill|stroke|stroke-width|data-help|preserveAspectRatio|patternUnits)="|(?:var |for\(var ).*\})/u.test(source)){
    delete catalog[source];
    continue;
  }
  let value=raw.replaceAll('▁',' ').replace(/ +/gu,' ').trim();
  if(lang==='zh')value=value.replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/gu,'');
  if(/\bplants?\b/i.test(source)){
    if(lang==='ar')value=value.replaceAll('مصانع','نباتات').replaceAll('مصنع','نبات');
    if(lang==='zh')value=value.replaceAll('工厂','植株');
    if(lang==='fr')value=value.replace(/\bl['’]usine/gi,'la plante').replace(/\bd['’]usine/gi,'de plante').replace(/\busine(s?)\b/gi,'plante$1');
  }
  if(lang==='ar' && /\bpins?\b/i.test(source)){
    value=value.replace(/علام(ات|ة) (?:ال)?موقف/g,'علام$1');
  }
  if(value.includes('⁇')){
    if(source.includes('XYZ'))value=value.replace(/X\s*⁇/g,'XYZ');
    const separators=source.match(/[·→←×±≈≥≤–—+§=]/gu) || [];
    if(separators.length===(value.match(/⁇/gu)||[]).length){
      let i=0;
      value=value.replace(/⁇/gu,()=>{const symbol=separators[i++];return lang==='ar'&&symbol==='→'?'←':symbol;});
    }
  }
  catalog[source]=value;
}
if(lang==='ar')Object.assign(catalog,JSON.parse(readFileSync(new URL('ar-reviewed.json',import.meta.url))));
for(const [source,values] of Object.entries(labels))catalog[source]=values[index];
const ordered=Object.fromEntries(Object.entries(catalog).sort(([a],[b])=>a<b?-1:a>b?1:0));
writeFileSync(file,JSON.stringify(ordered,null,2)+'\n');
