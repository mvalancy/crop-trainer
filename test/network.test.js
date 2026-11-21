import test from 'node:test';
import assert from 'node:assert/strict';
import {trainNetworkCPU,predictNetwork} from '../trainer/models/neural.js';
import {initializeFit,networkShape,trackFit,scoreSavedWeights} from '../trainer/models/network.js';

const x = Float32Array.of(-1,.3,.4,.7,1,-.8);
const y = Float32Array.of(0,1,1);
for (const activation of ['tanh','relu']) {
  test('every layer follows the binary cross-entropy gradient with '+activation, async () => {
    const options = {dims:2,hiddenLayers:[3,2],activation,epochs:1,lr:.2};
    const {weights} = initializeFit(x,y,options);
    const fitted = await trainNetworkCPU(x,y,options);
    const loss = w => predictNetwork(x,w,2,[3,2],activation).reduce((sum,p,i)=>
      sum - Math.log(y[i] ? p : 1-p),0)/y.length;
    for (let k=0;k<weights.length;k++) {
      const plus=weights.slice(), minus=weights.slice(), h=.001;
      plus[k]+=h;minus[k]-=h;
      const estimate=(loss(plus)-loss(minus))/(2*h);
      const step=(weights[k]-fitted.weights[k])/options.lr;
      assert(Math.abs(step-estimate)<.00015,'weight '+k);
    }
    assert.equal(fitted.epochsCompleted,1);
    assert.deepEqual(fitted.lossEpochs,[1]);
  });
}
test('a time budget finishes on epoch boundaries and an early finish keeps weights', async () => {
  const options={dims:2,hiddenLayers:[],epochs:1000000,timeLimitMs:10};
  const fit=await trainNetworkCPU(x,y,options);
  assert(fit.epochsCompleted>=1 && fit.weights.length===3);
  let epoch=0;
  const early=await trainNetworkCPU(x,y,{...options,timeLimitMs:0,onEpoch:p=>{epoch=p.epoch;},shouldFinish:()=>epoch===2});
  assert.equal(early.epochsCompleted,3);
});
test('bounded history retains epoch coordinates and the final loss', () => {
  const history=trackFit({epochs:34002,timeLimitMs:0},{},'CPU');
  for(let e=1;e<=34002;e++) history.record(e,1/e);
  const {loss,lossEpochs,epochsCompleted}=history.result();
  assert(loss.length<=8192);assert.equal(loss.length,lossEpochs.length);
  assert.equal(epochsCompleted,34002);assert.equal(lossEpochs[0],1);
  assert(loss.every((v,i)=> v===1/lossEpochs[i]));
});
test('unsupported architecture or optimizer values fail before fitting',async()=>{
  assert.throws(()=>networkShape(13,[4,0]));
  assert.throws(()=>networkShape(13,[1,2,3,4,5]));
  await assert.rejects(trainNetworkCPU(x,y,{dims:2,optimizer:'unknown'}));
});

test('mini-batches include a final partial batch and update its bias', async()=>{
  const input=new Float32Array(33), labels=new Float32Array(33);
  labels[32]=1;
  const run=await trainNetworkCPU(input,labels,{dims:1,hiddenLayers:[],epochs:1,lr:1,batchSize:32});
  const expected=-.5 + (1 - 1/(1+Math.exp(.5)));
  assert(Math.abs(run.weights[1]-expected)<1e-6);
});

test('exported scaling and weights score unnormalized feature rows',()=>{
  const weights=Array(14).fill(0);weights[0]=1;
  const model={format:'crop-trainer-weights-v1',featureSchema:'crop-peak-13-v1',
    inputs:13,hiddenLayers:[],activation:'tanh',weights,
    scaling:{means:Array(13).fill(2),std:Array(13).fill(4)}};
  const [score]=scoreSavedWeights(new Float32Array(13).fill(6),JSON.parse(JSON.stringify(model)));
  assert(Math.abs(score-1/(1+Math.exp(-1)))<1e-6);
  assert.throws(()=>scoreSavedWeights([],{}));
});

test('live checkpoint pins use weights after the reported training update', async () => {
 const options={dims:2,hiddenLayers:[4],epochs:3,lr:.2};
 const control=await trainNetworkCPU(x,y,options);
 const first=await trainNetworkCPU(x,y,{...options,epochs:1});
 let snapshot;
 const live=await trainNetworkCPU(x,y,{...options,onCheckpoint(epoch,weights){
   if(epoch===1)snapshot=weights.slice();
 }});
 assert.deepEqual(snapshot,first.weights);
 assert.deepEqual(live.weights,control.weights);
 assert.deepEqual(live.loss,control.loss);
});

test('an explicit starting vector resumes plain SGD without mutating the caller’s weights', async () => {
  const options = {dims:2, hiddenLayers:[4], epochs:1, lr:.25};
  const first = await trainNetworkCPU(x,y,options);
  const saved = first.weights.slice();
  const second = await trainNetworkCPU(x,y,{...options,initialWeights:first.weights});
  const both = await trainNetworkCPU(x,y,{...options,epochs:2});
  assert.deepEqual(second.weights,both.weights);
  assert.deepEqual(first.weights,saved);
  for (const invalid of [saved.subarray(1),saved.slice().fill(NaN)]) {
    assert.throws(()=>initializeFit(x,y,{...options,initialWeights:invalid}),/Initial weights/);
  }
});
