import {trainNetworkCPU} from './neural.js?v=sandbox1';

let finish = false;
self.onmessage = async ({data}) => {
  if (data.finish) { finish = true; return; }
  let last = -Infinity;
  try {
    const result = await trainNetworkCPU(data.x,data.y,{
      ...data.options, shouldFinish:() => finish,
      onEpoch(progress) {
        if (progress.epoch === 4 || progress.done || progress.elapsedMs-last >= 180) {
          last = progress.elapsedMs;
          self.postMessage({progress});
        }
      }
    });
    self.postMessage({result},[result.weights.buffer]);
  } catch (err) { self.postMessage({error:err.message}); }
};
