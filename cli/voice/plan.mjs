// Print recording jobs. Optional input is a JSON array of additional passages in the chosen language.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {core,filmLines,languages} from '../../app/language-core.js';
import {voiceovers} from '../../app/studio-voiceovers.js';
const [lang,input]=process.argv.slice(2);
if(!Object.hasOwn(languages,lang))throw Error('Choose en, ar, es, zh or fr.');
const root=new URL('../../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const file='art/audio/library/'+lang+'.json';
const library=read(file),catalog=lang==='en'?{}:read('art/languages/'+lang+'.json');
function tr(text){
  if(lang==='en')return text;
  const translated=core(text,lang) || catalog[text];
  if(!translated)throw Error('Missing narration translation: '+text);
  return translated;
}
const jobs=[],prefix='art/audio/'+(lang==='en'?'':lang+'-');
const titles={leaf:'Where does the light land?',returns:'Where is the plant?',prediction:'Can height fool a detector?'};
for(const [scene,lines] of Object.entries(filmLines)){
  const text=tr(titles[scene])+' '+lines[Object.keys(languages).indexOf(lang)];
  jobs.push({text,file:prefix+scene+'-voice.mp3',film:true});
}
for(const [cue,text] of Object.entries(voiceovers))jobs.push({text:tr(text),file:prefix+'guide-'+cue.toLowerCase()+'.mp3'});
if(input){
  const lines=JSON.parse(readFileSync(resolve(input),'utf8'));
  if(!Array.isArray(lines) || lines.some(s=>typeof s!=='string'||!s.trim()))throw Error('Expected nonempty passage strings.');
  for(const text of lines){
    const hash=createHash('sha256').update(lang+'\n'+text).digest('hex').slice(0,16);
    library[text]='v-'+lang+'-'+hash+'.mp3';
  }
  writeFileSync(new URL(file,root),JSON.stringify(library,null,2)+'\n');
}
for(const [text,name] of Object.entries(library))jobs.push({text,file:'art/audio/library/'+name});
process.stdout.write(JSON.stringify(jobs,null,2)+'\n');
