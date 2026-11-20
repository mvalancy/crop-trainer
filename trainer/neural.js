import {describeAdapter} from './model.js';
// One hidden layer with four tanh units and a sigmoid output. All parameters learn.
const H = 4;
function initial(dims) {
  let seed = 12345;
  const w = new Float32Array(H * (dims + 1) + H + 1);
  for (let k = 0; k < w.length - 1; k++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    w[k] = (seed / 2**32 - .5) * 2 / Math.sqrt(dims);
  }
  return w;
}
function forward(x, offset, w, d, h) {
  let logit = w[w.length - 1];
  for (let j = 0; j < H; j++) {
    const start = j * (d + 1);
    let z = w[start + d];
    for (let k = 0; k < d; k++) z += w[start + k] * x[offset + k];
    h[j] = Math.tanh(z);
    logit += h[j] * w[H * (d + 1) + j];
  }
  return logit;
}
export function predictNetwork(x, w, d) {
  const h = new Float64Array(H);
  return Float32Array.from({length:x.length / d}, (_,i) => 1 / (1 + Math.exp(-forward(x,i*d,w,d,h))));
}
export async function trainNetworkCPU(x,y,{dims:d,epochs=24,lr=.25,onEpoch,signal}) {
  const w=initial(d), gradient=new Float64Array(w.length), h=new Float64Array(H), loss=[];
  for(let epoch=1;epoch<=epochs;epoch++) {
    signal?.throwIfAborted();gradient.fill(0);
    let total=0;
    for(let i=0;i<y.length;i++){
      const z=forward(x,i*d,w,d,h),error=1/(1+Math.exp(-z))-y[i];
      total+=Math.max(0,z)-z*y[i]+Math.log1p(Math.exp(-Math.abs(z)));
      for(let j=0;j<H;j++){
        const start=j*(d+1),out=H*(d+1)+j,delta=error*w[out]*(1-h[j]*h[j]);
        for(let k=0;k<d;k++)gradient[start+k]+=delta*x[i*d+k];
        gradient[start+d]+=delta;gradient[out]+=error*h[j];
      }
      gradient[w.length-1]+=error;
    }
    for(let k=0;k<w.length;k++)w[k]-=lr*gradient[k]/y.length;
    loss.push(total/y.length);onEpoch?.({epoch,loss:loss.at(-1),backend:'CPU'});
    if(epoch%4===0)await new Promise(r=>setTimeout(r,0));
  }
  return {weights:w,loss,backend:'CPU'};
}

