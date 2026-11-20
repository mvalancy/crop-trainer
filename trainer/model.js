// Linear logit head, batch logistic cross-entropy. Standardize features upstream.
export const MAX_EPOCHS = 5000;
const sigmoid = x => 1/(1+Math.exp(-x));
const lossAt = (z,y) => Math.max(z,0)-y*z+Math.log1p(Math.exp(-Math.abs(z)));
function valid(X,Y,dims,epochs,lr) {
  if (!Number.isInteger(dims)||dims<1||dims>64||!(X instanceof Float32Array)||!(Y instanceof Float32Array)||
      !Y.length||X.length!==Y.length*dims||!Number.isInteger(epochs)||epochs<1||epochs>MAX_EPOCHS||!Number.isFinite(lr)||lr<=0)
    throw new Error('Invalid detector training arrays or options.');
}
export function predict(X,w,dims) {
  const out=new Float32Array(X.length/dims);
  for(let i=0;i<out.length;i++){
    let z=w[dims]; for(let j=0;j<dims;j++)z+=X[i*dims+j]*w[j];out[i]=sigmoid(z);
  }
  return out;
}
export async function trainCPU(X,Y,{dims,epochs=25,lr=.25,onEpoch,signal}={}) {
  valid(X,Y,dims,epochs,lr);
  const weights=new Float32Array(dims+1),loss=[],backend='CPU';
  const gradient=new Float64Array(dims+1);
  let lastYield=performance.now();
  for(let epoch=1;epoch<=epochs;epoch++){
    signal?.throwIfAborted();
    gradient.fill(0);
    let sum=0;
    for(let i=0;i<Y.length;i++){
      let z=weights[dims];for(let j=0;j<dims;j++)z+=X[i*dims+j]*weights[j];
      const error=sigmoid(z)-Y[i];sum+=lossAt(z,Y[i]);
      for(let j=0;j<dims;j++)gradient[j]+=error*X[i*dims+j];gradient[dims]+=error;
    }
    for(let j=0;j<=dims;j++)weights[j]-=lr*gradient[j]/Y.length;
    loss.push(sum/Y.length); onEpoch?.({epoch,loss:loss.at(-1),backend});
    if (performance.now()-lastYield>=20) {
      await new Promise(r=>setTimeout(r,0));
      signal?.throwIfAborted();
      lastYield=performance.now();
    }
  }
  return {weights,loss,backend};
}

const wgsl=`
struct Params { n:u32, d:u32, groups:u32, lr:f32 }
@group(0) @binding(0) var<storage, read> x:array<f32>;
@group(0) @binding(1) var<storage, read> y:array<f32>;
@group(0) @binding(2) var<storage, read_write> w:array<f32>;
@group(0) @binding(3) var<storage, read_write> partial:array<f32>;
@group(0) @binding(4) var<storage, read_write> metric:array<f32>;
@group(0) @binding(5) var<uniform> p:Params;
var<workgroup> sums:array<f32,64>;

@compute @workgroup_size(64)
fn gradient(@builtin(workgroup_id) g:vec3u,@builtin(local_invocation_index) lane:u32) {
  let j=g.y;
  let i=g.x*64u+lane;
  var v=0.0;
  if (i<p.n) {
    var z=w[p.d];
    for(var k=0u;k<p.d;k++){z+=x[i*p.d+k]*w[k];}
    if(j==p.d+1u) {
      v=max(z,0.0)-y[i]*z+log(1.0+exp(-abs(z)));
    } else {
      v=1.0/(1.0+exp(-clamp(z,-80.0,80.0)))-y[i];
      if(j<p.d){v*=x[i*p.d+j];}
    }
  }
  sums[lane]=v;
  workgroupBarrier();
  for(var stride=32u;stride>0u;stride/=2u){
    if(lane<stride){sums[lane]+=sums[lane+stride];}
    workgroupBarrier();
  }
  if(lane==0u){partial[j*p.groups+g.x]=sums[0];}
}
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id:vec3u) {
  let j=id.x;
  if(j>p.d+1u){return;}
  var s=0.0;
  for(var g=0u;g<p.groups;g++){s+=partial[j*p.groups+g];}
  s/=f32(p.n);
  if(j==p.d+1u){metric[0]=s;} else {w[j]-=p.lr*s;}
}
`;

