// CMU Flite 2.2, US English SLT. Build recipe: cli/voice/build.py.
// The reactor reads text and writes PCM in memory; it needs no filesystem.
const noFile = () => 8; // WASI EBADF
const wasi = {fd_close:noFile, fd_fdstat_get:noFile, fd_prestat_get:noFile, fd_prestat_dir_name:noFile,
  fd_read:noFile, fd_seek:noFile, fd_write:noFile,
  proc_exit(code) { throw new Error('Voice engine exited with code ' + code); }};
let ready;
async function load() {
  const response = await fetch(new URL('../art/audio/reader/english.wasm', import.meta.url));
  if (!response.ok) throw new Error('Could not load the reading voice.');
  const {instance} = await WebAssembly.instantiate(await response.arrayBuffer(), {wasi_snapshot_preview1:wasi});
  instance.exports._initialize();
  return instance.exports;
}

self.onmessage = async ({data:{id,text}}) => {
  try {
    const engine = await (ready ??= load());
    const spoken = text.replace(/\bLiDAR\b/gi,'lie dar').replace(/\bPLY\b/g,'P L Y').replace(/\bF1\b/g,'F one');
    const bytes = new TextEncoder().encode(spoken);
    if (bytes.length >= 2048) throw new Error('Reading passage exceeds voice buffer.');
    const dest = new Uint8Array(engine.memory.buffer,engine.text_buffer(),bytes.length+1);
    dest.set(bytes);
    dest[bytes.length] = 0;
    const length = engine.synthesize();
    if (!length) throw new Error('The voice returned no audio for this passage.');
    const samples = new Int16Array(engine.memory.buffer,engine.samples(),length).slice();
    self.postMessage({id,samples,rate:engine.sample_rate()},[samples.buffer]);
  } catch (error) {
    ready = undefined;
    self.postMessage({id,error:error.message});
  }
};
