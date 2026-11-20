import {describeAdapter} from './model.js';
import {initializeFit, forward, trackFit} from './network.js';
export {predictNetwork} from './network.js';

export async function trainNetworkCPU(x, y, options) {
  const plan = initializeFit(x,y,options);
  const {shape, weights, lr, decay} = plan;
  const {layers, dims, units} = shape;
  const values = new Float64Array(units), deltas = new Float64Array(units);
  const gradient = new Float64Array(weights.length), velocity = new Float64Array(weights.length);
  const history = trackFit(plan,options,'CPU');
  let nextPreview = 0;
  let lastYield = performance.now();
  for (let epoch = 1; ; epoch++) {
    options.signal?.throwIfAborted();
    let total = 0;
    for (let first=0; first<y.length; first+=plan.batchSize) {
      const end=Math.min(first+plan.batchSize,y.length);
      gradient.fill(0);
      for (let i = first; i < end; i++) {
        const z = forward(x,i*dims,weights,shape,values);
        total += Math.max(0,z)-z*y[i]+Math.log1p(Math.exp(-Math.abs(z)));
        deltas[units-1] = values[units-1] - y[i];
        for (let l = layers.length-1; l >= 0; l--) {
          const layer = layers[l], next = layers[l+1];
          const previous = l ? values : x, start = l ? layers[l-1].node : i*dims;
          for (let j = 0; j < layer.width; j++) {
            const node = layer.node+j, base = layer.weight+j*(layer.inputs+1);
            if (next) {
              let sum = 0;
              for (let n = 0; n < next.width; n++) sum += weights[next.weight+n*(layer.width+1)+j]*deltas[next.node+n];
              const a = values[node];
              deltas[node] = sum*(shape.activation === 'relu' ? Number(a>0) : 1-a*a);
            }
            for (let k = 0; k < layer.inputs; k++) gradient[base+k] += deltas[node]*previous[start+k];
            gradient[base+layer.inputs] += deltas[node];
          }
        }
      }
      for (let k = 0; k < weights.length; k++) {
        velocity[k] = decay*velocity[k] + gradient[k]/(end-first);
        weights[k] -= lr*velocity[k];
      }
    }
    if (options.onCheckpoint && performance.now() >= nextPreview) {
      options.onCheckpoint(epoch,weights);
      nextPreview = performance.now() + 400;
    }
    if (history.record(epoch,total/y.length)) break;
    if (performance.now()-lastYield >= 20) { await new Promise(resolve => setTimeout(resolve,0)); lastYield = performance.now(); }
  }
  checkWeights(weights);
  return {weights, backend:'CPU', ...history.result()};
}

function checkWeights(weights) {
  if (!weights.every(Number.isFinite)) throw Error('Weights became nonfinite. Try a smaller learning rate.');
}

