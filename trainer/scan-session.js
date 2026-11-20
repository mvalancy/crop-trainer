import {field} from './field.js?v=live1';

// A generator or training run requests one tile at a time. Reuse the worker so
// a long training split pays startup once. Aborting also stops its current tile.
export function scanSession(signal) {
  let worker, rejectPending;
  function close() {
    worker?.terminate();
    worker=undefined;
    rejectPending?.(signal.reason || new DOMException('Scan stopped','AbortError'));
    rejectPending=undefined;
    signal.removeEventListener('abort',close);
  }
  signal.addEventListener('abort',close,{once:true});
  return {
    generate(recipe,onRow){
      signal.throwIfAborted();
      if(typeof Worker==='undefined')return field(recipe,onRow);
      worker??=new Worker(new URL('./generate-worker.js?v=live1',import.meta.url),{type:'module'});
      return new Promise((resolve,reject)=>{
        rejectPending=reject;
        worker.onerror=e=>{reject(Error(e.message || 'Scan generation failed'));close();};
        worker.onmessage=({data})=>{
          if(data.frame){onRow?.(data.frame);return;}
          rejectPending=undefined;
          resolve(data.scan);
        };
        worker.postMessage({recipe,preview:!!onRow});
      });
    },
    close
  };
}
