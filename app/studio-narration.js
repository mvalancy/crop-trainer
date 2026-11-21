import {createNarrationPlayer} from './narration-player.js';
import {createTextVoice} from './reader-audio.js';
import {readPassages} from './studio-passages.js';
import {voiceovers} from './studio-voiceovers.js';

const icon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h4l5-4v12l-5-4H4zM16 9q3 3 0 6m3-9q6 6 0 12"/></svg>';

export function createStudioNarration(home) {
  const widget = document.createElement('div');
  widget.className = 'studioListen';
  widget.innerHTML = '<button type="button" class="listenToggle" aria-label="Listen to this activity" aria-expanded="false">' + icon + '<span>Listen</span></button>';
  const toggle = widget.querySelector('button');
  const card = document.createElement('section');
  card.className = 'listenCard';
  card.setAttribute('aria-label','Narration player');
  card.hidden = true;
  card.innerHTML = '<header><strong></strong><button type="button" aria-label="Minimize narration">Hide</button><button type="button" aria-label="Close narration">×</button></header>' +
    '<label>Start at section<select aria-label="Start at section"></select></label><p class="listenTranscript"></p>' +
    '<div class="listenPlayback"><button type="button" aria-label="Previous passage">‹</button><button type="button">Pause</button><button type="button" aria-label="Next passage">›</button></div>';
  widget.append(card);
  const title = card.querySelector('strong'), transcript = card.querySelector('p');
  const select = card.querySelector('select');
  const [minimize, close] = card.querySelectorAll('header button');
  const [previous, play, next] = card.querySelectorAll('.listenPlayback button');
  let context, passages = [], index = 0, offset = 0, playing = false, finished = false, follow = false;
  let engaged = false;
  const synthesize = createTextVoice();
  const player = createNarrationPlayer({
    onEnded() {
      if (index + 1 < passages.length) { choose(index+1,true); return; }
      playing = false;
      finished = true;
      render();
    },
    onAudioError() {
      playing = follow = false;
      render();
      transcript.textContent = 'Audio is unavailable. ' + (passages[index]?.text || '');
    }
  });

  function prepare() {
    const {cue, roots, anchor} = context;
    passages = readPassages(roots);
    if (cue && voiceovers[cue]) passages.unshift({heading:'Overview', text:voiceovers[cue], cue});
    if (!passages.length) passages.push({text:context.title});
    const sections = passages.flatMap((passage,i) => passage.heading || i === 0 ? [[i, passage.heading || 'Beginning']] : []);
    select.replaceChildren(...sections.map(([i,label]) => new Option(label,String(i))));
    select.parentElement.hidden = sections.length === 1;
    const start = anchor && passages.findIndex(p=>p.heading === anchor);
    index = typeof start === 'number' && start >= 0 ? start : 0;
    offset = 0;
    finished = false;
  }
  function render() {
    toggle.setAttribute('aria-expanded',String(!card.hidden));
    toggle.dataset.playing = String(playing);
    toggle.setAttribute('aria-label',engaged ? 'Narration controls' : 'Listen to this activity');
    title.textContent = context?.title || '';
    transcript.textContent = passages[index]?.text || '';
    play.textContent = playing ? 'Pause' : finished ? 'Replay' : 'Play';
    previous.disabled = index === 0;
    next.disabled = index + 1 >= passages.length;
    for (const option of select.options) {
      if (Number(option.value) <= index) select.value = option.value;
    }
  }
  function start() {
    const passage = passages[index];
    const cue = passage.cue ? {narration:new URL('../art/audio/guide-' + passage.cue.toLowerCase() + '.mp3',import.meta.url).href}
      : {render:(context,signal) => synthesize(passage.text,context,signal)};
    playing = follow = true;
    finished = false;
    render();
    player.play(cue,offset);
  }
  function pause() {
    if (playing) offset = player.pause();
    playing = follow = false;
    render();
  }
  function choose(i, continuePlaying) {
    player.pause();
    index = i;
    offset = 0;
    playing = follow = finished = false;
    if (continuePlaying) start(); else render();
  }
  function dismiss(focus = false) {
    player.pause();
    card.hidden = true;
    engaged = false;
    playing = follow = finished = false;
    offset = 0;
    render();
    if (focus) toggle.focus({preventScroll:true});
  }
  toggle.addEventListener('click',() => {
    if (!card.hidden) { minimizeCard(); return; }
    card.hidden = false;
    if (engaged) { render(); return; }
    engaged = true;
    prepare();
    start();
  });
  function minimizeCard() {
    card.hidden = true;
    render();
    toggle.focus({preventScroll:true});
  }
  minimize.addEventListener('click',minimizeCard);
  close.addEventListener('click',() => dismiss(true));
  widget.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !card.hidden) {
      event.stopPropagation(); event.preventDefault(); dismiss(true);
    }
  });
  previous.addEventListener('click',() => choose(index-1,playing));
  next.addEventListener('click',() => choose(index+1,playing));
  select.addEventListener('change',() => choose(Number(select.value),playing));
  play.addEventListener('click',() => {
    if (playing) { pause(); return; }
    if (finished) prepare();
    start();
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden) pause(); });
  window.addEventListener('pagehide',pause);

  return {
    set(location) {
      if (!location) {
        dismiss(); context = null; widget.hidden = true; home.append(widget); return;
      }
      const host = location.host || home;
      if (widget.parentElement !== host) host.append(widget);
      widget.hidden = false;
      const changed = context?.key !== location.key;
      context = location;
      if (!changed || !engaged) return;
      const resume = follow;
      player.pause();
      playing = false;
      prepare();
      if (resume) start(); else render();
    },
    // Cancel pending speech as soon as navigation starts, even while an iframe loads.
    loading() {
      player.pause();
      playing = false;
      context = null;
      widget.hidden = true;
    }
  };
}