// Each sample computes its hidden activations and errors once. Workgroups sum
// gradients for each parameter before the optimizer takes a full-batch step.
const shader=`
struct Params {n:u32,d:u32,groups:u32,lr:f32}
@group(0) @binding(0) var<storage,read> x:array<f32>;
@group(0) @binding(1) var<storage,read> y:array<f32>;
@group(0) @binding(2) var<storage,read_write> w:array<f32>;
@group(0) @binding(3) var<storage,read_write> state:array<f32>;
@group(0) @binding(4) var<storage,read_write> partial:array<f32>;
@group(0) @binding(5) var<storage,read_write> metric:array<f32>;
@group(0) @binding(6) var<uniform> p:Params;
var<workgroup> sums:array<f32,64>;
@compute @workgroup_size(64) fn forwardPass(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=p.n){return;}let base=4u*(p.d+1u);let row=i*10u;
 var z=w[base+4u];for(var j=0u;j<4u;j++){let start=j*(p.d+1u);var a=w[start+p.d];
 for(var k=0u;k<p.d;k++){a+=w[start+k]*x[i*p.d+k];}
 let v=tanh(a);state[row+j]=v;z+=v*w[base+j];}
 let error=1.0/(1.0+exp(-clamp(z,-80.,80.)))-y[i];
 for(var j=0u;j<4u;j++){let a=state[row+j];state[row+4u+j]=error*w[base+j]*(1.0-a*a);}
 state[row+8u]=error;state[row+9u]=max(0.,z)-z*y[i]+log(1.0+exp(-abs(z)));
}
@compute @workgroup_size(64) fn gradient(@builtin(workgroup_id) g:vec3u,@builtin(local_invocation_index) lane:u32){
 let i=g.x*64u+lane;let k=g.y;let base=4u*(p.d+1u);var v=0.;
 if(i<p.n){let row=i*10u;if(k<base){let j=k/(p.d+1u);let col=k%(p.d+1u);
 v=state[row+4u+j];if(col<p.d){v*=x[i*p.d+col];}}
 else if(k<base+4u){v=state[row+8u]*state[row+k-base];}
 else if(k==base+4u){v=state[row+8u];}else{v=state[row+9u];}}
 sums[lane]=v;workgroupBarrier();
 for(var step=32u;step>0u;step/=2u){if(lane<step){sums[lane]+=sums[lane+step];}workgroupBarrier();}
 if(lane==0u){partial[k*p.groups+g.x]=sums[0];}
}
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3u){
 let k=id.x;let nw=4u*(p.d+1u)+5u;if(k>nw){return;}var v=0.;
 for(var j=0u;j<p.groups;j++){v+=partial[k*p.groups+j];}v/=f32(p.n);
 if(k==nw){metric[0]=v;}else{w[k]-=p.lr*v;}
}`;
export async function trainNetworkGPU(x,y,{dims:d,epochs=24,lr=.25,onEpoch,signal}) {
  const adapter=await navigator.gpu?.requestAdapter();
  if(!adapter)throw Error('No WebGPU adapter available. Choose CPU.');
  const device=await adapter.requestDevice(), owned=[], U=GPUBufferUsage;
  function buffer(bytes,usage,data){
    const b=device.createBuffer({size:bytes,usage,mappedAtCreation:!!data});owned.push(b);
    if(data){new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));b.unmap();}
    return b;
  }
  try{
    const start=initial(d),nw=start.length, groups=Math.ceil(y.length/64),p=new ArrayBuffer(16);
    new Uint32Array(p).set([y.length,d,groups]);new Float32Array(p)[3]=lr;
    const buffers=[buffer(x.byteLength,U.STORAGE,x),buffer(y.byteLength,U.STORAGE,y),
      buffer(nw*4,U.STORAGE|U.COPY_SRC,start),buffer(y.length*40,U.STORAGE),
      buffer((nw+1)*groups*4,U.STORAGE),buffer(4,U.STORAGE|U.COPY_SRC),buffer(16,U.UNIFORM,new Uint8Array(p))];
    const staging=buffer((nw+1)*4,U.COPY_DST|U.MAP_READ);
    const layout=device.createBindGroupLayout({entries:buffers.map((_,i)=>({binding:i,visibility:GPUShaderStage.COMPUTE,buffer:{type:i<2?'read-only-storage':i===6?'uniform':'storage'}}))});
    const bindings=device.createBindGroup({layout,entries:buffers.map((b,i)=>({binding:i,resource:{buffer:b}}))});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]}),module=device.createShaderModule({code:shader});
    const pipes=await Promise.all(['forwardPass','gradient','update'].map(entryPoint=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
    const loss=[];let weights;
    for(let epoch=1;epoch<=epochs;epoch++){
      signal?.throwIfAborted();const enc=device.createCommandEncoder();
      for(const [pipe,n,m] of [[pipes[0],groups,1],[pipes[1],groups,nw+1],[pipes[2],Math.ceil((nw+1)/64),1]]){
        const pass=enc.beginComputePass();pass.setPipeline(pipe);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(n,m);pass.end();
      }
      enc.copyBufferToBuffer(buffers[5],0,staging,0,4);
      if(epoch===epochs)enc.copyBufferToBuffer(buffers[2],0,staging,4,nw*4);
      device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);
      const values=new Float32Array(staging.getMappedRange());loss.push(values[0]);
      if(epoch===epochs)weights=new Float32Array(values.subarray(1));staging.unmap();
      if(!Number.isFinite(loss.at(-1)))throw Error('Training loss became nonfinite.');
      onEpoch?.({epoch,loss:loss.at(-1),backend:'WebGPU'});
    }
    return {weights, loss, backend:'WebGPU', adapter:describeAdapter(adapter)};
  }finally{for(const b of owned)b.destroy();device.destroy();}
}