// Specialize the same dense layout for the requested shape. One invocation handles
// a sample's forward/backward pass; workgroups then reduce each parameter gradient.
function shaderFor(shape) {
  const {units, layers, count, dims, activation} = shape;
  const rowSize = 2*units+1, last = units-1;
  const input = (l,k) => l ? `state[row+${layers[l-1].node}u+${k}]` : `x[i*${dims}u+${k}]`;
  const forwardLayers = layers.map(({width,inputs,weight,node},l) => `
    for(var j=0u;j<${width}u;j++){
      let base=${weight}u+j*${inputs+1}u;
      var z=w[base+${inputs}u];
      for(var k=0u;k<${inputs}u;k++){z+=w[base+k]*${input(l,'k')};}
      ${l === layers.length-1 ? `state[row+${last}u]=1./(1.+exp(-clamp(z,-80.,80.)));
      state[row+${2*units}u]=max(0.,z)-z*y[i]+log(1.+exp(-abs(z)));` :
      `state[row+${node}u+j]=${activation === 'relu' ? 'max(0.,z)' : 'tanh(z)'};`}
    }`).join('\n');
  const backwardLayers = layers.slice(0,-1).map(({width,node},l) => {
    const next = layers[l+1];
    return `for(var j=0u;j<${width}u;j++){
      var delta=0.;for(var n=0u;n<${next.width}u;n++){
        delta+=w[${next.weight}u+n*${width+1}u+j]*state[row+${units+next.node}u+n];}
      let a=state[row+${node}u+j];state[row+${units+node}u+j]=delta*${activation === 'relu' ? 'select(0.,1.,a>0.)' : '(1.-a*a)'};
    }`;
  }).reverse().join('\n');
  const gradients = layers.map(({inputs,weight,width,node},l) => `if(k<${weight+width*(inputs+1)}u){
    let j=(k-${weight}u)/${inputs+1}u;let col=(k-${weight}u)%${inputs+1}u;
    v=state[row+${units+node}u+j];if(col<${inputs}u){v*=${input(l,'col')};}
  }`).join('else ');
  return `
struct Params { n:u32, groups:u32, lr:f32, decay:f32, first:u32, batch:u32 }
@group(0) @binding(0) var<storage,read> x:array<f32>;
@group(0) @binding(1) var<storage,read> y:array<f32>;
@group(0) @binding(2) var<storage,read_write> w:array<f32>;
@group(0) @binding(3) var<storage,read_write> state:array<f32>;
@group(0) @binding(4) var<storage,read_write> partial:array<f32>;
@group(0) @binding(5) var<storage,read_write> metric:array<f32>;
@group(0) @binding(6) var<uniform> p:Params;
var<workgroup> sums:array<f32,64>;
@compute @workgroup_size(64) fn forwardPass(@builtin(global_invocation_id) id:vec3u){
 let local=id.x;if(local>=p.n){return;}let i=p.first+local;let row=local*${rowSize}u;
 ${forwardLayers}
 state[row+${units+last}u]=state[row+${last}u]-y[i];
 ${backwardLayers}
}
@compute @workgroup_size(64) fn gradient(@builtin(workgroup_id) g:vec3u,@builtin(local_invocation_index) lane:u32){
 let local=g.x*64u+lane;let i=p.first+local;let k=g.y;var v=0.;
 if(local<p.n){let row=local*${rowSize}u;${gradients}else{v=state[row+${2*units}u];}}
 sums[lane]=v;workgroupBarrier();
 for(var step=32u;step>0u;step/=2u){if(lane<step){sums[lane]+=sums[lane+step];}workgroupBarrier();}
 if(lane==0u){partial[k*p.groups+g.x]=sums[0];}
}
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3u){
 let k=id.x;if(k>${count}u){return;}var v=0.;
 for(var j=0u;j<p.groups;j++){v+=partial[k*p.groups+j];}v/=f32(p.n);
 if(k==${count}u){metric[p.batch]=v*f32(p.n);}else{
   let speed=p.decay*w[${count}u+k]+v;w[${count}u+k]=speed;w[k]-=p.lr*speed;}
}`;
}

