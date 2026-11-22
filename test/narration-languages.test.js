import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {core,filmLines,languages,localFinding} from '../app/language-core.js';
import {speechText} from '../app/speech-text.js';
import {voiceovers} from '../app/studio-voiceovers.js';
import {isPublicPath} from '../cli/site-files.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root)));
const publishedAudio=path=>{
  assert.ok(isPublicPath(path),path);
  assert.ok(statSync(new URL(path,root)).size>500,path);
};

test('every language has recorded film scenes, activity tours and the exact passages in its index',()=>{
  assert.deepEqual(Object.keys(languages),['en','ar','es','zh','fr']);
  for(const lang of Object.keys(languages)){
    const prefix='art/audio/'+(lang==='en'?'':lang+'-');
    for(const id of Object.keys(filmLines))publishedAudio(prefix+id+'-voice.mp3');
    for(const id of Object.keys(voiceovers))publishedAudio(prefix+'guide-'+id.toLowerCase()+'.mp3');
    const index=json('art/audio/library/'+lang+'.json');
    assert.ok(Object.keys(index).length>=100,lang);
    for(const [text,file] of Object.entries(index)){
      const hash=createHash('sha256').update(lang+'\n'+text).digest('hex').slice(0,16);
      assert.equal(file,'v-'+lang+'-'+hash+'.mp3');
      publishedAudio('art/audio/library/'+file);
    }
  }
});
test('live Arabic measurements preserve the score and pronounce each decimal digit',()=>{
  assert.equal(localFinding('4 matched · 1 extra · 0 missed','ar'),'مطابقات: 4 · علامات زائدة: 1 · نباتات فائتة: 0');
  assert.equal(speechText('0.50','ar'),'صفر فاصلة خمسة صفر');
  assert.equal(speechText('0.62','ar'),'صفر فاصلة ستة اثنان');
  for(const lang of Object.keys(languages).slice(1)){
    const translations=json('art/languages/'+lang+'.json');
    assert.equal(translations.Play,core('Play',lang));
    assert.equal(translations['Where is the plant?'],core('Where is the plant?',lang));
    assert.ok(translations[voiceovers['explore-test']]);
    assert.ok(Object.values(translations).every(text=>!/[▁⁇]/u.test(text)),lang+' catalog contains an unresolved translation symbol');
    assert.equal(translations['Auto spin'],core('Auto spin',lang));
    if(lang==='ar')assert.equal(translations['Can you spot a plant?'],'هل يمكنك تمييز نبتة؟');
  }
});
