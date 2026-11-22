import {filmTiming} from './film-timing.js';
import {language,translate} from './language.js';
import {filmLines} from './language-core.js';
import {createFilmArt} from './field-film-art.js';
import {createNarrationPlayer} from './narration-player.js';

// The English voice tracks use Kokoro v1.0 (af_heart). The optional field ambience is synthesized wind and leaf rustle.
const scenes = [
  {id:'leaf', title:'Where does the light land?',
    action:'Try scanning a row', lesson:'sampleRow', description:'Four light pulses strike the curved canopy of a butterhead lettuce. The first surfaces they encounter send echoes back.'},
  {id:'returns', title:'Where is the plant?',
    action:'Place a pin', lesson:'placePin', description:'An illustrated scan sweeps across a lettuce, replacing its leaf surfaces with sample dots. A gold ring settles over its estimated center.'},
  {id:'prediction', title:'Can height fool a detector?',
    action:'Try one model update', lesson:'learnWeight', description:'A measuring line meets the lettuce and weed at the same height. One learning step raises both crop scores from 0.50 to 0.62.'}
];

export function initFieldFilm(practice) {
  const film = document.getElementById('film');
  const play = film.querySelector('#playFilm');
  const notice = film.querySelector('#filmAudioNotice');
  const buttons = [...film.querySelectorAll('[data-shot-index]')];
  const stage = film.querySelector('.filmStage');
  const draw = createFilmArt(stage);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let request;
  let index = 0, offset = 0, playing = false, finished = false;

  // Sharing one grid cell reserves the tallest caption at the current width.
  // Changing shots never moves the lens or the playback controls.
  const caption = film.querySelector('.filmCaption');
  const first = caption.firstElementChild;
  const pages = scenes.map((scene,i) => {
    const page = i ? first.cloneNode(true) : first;
    page.querySelector('.shotTitle').textContent = scene.title;
    page.querySelector('.shotText').textContent = filmLines[scene.id][0];
    const link = page.querySelector('.tryShot');
    link.textContent = scene.action;
    link.href = '?view=learn&step=lessons&open=' + encodeURIComponent('#' + scene.lesson);
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      pause();
      practice(scene.lesson);
    });
    if (i) caption.append(page);
    return page;
  });

  const player = createNarrationPlayer({
    onEnded() {
      if (index + 1 < scenes.length) {
        select(index + 1);
        start();
      } else {
        finished = true;
        pause();
        draw(scenes[index].id,1);
      }
    },
    onAudioError() { notice.textContent = 'Some audio is unavailable. The story continues with captions.'; }
  });

  function select(next) {
    index = next;
    offset = 0;
    finished = false;
    const scene = scenes[index];
    film.dataset.shot = String(index);
    pages.forEach((page,i) => { page.inert = i !== index; });
    stage.setAttribute('aria-label', scene.description);
    draw(scene.id,1);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }

  const duration=()=>filmTiming[language()][index];
  function tick() {
    const scene = scenes[index];
    draw(scene.id,player.position()/duration());
    request = requestAnimationFrame(tick);
  }

  function syncMotion() {
    cancelAnimationFrame(request);
    if (reduced.matches || finished) draw(scenes[index].id,1);
    else if (playing) tick();
    else draw(scenes[index].id,offset ? offset/duration() : 1);
  }
  reduced.addEventListener('change',syncMotion);

  function pause() {
    if (playing) offset = player.pause();
    cancelAnimationFrame(request);
    playing = false;
    film.classList.remove('playing');
    play.textContent = finished ? 'Replay' : offset > 0 ? 'Resume' : 'Play';
  }

  function start() {
    const {id} = scenes[index];
    const track = kind => new URL('../art/audio/' + (kind==='voice' && language()!=='en' ? language()+'-' : '') + id + '-' + kind + '.mp3', import.meta.url).href;
    playing = true;
    film.classList.add('playing');
    play.textContent = 'Pause';
    notice.textContent = '';
    player.play({duration:duration(), narration:track('voice'), ambience:track('ambience')}, offset);
    syncMotion();
  }

  for (const input of film.querySelectorAll('[data-audio-track]')) {
    const track = input.dataset.audioTrack;
    const key = 'crop-trainer-audio-' + track;
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) input.checked = saved === 'on';
    } catch { /* Storage is optional. */ }
    player.setEnabled(track, input.checked);
    input.addEventListener('change', () => {
      player.setEnabled(track, input.checked);
      try { localStorage.setItem(key, input.checked ? 'on' : 'off'); } catch { /* Session choice still applies. */ }
    });
  }
  play.addEventListener('click', () => {
    if (playing) { pause(); return; }
    if (finished) select(0);
    start();
  });
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    select(i);
    if (playing) start();
    else pause();
  }));
  window.addEventListener('crop-language-change',()=>{pause();select(index);play.textContent=translate('Play');});
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  select(0);
  return pause;
}
