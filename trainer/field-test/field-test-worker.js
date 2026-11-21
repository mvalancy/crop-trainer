import {parsePly, MAX_PLY_BYTES} from './ply.js';
import {MAX_REFERENCE_BYTES} from './references.js?v=systems1';
import {runFieldTest} from './score-scan.js?v=cutoff1';

let xyz, scan;
async function read(file, limit) {
  if (!file || file.size > limit) throw Error('Choose a file of at most '+limit/(1024*1024)+' MiB.');
  const bytes = await file.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = Array.from(hash, b => b.toString(16).padStart(2,'0')).join('');
  return {bytes, identity:{name:file.name, sha256}};
}

async function loadScan(file) {
  const input = await read(file, MAX_PLY_BYTES);
  xyz = parsePly(input.bytes);
  scan = input.identity;
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < xyz.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a],xyz[i+a]);
      max[a] = Math.max(max[a],xyz[i+a]);
    }
  }
  const count = xyz.length/3;
  const sampled = new Float64Array(2*Math.min(5000,count));
  for (let i = 0; i < sampled.length/2; i++) {
    const offset = 3*Math.floor(i*count/(sampled.length/2));
    sampled[2*i] = xyz[offset];
    sampled[2*i+1] = xyz[offset+1];
  }
  self.postMessage({type:'loaded',min,max,count,sampled},[sampled.buffer]);
}

async function detect({modelFile,labelFile,alignment,thresholdOverride}) {
  if (!xyz) throw Error('Choose a scan before running the detector.');
  const [weights,annotations] = await Promise.all([
    read(modelFile, 1024*1024), labelFile ? read(labelFile,MAX_REFERENCE_BYTES) : null
  ]);
  const decode = bytes => new TextDecoder().decode(bytes);
  let model;
  try {model = JSON.parse(decode(weights.bytes));}
  catch {throw Error('Choose a valid JSON weights export from the Training shed.');}
  const labels = annotations ? {text:decode(annotations.bytes),filename:labelFile.name} : null;
  const tileId = /^([0-9a-f]{16})\.ply$/i.exec(scan.name)?.[1].toLowerCase();
  const result = runFieldTest({model,xyz,alignment,labels,tileId,thresholdOverride});
  const files = {model:weights.identity,scan,labels:annotations?.identity ?? null};
  self.postMessage({type:'done',report:{format:'crop-trainer-field-test-v1',files,...result}});
}

self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') await loadScan(data.file);
    else if (data.type === 'detect') await detect(data);
  } catch (error) {self.postMessage({type:'error',message:error.message});}
};
