import {heightScore, learnHeightWeight} from './weight-lesson.js';

const ramp = (time, begin, end) => {
  const t = Math.max(0, Math.min(1, (time-begin)/(end-begin)));
  return t*t*(3-2*t);
};
const attr = (node, key, value) => node.setAttribute(key, value);
const shift = (x,y) => 'translate('+x+' '+y+')';

export function createFilmArt(stage) {
  const get = selector => stage.querySelector(selector);
  // Coordinates are leaf intersections in the field illustration.
  const samples = [[-130,-94],[-69,-120],[16,-136],[96,-96]];
  const rays = get('.leafSamples');
  rays.innerHTML = samples.map(([x,y]) => '<g transform="'+shift(x,y)+'"><path d="M0 -230V0" stroke="#ddf8cc" stroke-opacity=".48" stroke-dasharray="2 4"/><circle class="photon" r="2.6" fill="#f3ffcf"/><circle class="reflected" r="2.4" fill="#ffe49e"/><ellipse class="echo" rx="8" ry="3.6" fill="none" stroke="#ffdd82"/><circle class="contact" r="2.8" fill="#ffecaa"/></g>').join('');
  const pulses = [...rays.children].map(group => ({
    group,photon:group.querySelector('.photon'),reflected:group.querySelector('.reflected'),echo:group.querySelector('.echo'),contact:group.querySelector('.contact')
  }));
  const camera = get('.leafCamera'), note = get('.leafNote');
  function leaf(t) {
    attr(camera,'transform','scale('+(1 + .045*ramp(t,0,.92))+')');
    pulses.forEach(({group,photon,reflected,echo,contact},i) => {
      const begin = .055 + i * .143;
      const travel = ramp(t,begin,begin+.13);
      const impact = ramp(t,begin+.12,begin+.3);
      attr(group,'opacity',ramp(t,begin,begin+.055));
      attr(photon,'cy',-182*(1-travel));
      attr(photon,'opacity',1-impact);
      const returning = ramp(t,begin+.13,begin+.29);
      attr(reflected,'cy',-182*returning);
      attr(reflected,'opacity',travel*(1-returning));
      attr(contact,'opacity',.18+.82*impact);
      attr(echo,'transform','scale('+(1+1.65*impact)+')');
      attr(echo,'opacity',travel*(1-.75*impact));
    });
    attr(note,'opacity',ramp(t,.64,.82));
  }

  const soil = get('.scanSoil'), canopy = get('.scanCanopy'), reveal = get('.scanReveal');
  const remaining = get('.scanRemaining'), beam = get('.scanBeam'), fix = get('.centerFix'), ring = get('.lockRing');
  function returns(t) {
    const drift = ramp(t,0,.8), sweep = ramp(t,.06,.69);
    attr(soil,'transform',shift(8*(1-drift),6*(1-drift))+' scale('+(1-.035*drift)+')');
    attr(canopy,'transform','scale('+(.91+.09*drift)+')');
    const x = -215 + 430*sweep;
    attr(reveal,'width',220 + x);
    attr(remaining,'x',x);
    attr(beam,'transform',shift(x,0));
    attr(beam,'opacity',ramp(t,.045,.13)*(1-ramp(t,.62,.72)));
    attr(fix,'opacity',ramp(t,.49,.68));
    attr(ring,'r',50-29*ramp(t,.52,.82));
  }

  const scoreboard = get('.scoreReadout');
  scoreboard.innerHTML = [[-98,'Lettuce'],[98,'Weed']].map(([x,name]) =>
    '<g transform="'+shift(x-45,116)+'"><text>'+name+' crop score</text><rect y="10" width="63" height="4" rx="2" fill="#526e61"/><rect class="scoreBar" y="10" height="4" rx="2" fill="#e5d991"/><text x="69" y="16" class="scoreValue"></text></g>').join('');
  const bars = [...scoreboard.querySelectorAll('.scoreBar')], scores = [...scoreboard.querySelectorAll('.scoreValue')];
  const caliper = get('.caliper'), label = get('.measureLabel'), rule = get('.measureRule');
  const pair = get('.pairedSamples');
  const signals = [...pair.children];
  const trainedWeight = learnHeightWeight(0);
  function prediction(t) {
    const measure = ramp(t,.06,.45);
    attr(caliper,'transform',shift(0,30-106*measure));
    attr(rule,'opacity',.38+.62*measure);
    const comparison = ramp(t,.46,.61);
    signals.forEach((sample,i) => {
      attr(sample,'cx',(i ? 99 : -99)*(1-comparison));
      attr(sample,'cy',-76+106*ramp(t,.61,.72));
    });
    attr(pair,'opacity',ramp(t,.41,.46)*(1-ramp(t,.68,.73)));
    attr(label,'opacity',ramp(t,.37,.5));
    // The practice lesson's first labeled example changes the height weight from 0 to .5.
    const score = heightScore(trainedWeight*ramp(t,.62,.86));
    const value = score.toFixed(2);
    bars.forEach(bar => attr(bar,'width',63*score));
    scores.forEach(text => { if (text.textContent !== value) text.textContent = value; });
  }

  const frames = {leaf,returns,prediction};
  return (id, progress) => frames[id](Math.max(0,Math.min(1,progress)));
}
