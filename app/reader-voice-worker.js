// Only opened for text without a recording. User text and measurements stay in this worker.
import * as ort from '../art/audio/neural/runtime.js';
import {speechText} from './speech-text.js';
import {arabicVowels} from './arabic-vowels.js';
const assets=new URL('../art/audio/neural/',import.meta.url);
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths={mjs:new URL('binding.js',assets).href,wasm:new URL('runtime.wasm',assets).href};
async function asset(name,format='arrayBuffer') {
  const response=await fetch(new URL(name,assets),{cache:'force-cache'});
  if(!response.ok)throw Error('Could not load the narration voice.');
  return response[format]();
}
const session=bytes=>ort.InferenceSession.create(new Uint8Array(bytes),{executionProviders:['wasm'],enableCpuMemArena:false});
async function model(prefix,count) {
  const parts=await Promise.all(Array.from({length:count},(_,i)=>asset(prefix+'-'+(i+1)+'.bin')));
  return session(await new Blob(parts).arrayBuffer());
}
const longTensor=(values,shape)=>new ort.Tensor('int64',BigInt64Array.from(values,BigInt),shape);
const floatTensor=(values,shape)=>new ort.Tensor('float32',Float32Array.from(values),shape);

async function english() {
  const [net,vocab,data,{phonemize}]=await Promise.all([model('model',4),asset('vocab.json','json'),asset('heart.bin'),import('../art/audio/neural/phonemes.js')]);
  const styles=new Float32Array(data);
  return {rate:24000,async speak(text) {
    const pieces=[];
    for(const part of text.split(/([,;:!?…—]+|\.(?!\d))/u)){
      if(part.trim())pieces.push(/^[,;:!?.…—]+$/u.test(part)?part:(await phonemize(part.trim(),'en-us')).join(' '));
    }
    const tokens=Array.from(pieces.join(' ').replace(/ ([,;:!?.…—])/gu,'$1'),p=>vocab[p]).filter(n=>n!==undefined);
    const samples=[];
    for(let i=0;i<tokens.length;i+=500){
      const line=tokens.slice(i,i+500),start=(line.length-1)*256;
      const {audio}=await net.run({tokens:longTensor([0,...line,0],[1,line.length+2]),style:new ort.Tensor('float32',styles.subarray(start,start+256),[1,256]),speed:floatTensor([.96],[1])});
      samples.push(audio.data);
    }
    return samples;
  }};
}
async function multilingual(lang) {
  const [net,config,{default:make},vowels]=await Promise.all([model(lang,3),asset(lang+'-config.json','json'),
    import('../art/audio/neural/multilingual.js'),lang==='ar'?Promise.all([asset('ar-vowels.bin').then(session),asset('ar-vowels.json','json')]):null]);
  const module=await make(),reader=new module.eSpeakNGWorker();
  if(reader.set_voice(config.espeak.voice,''))throw Error('Pronunciation data unavailable');
  const vocalize=vowels?arabicVowels(ort,...vowels):text=>text;
  const symbols=config.phoneme_id_map,opts=config.inference;
  const punctuation=/^[,.:;?!،؛؟。！？：，]+$/u;
  return {rate:config.audio.sample_rate,async speak(text){
    const words=await vocalize(text);
    let phones='';
    for(const part of words.split(/([,;!?،؛؟。！？：，]+|\.(?!\d))/u)){
      if(!part.trim())continue;
      if(punctuation.test(part)) phones+=part.replace(/[。]/g,'.').replace(/[؟？]/g,'?').replace(/[،，]/g,',');
      else phones+=' '+reader.synthesize_ipa(part.trim()).ipa.replace(/_/g,'').replace(/\([^)]*\)/g,'').trim();
    }
    const ids=[...symbols['^'],...symbols['_']];
    for(const p of phones.trim().normalize('NFD'))if(symbols[p])ids.push(...symbols[p],...symbols['_']);
    if(ids.length<4)throw Error('Empty pronunciation');
    ids.push(...symbols['$']);
    const {output}=await net.run({input:longTensor(ids,[1,ids.length]),input_lengths:longTensor([ids.length],[1]),scales:floatTensor([opts.noise_scale,opts.length_scale,opts.noise_w],[3])});
    return [output.data];
  }};
}
let ready,latest=0;
self.onmessage=async({data:{id,text,lang}})=>{
  latest=id;
  try{
    const engine=await (ready??=(lang==='en'?english():multilingual(lang)));
    if(latest!==id)return;
    const blocks=await engine.speak(speechText(text,lang));
    if(latest!==id)return;
    const audio=new Float32Array(blocks.reduce((sum,x)=>sum+x.length,0));
    if(!audio.length)throw Error('No speech available');
    let offset=0;
    for(const block of blocks){audio.set(block,offset);offset+=block.length;}
    self.postMessage({id,samples:audio,rate:engine.rate},[audio.buffer]);
  }catch(error){ready=undefined;self.postMessage({id,error:String(error.message||error)});}
};
