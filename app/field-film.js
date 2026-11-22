import {filmLessons} from './film-lessons.js';
import {filmTiming} from './film-timing.js';
import {language,translate} from './language.js';
import {filmLines} from './language-core.js';
import {createFilmArt} from './field-film-art.js';
import {createNarrationPlayer} from './narration-player.js';

// The English voice tracks use Kokoro v1.0 (af_heart). The optional field ambience is synthesized wind and leaf rustle.
const lessonScene = id => ({id, title:filmLessons[id].title[0], tab:filmLessons[id].tab[0],
  action:filmLessons[id].action[0], destination:filmLessons[id].destination, description:filmLessons[id].line[0]});
const scenes = [
  {id:'leaf', tab:'Leaf', title:'Where does the light land?',
    action:'Try scanning a row', lesson:'sampleRow', description:'Four light pulses strike the curved canopy of a butterhead lettuce. The first surfaces they encounter send echoes back.'},
  {id:'returns', tab:'Returns', title:'Where is the plant?',
    action:'Place a pin', lesson:'placePin', description:'An illustrated scan sweeps across a lettuce, replacing its leaf surfaces with sample dots. A gold ring settles over its estimated center.'},
  lessonScene('labels'),
  {id:'prediction', tab:'Prediction', title:'Can height fool a detector?',
    action:'Try one model update', lesson:'learnWeight', description:'A measuring line meets the lettuce and weed at the same height. One learning step raises both crop scores from 0.50 to 0.62.'},
  lessonScene('epoch'), lessonScene('validation'), lessonScene('cutoff')
];

export function initFieldFilm(routeFor, openRoute) {
  const film = document.getElementById('film');
  const play = film.querySelector('#playFilm');
  const notice = film.querySelector('#filmAudioNotice');
  const list = film.querySelector('.shotList');
  const buttons = scenes.map((scene,i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.shotIndex = i;
    button.textContent = scene.tab;
    list.append(button);
    return button;
  });
  const stage = film.querySelector('.filmStage');
  const draw = createFilmArt(stage);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let request;
  let index = 0, offset = 0, playing = false, finished = false;

  // A scrollable transcript shares the fixed scene area with the action row.
  const caption = film.querySelector('.filmCaption');
  const transcript = caption.querySelector('.filmTranscript');
  const first = transcript.firstElementChild;
  const actions = caption.querySelector('.filmActions');
  const firstLink = actions.querySelector('.tryShot');
  // Intrinsic sizing reserves the widest playback word in the current language.
  for (const word of ['Play','Pause','Resume','Replay']) {
    const measure = document.createElement('span');
    measure.className = 'playWidth';
    measure.setAttribute('aria-hidden','true');
    measure.textContent = word;
    actions.append(measure);
  }
  const pages = scenes.map((scene,i) => {
    const page = i ? first.cloneNode(true) : first;
    page.querySelector('.shotTitle').textContent = scene.title;
    page.querySelector('.shotText').textContent = filmLines[scene.id][0];
    const link = i ? firstLink.cloneNode(false) : firstLink;
    link.textContent = scene.action;
    const destination = scene.destination || '#' + scene.lesson;
    link.href = routeFor(destination);
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      pause();
      openRoute(destination);
    });
    if (i) {transcript.append(page);actions.append(link);}
    return {page,link};
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
    film.dataset.scene = scene.id;
    transcript.scrollTop = 0;
    const tab = buttons[index];
    const delta = tab.getBoundingClientRect(), strip = list.getBoundingClientRect();
    list.scrollBy({left:delta.left < strip.left ? delta.left-strip.left : Math.max(0,delta.right-strip.right),behavior:'instant'});
    pages.forEach(({page,link},i) => { page.inert = link.inert = i !== index; });
    stage.setAttribute('aria-label', scene.description);
    draw(scene.id,1);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }

  const duration=()=>filmTiming[language()][scenes[index].id];
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
