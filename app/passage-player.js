// Use a media element so speed changes preserve pitch and mobile devices can route speech normally.
import {createTextVoice} from './reader-audio.js';
const library=new URL('../art/audio/library/',import.meta.url);
const catalogs=new Map();
function recordings(lang) {
  if(!catalogs.has(lang))catalogs.set(lang,fetch(new URL(lang+'.json',library)).then(r=>{
    if(!r.ok)throw Error('Recording list unavailable');return r.json();
  }).catch(()=>{catalogs.delete(lang);return {};}));
  return catalogs.get(lang);
}
function wav(samples,rate) {
  const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes);
  const tag=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
  tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  tag(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)v.setInt16(44+2*i,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  return new Blob([bytes],{type:'audio/wav'});
}
export function createPassagePlayer({onEnded,onAudioError,onStatus}) {
  const audio=new Audio();
  audio.preload='auto';audio.preservesPitch=true;
  const voice=createTextVoice();
  let request,objectURL,oldKey,upcoming,readyLanguage,unlocked=false,prepared=false,speed=1;
  function release(){
    if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}
  }
  function pause(){
    request?.abort();request=null;
    audio.pause();onStatus('');
    return prepared?audio.currentTime:0;
  }
  audio.addEventListener('ended',()=>{if(request && prepared)onEnded();});
  function report(){if(request && prepared){prepared=false;pause();onAudioError();}}
  function cancelUpcoming(){
    upcoming?.controller.abort();upcoming=null;
  }
  async function bufferNext(next,lang,job){
    if(!next || next.cue || readyLanguage!==lang)return;
    const index=await recordings(lang);
    if(request!==job || Object.hasOwn(index,next.text))return;
    cancelUpcoming();
    const controller=new AbortController();
    const promise=voice.render(next.text,controller.signal,lang).catch(()=>null);
    upcoming={key:lang+'\n'+next.text,controller,promise};
  }
  audio.addEventListener('error',report);
  return {
    pause,
    stop(){pause();cancelUpcoming();voice.close();readyLanguage=null;prepared=false;audio.removeAttribute('src');audio.load();release();},
    setSpeed(value){speed=value;audio.playbackRate=value;},
    async play(passage,lang,offset,next){
      pause();
      const job=request=new AbortController(),current=()=>request===job && !job.signal.aborted;
      const key=lang+'\n'+passage.text;
      if(upcoming && upcoming.key!==key)cancelUpcoming();
      try{
        if(!prepared || key!==oldKey){
          prepared=false;
          // Unlock this element in the initiating gesture before a model or index is fetched.
          if(!unlocked){
            unlocked=true;objectURL=URL.createObjectURL(wav(new Float32Array(240),24000));
            audio.src=objectURL;audio.play().catch(()=>{});
          }
          onStatus('Preparing narration…');
          const prefix=lang==='en'?'':lang+'-';
          let url;
          if(passage.cue)url=new URL('../art/audio/'+prefix+'guide-'+passage.cue.toLowerCase()+'.mp3',import.meta.url).href;
          else {
            const index=await recordings(lang);
            if(!current())return;
            if(Object.hasOwn(index,passage.text))url=new URL(index[passage.text],library).href;
          }
          if(!url){
            onStatus(readyLanguage===lang?'Preparing narration…':lang==='en'?'Loading the local voice (about 105 MB on first use)…':'Loading the local voice (about 80 MB on first use)…');
            const buffered=upcoming?await upcoming.promise:null;
            if(!current())return;
            upcoming=null;
            const {samples,rate}=buffered || await voice.render(passage.text,job.signal,lang);
            readyLanguage=lang;
            if(!current())return;
            release();objectURL=URL.createObjectURL(wav(samples,rate));url=objectURL;
          } else release();
          if(!current())return;
          audio.src=url;oldKey=key;prepared=true;
        }
        audio.playbackRate=speed;
        audio.currentTime=offset || 0;
        await audio.play();
        if(current()){onStatus('');bufferNext(next,lang,job);}
      } catch {if(current()){prepared=false;pause();onAudioError();}}
    }
  };
}
