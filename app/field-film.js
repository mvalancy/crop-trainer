import {createNarrationPlayer} from './narration-player.js';

// The English voice tracks use Kokoro v1.0 (af_heart). The field and instrument sounds are original.
const scenes = [
  {id:'leaf', duration:8, title:'Where does the light land?',
    text:'A laser samples the first surface it meets. Trace a ray down to the edge of a leaf.',
    action:'Try scanning a row', lesson:'sampleRow', description:'Light meets the leaves of a butterhead lettuce in a field at dusk.'},
  {id:'returns', duration:8.23, title:'Where is the plant?',
    text:'Seen from above, the returns form clusters. The gold ring marks one guess at a plant center.',
    action:'Place a pin', lesson:'placePin', description:'An illustrated overhead scan shows clusters of green dots with a gold ring on one cluster.'},
  {id:'prediction', duration:9.49, title:'Can height fool a detector?',
    text:'A lettuce and a weed reach the same height. Teach a model using only that clue and watch both scores change.',
    action:'Try one model update', lesson:'learnWeight', description:'A side view of a lettuce and a weed shows their leaves meeting the same height line.'}
];

function drawReturns(container) {
  // A schematic overhead scan. A leaf's centerline curves outward, with returns spreading across its blade.
  const marks=[];
  for (const [cx,cy,scale] of [[430,196,1.1],[333,84,.73],[528,80,.8],[337,308,.82],[548,288,.94],[156,160,.65]]) {
    for (let leaf=0;leaf<12;leaf++) {
      const angle=leaf*2.4, length=(leaf<6?57:35)*scale;
      for (let i=1;i<=16;i++) for (let j=-2;j<=2;j++) {
        const t=i/17, reach=t*length, across=j*Math.sin(t*Math.PI)*length*.087;
        const x=cx+reach*Math.cos(angle)-across*Math.sin(angle+t*.3);
        const y=cy+reach*Math.sin(angle)+across*Math.cos(angle+t*.3);
        marks.push('<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r=".96" fill="'+(j===0?'#daeaa3':i%3===0?'#9acc86':'#70ac8c')+'"/>');
      }
    }
  }
  container.innerHTML=marks.join('');
}

export function initFieldFilm(practice) {
  const film = document.getElementById('film');
  const play = film.querySelector('#playFilm');
  const link = film.querySelector('#tryShot');
  const notice = film.querySelector('#filmAudioNotice');
  const buttons = [...film.querySelectorAll('[data-shot-index]')];
  let index = 0, offset = 0, playing = false, finished = false;

  const player = createNarrationPlayer({
    onEnded() {
      if (index + 1 < scenes.length) {
        select(index + 1);
        start();
      } else {
        finished = true;
        pause();
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
    film.querySelector('#shotTitle').textContent = scene.title;
    film.querySelector('#shotText').textContent = scene.text;
    film.querySelector('#sceneDescription').textContent = scene.description;
    link.textContent = scene.action;
    link.href = '?view=learn&step=lessons&open=' + encodeURIComponent('#' + scene.lesson);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }

  function pause() {
    if (playing) offset = player.pause();
    playing = false;
    film.classList.remove('playing');
    play.textContent = finished ? 'Replay story' : offset > 0 ? 'Resume story' : 'Play story';
  }

  function start() {
    const {id, duration} = scenes[index];
    const track = kind => new URL('../art/audio/' + id + '-' + kind + '.mp3', import.meta.url).href;
    playing = true;
    film.classList.add('playing');
    play.textContent = 'Pause story';
    notice.textContent = '';
    player.play({duration, narration:track('voice'), ambience:track('ambience')}, offset);
  }

  for (const input of film.querySelectorAll('[data-audio-track]')) {
    const track = input.dataset.audioTrack;
    const key = 'crop-trainer-audio-' + track;
    try { input.checked = localStorage.getItem(key) !== 'off'; } catch { /* Storage is optional. */ }
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
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pause();
    practice(scenes[index].lesson);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  drawReturns(film.querySelector('#filmReturns'));
  select(0);
  return pause;
}
