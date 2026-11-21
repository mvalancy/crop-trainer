// Play a narrated cue on one clock. Both tracks are optional. Muting a track
// changes its gain, so bringing it back never restarts a sentence or a scene.
export function createNarrationPlayer({onEnded, onAudioError}) {
  let context, current, generation = 0;
  const buffers = new Map();
  const mix = {narration:true, ambience:true};
  const gains = new Map();

  function setEnabled(track, enabled) {
    mix[track] = enabled;
    const gain = gains.get(track);
    if (gain) gain.gain.setTargetAtTime(enabled ? 1 : 0, context.currentTime, .015);
  }

  async function load(url, signal) {
    if (buffers.has(url)) return buffers.get(url);
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error('Audio request failed');
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (!signal.aborted) {
      if (buffers.size >= 8) buffers.delete(buffers.keys().next().value);
      buffers.set(url, buffer);
    }
    return buffer;
  }

  function pause() {
    generation++;
    if (!current) return 0;
    const item = current;
    current = null;
    item.request.abort();
    clearTimeout(item.timer);
    for (const source of item.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    if (context?.state === 'running') context.suspend().catch(() => {});
    const elapsed = item.started == null ? 0 : item.now() - item.started;
    return Math.min(item.duration, item.offset + Math.max(0, elapsed));
  }

  async function play(cue, offset = 0) {
    pause();
    const ticket = generation;
    const item = {offset, duration:cue.duration ?? Infinity, sources:[], request:new AbortController()};
    current = item;
    function finish() {
      if (generation !== ticket) return;
      pause();
      onEnded();
    }
    const timeout = setTimeout(() => item.request.abort(), cue.render ? 45000 : 15000);
    try {
      context ??= new AudioContext();
      // Resume from the Play gesture, before waiting for network or decoding.
      const tracks = Object.keys(mix).filter(name => cue[name] || (name === 'narration' && cue.render));
      const {signal} = item.request;
      const abandoned = new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}));
      const decode = name => name === 'narration' && cue.render
        ? cue.render(context, signal) : load(cue[name], signal);
      const [, decoded] = await Promise.race([
        Promise.all([context.resume(), Promise.all(tracks.map(name => decode(name).catch(() => null)))]),
        abandoned
      ]);
      if (generation !== ticket) return;
      if (!decoded.some(Boolean)) throw new Error('No audio available');
      if (decoded.some(buffer => !buffer)) onAudioError();
      item.duration = Math.max(cue.duration || 0, ...decoded.map(buffer => buffer?.duration || 0));
      item.now = () => context.currentTime;
      item.started = context.currentTime;
      tracks.forEach((track, i) => {
        const buffer = decoded[i];
        if (!buffer || offset >= buffer.duration) return;
        if (!gains.has(track)) {
          const gain = context.createGain();
          gain.gain.value = mix[track] ? 1 : 0;
          gain.connect(context.destination);
          gains.set(track, gain);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gains.get(track));
        source.start(item.started, offset);
        item.sources.push(source);
      });
      // Keep any trailing caption time on the same clock as the audio.
      const end = context.createConstantSource();
      end.offset.value = 0;
      end.connect(context.destination);
      end.onended = finish;
      end.start();
      end.stop(item.started + Math.max(0, item.duration - offset));
      item.sources.push(end);
    } catch {
      if (generation !== ticket) return;
      onAudioError();
      if (!cue.duration) { pause(); return; }
      item.now = () => performance.now() / 1000;
      item.started = item.now();
      item.timer = setTimeout(finish, Math.max(0, cue.duration - offset) * 1000);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {play, pause, setEnabled};
}