export async function trainNetworkGPU(x,y,options) {
  const plan = initializeFit(x,y,options);
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw Error('No WebGPU adapter available. Choose CPU.');
  const device = await adapter.requestDevice(), owned = [], U = GPUBufferUsage;
  function buffer(bytes,usage,data) {
    const b = device.createBuffer({size:bytes,usage,mappedAtCreation:!!data});
    owned.push(b);
    if (data) {new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)); b.unmap();}
    return b;
  }
  try {
    const {count,units} = plan.shape, groups = Math.ceil(plan.batchSize/64);
    const batches = Math.ceil(y.length/plan.batchSize);
    const stateBytes = plan.batchSize*(2*units+1)*4, partialBytes = (count+1)*groups*4;
    if (Math.max(x.byteLength,stateBytes,partialBytes) > Math.min(device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize) ||
        Math.max(groups,count+1) > device.limits.maxComputeWorkgroupsPerDimension) throw Error('This network and dataset exceed the adapter limits.');
    const alignment = device.limits.minUniformBufferOffsetAlignment;
    const stride = Math.ceil(32/alignment)*alignment;
    const params = new ArrayBuffer(batches*stride);
    const batchGroups = [];
    for (let batch=0; batch<batches; batch++) {
      const first=batch*plan.batchSize, size=Math.min(plan.batchSize,y.length-first);
      const groupsThisBatch=Math.ceil(size/64);
      const integers=new Uint32Array(params,batch*stride,6);
      integers.set([size,groupsThisBatch]);
      new Float32Array(params,batch*stride+8,2).set([plan.lr,plan.decay]);
      integers.set([first,batch],4);
      batchGroups.push(groupsThisBatch);
    }
    const buffers = [buffer(x.byteLength,U.STORAGE,x),buffer(y.byteLength,U.STORAGE,y),
      buffer(count*8,U.STORAGE|U.COPY_SRC,plan.weights),buffer(stateBytes,U.STORAGE),
      buffer(partialBytes,U.STORAGE),buffer(batches*4,U.STORAGE|U.COPY_SRC),buffer(params.byteLength,U.UNIFORM,new Uint8Array(params))];
    const staging = buffer((options.onCheckpoint ? count+batches : Math.max(count,batches))*4,U.COPY_DST|U.MAP_READ);
    const layout = device.createBindGroupLayout({entries:buffers.map((_,i)=>({binding:i,visibility:GPUShaderStage.COMPUTE,buffer:{hasDynamicOffset:i===6,type:i<2?'read-only-storage':i===6?'uniform':'storage'}}))});
    const bindings = device.createBindGroup({layout,entries:buffers.map((b,i)=>({binding:i,resource:i===6?{buffer:b,size:32}:{buffer:b}}))});
    const pipelineLayout = device.createPipelineLayout({bindGroupLayouts:[layout]});
    const module = device.createShaderModule({code:shaderFor(plan.shape)});
    const pipes = await Promise.all(['forwardPass','gradient','update'].map(entryPoint=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
    const history = trackFit(plan,options,'WebGPU');
    let nextPreview = 0;
    for (let epoch = 1; ; epoch++) {
      options.signal?.throwIfAborted();
      const preview = options.onCheckpoint && performance.now() >= nextPreview;
      // Limit command buffers for long epochs on small batches and software adapters.
      for (let start=0; start<batches; start+=32) {
        options.signal?.throwIfAborted();
        const enc=device.createCommandEncoder(), end=Math.min(batches,start+32);
        for (let batch=start; batch<end; batch++) {
          const nGroups=batchGroups[batch];
          for (const [pipe,n,m] of [[pipes[0],nGroups,1],[pipes[1],nGroups,count+1],[pipes[2],Math.ceil((count+1)/64),1]]) {
            const pass=enc.beginComputePass();
            pass.setPipeline(pipe);pass.setBindGroup(0,bindings,[batch*stride]);
            pass.dispatchWorkgroups(n,m);pass.end();
          }
        }
        if (end === batches) {
          enc.copyBufferToBuffer(buffers[5],0,staging,0,batches*4);
          if (preview) enc.copyBufferToBuffer(buffers[2],0,staging,batches*4,count*4);
        }
        device.queue.submit([enc.finish()]);
        if (end<batches) await device.queue.onSubmittedWorkDone();
      }
      await staging.mapAsync(GPUMapMode.READ);
      const mapped = staging.getMappedRange();
      const snapshot = preview ? new Float32Array(mapped,batches*4,count).slice() : null;
      const loss = new Float32Array(mapped,0,batches).reduce((sum,v)=>sum+v,0)/y.length;
      staging.unmap();
      if (snapshot) { options.onCheckpoint(epoch,snapshot); nextPreview=performance.now()+400; }
      if (history.record(epoch,loss)) break;
    }
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(buffers[2],0,staging,0,count*4);
    device.queue.submit([enc.finish()]); await staging.mapAsync(GPUMapMode.READ);
    const weights = new Float32Array(staging.getMappedRange().slice(0,count*4)); staging.unmap();
    checkWeights(weights);
    return {weights,backend:'WebGPU',adapter:describeAdapter(adapter),...history.result()};
  } finally { for (const b of owned) b.destroy(); device.destroy(); }
}
