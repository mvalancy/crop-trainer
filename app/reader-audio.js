// Only prose and live measurements need synthesis. Keep the voice off the UI thread.
export function createTextVoice() {
  let worker, nextId = 0;
  const waiting = new Map();
  function connect() {
    worker = new Worker(new URL('./reader-voice-worker.js', import.meta.url), {type:'module'});
    worker.onmessage = ({data}) => {
      const request = waiting.get(data.id);
      if (!request) return;
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data);
    };
    worker.onerror = () => {
      worker.terminate();
      worker = null;
      for (const request of waiting.values()) request.reject(new Error('The reading voice could not start.'));
    };
  }
  return async function render(text, context, signal) {
    if (!worker) connect();
    const id = ++nextId;
    let cancel;
    try {
      const {samples, rate} = await new Promise((resolve,reject) => {
        waiting.set(id,{resolve,reject});
        cancel = () => reject(signal.reason);
        signal.addEventListener('abort', cancel, {once:true});
        if (signal.aborted) { cancel(); return; }
        worker.postMessage({id,text});
      });
      const buffer = context.createBuffer(1,samples.length,rate);
      const channel = buffer.getChannelData(0);
      for (let i=0;i<samples.length;i++) channel[i] = samples[i] / 32768;
      return buffer;
    } finally {
      waiting.delete(id);
      signal.removeEventListener('abort',cancel);
    }
  };
}