export async function trainGPU(X,Y,{dims,epochs=25,lr=.25,onEpoch,signal}={}) {
  valid(X,Y,dims,epochs,lr); signal?.throwIfAborted();
  if (!globalThis.navigator?.gpu) throw new Error('WebGPU is unavailable. Use a WebGPU-capable browser in a secure context.');
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter)throw new Error('No usable WebGPU adapter was found.');
  const device=await adapter.requestDevice(), buffers=[];
  const U=GPUBufferUsage;
  const buf=(size,usage,data)=>{
    const b=device.createBuffer({size,usage,mappedAtCreation:!!data}); buffers.push(b);
    if(data){new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));b.unmap();}
    return b;
  };
  try {
    const groups=Math.ceil(Y.length/64), stride=dims+1;
    if(groups>device.limits.maxComputeWorkgroupsPerDimension||X.byteLength>device.limits.maxStorageBufferBindingSize||
       groups*(dims+2)*4>device.limits.maxStorageBufferBindingSize)throw new Error('Training batch exceeds WebGPU limits.');
    const x=buf(X.byteLength,U.STORAGE,X),y=buf(Y.byteLength,U.STORAGE,Y),
      w=buf(stride*4,U.STORAGE|U.COPY_SRC),partial=buf(groups*(dims+2)*4,U.STORAGE),
      metric=buf(4,U.STORAGE|U.COPY_SRC), staging=buf((stride+1)*4,U.COPY_DST|U.MAP_READ);
    const params=new ArrayBuffer(16);
    new Uint32Array(params).set([Y.length,dims,groups]);new Float32Array(params)[3]=lr;
    const uniform=buf(16,U.UNIFORM,new Uint8Array(params));
    const module=device.createShaderModule({code:wgsl});
    if(module.getCompilationInfo){
      const info=await module.getCompilationInfo();
      const errors=info.messages.filter(m=>m.type==='error').map(m=>m.message);
      if(errors.length)throw new Error('WebGPU shader failed: '+errors.join('; '));
    }
    const layout=device.createBindGroupLayout({entries:[0,1,2,3,4,5].map(binding=>({
      binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding<2?'read-only-storage':binding===5?'uniform':'storage'}
    }))});
    const pl=device.createPipelineLayout({bindGroupLayouts:[layout]});
    const [grad,step]=await Promise.all(['gradient','update'].map(entryPoint=>device.createComputePipelineAsync({layout:pl,compute:{module,entryPoint}})));
    const bind=device.createBindGroup({layout,entries:[x,y,w,partial,metric,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))});
    const loss=[],backend='WebGPU';
    let weights;
    for(let epoch=1;epoch<=epochs;epoch++){
      signal?.throwIfAborted();
      const enc=device.createCommandEncoder();
      let pass=enc.beginComputePass();pass.setPipeline(grad);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups,dims+2);pass.end();
      pass=enc.beginComputePass();pass.setPipeline(step);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil((dims+2)/64));pass.end();
      enc.copyBufferToBuffer(metric,0,staging,0,4);
      if(epoch===epochs)enc.copyBufferToBuffer(w,0,staging,4,stride*4);
      device.queue.submit([enc.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const a=new Float32Array(staging.getMappedRange());loss.push(a[0]);
      if(epoch===epochs)weights=new Float32Array(a.subarray(1));
      staging.unmap();
      if(!Number.isFinite(loss.at(-1)))throw new Error('Training diverged; check input features and learning rate.');
      onEpoch?.({epoch,loss:loss.at(-1),backend});
    }
    return {weights,loss,backend};
  } finally {
    for(const b of buffers)b.destroy();
    device.destroy();
  }
}
