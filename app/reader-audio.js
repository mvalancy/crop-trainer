// A single worker owns the active language's model; closing the player releases it.
export function createTextVoice() {
  let worker,lang,nextId=0;
  const waiting=new Map();
  function close() {
    worker?.terminate();worker=null;lang=null;
    for(const request of waiting.values())request.reject(new Error('The reading voice stopped.'));
    waiting.clear();
  }
  function connect(language) {
    close();lang=language;
    worker=new Worker(new URL('./reader-voice-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const request=waiting.get(data.id);
      if(data.error)request?.reject(new Error(data.error));else request?.resolve(data);
    };
    worker.onerror=close;
  }
  return {close,async render(text,signal,language) {
    if(!worker || lang!==language)connect(language);
    const id=++nextId;let cancel;
    try {
      return await new Promise((resolve,reject)=>{
        waiting.set(id,{resolve,reject});
        cancel=()=>reject(signal.reason);
        signal.addEventListener('abort',cancel,{once:true});
        if(signal.aborted){cancel();return;}
        worker.postMessage({id,text,lang:language});
      });
    }finally{waiting.delete(id);signal.removeEventListener('abort',cancel);}
  }};
}
