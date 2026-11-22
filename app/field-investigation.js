import {heightScore,learnHeightWeight} from './weight-lesson.js';
import {matchCenters} from '../trainer/models/center-matching.js';
import {sampleRow,rayMarks} from './row-sampling.js';

const home = new URL('../',import.meta.url);
const topics = {
  learn:{title:'What survives a scan?',image:'field-film-canopy',alt:'A lettuce seen from above, with a movable boundary between painted leaves and a dotted sampling sketch.',
    instruction:'Slide the scan across the heart of the lettuce. Follow one folded leaf from its painted edge into the dots.',
    control:'Scan across the lettuce',min:0,max:100,start:38,step:1,presets:[[15,'Leaves'],[85,'Returns']],
    action:'Place a pin on your scan',href:'#placePin'},
  scan:{title:'Can a whole seedling slip between rays?',image:'field-lab-row',alt:'A side view of a lettuce and a much smaller seedling with laser rays ending at their first surface.',
    instruction:'Keep the row still and change how many rays cross it. Watch the tiny seedling on the right.',
    control:'Rays across this row',min:4,max:36,start:7,step:1,presets:[[7,'Sparse scan'],[28,'Dense scan']],
    action:'Scan a full field',href:'#field'},
  train:{title:'What else learned to look like a crop?',image:'field-film-height',alt:'A lettuce and a weed grow to the same height, each with a crop score.',
    instruction:'Give the model one labeled lettuce at a time. Its only input is height. Predict what will happen to the weed before you teach it.',
    control:'Learning updates',min:0,max:6,start:0,step:1,presets:[[0,'Before learning'],[1,'One update']],
    action:'Train a detector',href:'trainer/#controls'},
  compare:{title:'Which pins survive the cutoff?',image:'field-lab-quadrant',alt:'Four lettuce centers and one central weed on a fixed illustrated test plot.',
    instruction:'Compare a second cutoff with the 0.50 baseline on the very same plot. Watch the central weed and the lower-right lettuce.',
    control:'Second score cutoff',min:30,max:95,start:50,step:1,presets:[[40,'Keep more'],[75,'Be selective']],
    action:'Compare detectors on fresh fields',href:'benchmark/#benchForm'},
  test:{title:'How close counts as a match?',image:'field-lab-quadrant',alt:'Survey rings around four lettuces, plus five fixed detector pins on an illustrated plot.',
    instruction:'Widen the survey rings without moving any pins. Each plant can claim one prediction. Follow the lower-right pin as its ring grows.',
    control:'Match distance',min:5,max:20,start:10,step:1,presets:[[7,'Tight rings'],[15,'Wide rings']],
    action:'Test a detector on a plot',href:'trainer/#field-test'}
};

// This 1.50 m teaching plot has invented detector scores and surveyed positions.
// Both experiments hold the same points fixed. Distances passed to the scorer are meters.
const plants = [[143,84],[426,76],[154,290],[450,280]];
const predictions = [[159,84,.92],[426,108,.84],[110,290,.59],[506,280,.43],[302,191,.65]];
const meterPoint = ([x,y]) => [x*.0025,y*.0025];
const truth = plants.map(meterPoint);
const unit = (topic,n) => topic==='learn' ? n+'%' : topic==='compare' ? (n/100).toFixed(2) : topic==='test' ? n+' cm' : String(n);

function survey(topic,value) {
  const limit = topic==='test' ? value : 15;
  const kept = predictions.filter(pin=>topic==='test' || pin[2]>=value/100);
  const {count,pinByBox} = matchCenters(kept.map(meterPoint),truth,limit/100);
  const matched = new Set(Array.from(pinByBox).filter(i=>i>=0));
  const marks = plants.map(([x,y],i) => {
    const pin = kept[pinByBox[i]];
    return `<g class="surveyTarget"><circle cx="${x}" cy="${y}" r="${limit*4}"/><path d="M${x-6} ${y}h12m-6-6v12"/>${pin?`<path class="assignment" d="M${x} ${y}L${pin[0]} ${pin[1]}"/>`:''}</g>`;
  }).join('') + kept.map(([x,y,score],i)=>`<g transform="translate(${x} ${y})"><path class="labPin ${matched.has(i)?'matched':'extra'}" d="M0 -8l8 8-8 8-8-8Z"/>
    ${topic==='compare'?`<text class="pinScore" x="10" y="-7">${score.toFixed(2)}</text>`:''}</g>`).join('');
  const extra=kept.length-count, missed=truth.length-count;
  let note;
  if (topic==='compare') {
    note = 'At 0.50 the detector matches 3 of 4 crops and keeps the weed. ';
    note += value<=43 ? 'The faint lower-right crop now survives, along with the weed.' :
      value<=65 ? 'The weed scores 0.65. Keeping every pin above this cutoff still lets it through.' :
      'The weed drops out, but so does the crop that scored 0.43.';
  } else {
    note = 'The five predictions stay fixed. ';
    note += count===4 ? 'All four crops now have a partner. The center pin on the weed is still extra.' :
      'An unmatched pin and a missed crop can come from one near miss. The lower-right pin is 14 cm from its plant.';
  }
  return {marks,reading:`${count} matched · ${extra} extra · ${missed} missed`,note};
}

function scanOverlay(id) {
  return `<defs><pattern id="dots-${id}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.5" fill="white"/></pattern>
    <mask id="sample-${id}"><rect width="400" height="400" fill="url(#dots-${id})"/></mask>
    <clipPath id="sweep-${id}"><rect class="labSweep" height="400"/></clipPath></defs>
    <g clip-path="url(#sweep-${id})"><rect width="400" height="400" fill="#102d29"/><use href="#lab-photo-${id}" mask="url(#sample-${id})"/></g>
    <path class="labScanLine" d="M0 0v400" stroke="#ffe29b" stroke-width="2.5"/>`;
}

let sequence = 0;
function frame(topic,value) {
  if (topic==='compare'||topic==='test') return survey(topic,value);
  if (topic==='scan') {
    const rays=sampleRow(value), hits=rays.filter(r=>r.plant!==null), seedling=hits.filter(r=>r.plant===1).length;
    return {marks:rayMarks(rays),reading:`${hits.length} leaf returns · ${value-hits.length} soil returns`,
      note:seedling ? `The seedling caught ${seedling} of the ${value} rays. Its neighbors and its size stayed the same.` :
        'The scanner passed on both sides of the seedling. A real plant can leave no return in a sparse scan.'};
  }
  if (topic==='train') {
    let weight=0;
    for (let i=0;i<value;i++) weight=learnHeightWeight(weight);
    const score=heightScore(weight).toFixed(2);
    const marks='<path class="sameHeight" d="M168 109H429"/>'+[[170,'Lettuce'],[426,'Weed']].map(([x,name])=>
      `<g transform="translate(${x} 321)"><rect x="-69" y="-20" width="138" height="34" rx="7" fill="#102a25" opacity=".94"/><text class="plantScore" text-anchor="middle">${name} ${score}</text></g>`).join('');
    return {marks,reading:'Height weight '+weight.toFixed(2)+' · both crop scores '+score,
      note:value ? 'Only the lettuce supplied a label. The weed gets the very same score because the model sees the same height.' :
        'At weight zero the model gives both plants 0.50. One update will use the difference between that guess and the lettuce label of 1.'};
  }
  return {
    reading:value+'% of the illustration swept',note:'The dots sketch discrete surface samples. Leaf edges and the heart are still clues to the center. In a real LiDAR scan each return also records a position in three dimensions.'};
}

class FieldInvestigation extends HTMLElement {
  connectedCallback() {
    if (this.childElementCount || !topics[this.dataset.topic]) return;
    const topic=this.dataset.topic, config=topics[topic], id=++sequence;
    const width=topic==='learn' ? 400 : 600;
    const src=new URL('art/'+config.image+'.webp',home).href;
    const destination=new URL(config.href,home);
    if (destination.pathname===location.pathname.replace(/index\.html$/,'')) destination.search=location.search;
    const key = topic==='compare'||topic==='test'
      ? 'Illustrated 1.50 m plot · circles are surveyed crops · diamonds are detector pins'
      : {learn:'Illustrated overhead scan · dots mark sample locations',scan:'Illustrated side view · each dot is a first return',train:'Height-only model · both plants have a height input of 1'}[topic];
    this.innerHTML=`<figure class="labPlate"><svg viewBox="0 0 ${width} 400" role="img" aria-label="${config.alt}"><image id="lab-photo-${id}" width="${width}" height="400" preserveAspectRatio="xMidYMid meet"/><g class="labMarks"></g></svg><figcaption>${key}</figcaption></figure>
      <div class="labPage"><h2>${config.title}</h2><p>${config.instruction}</p>
      <label class="labControl">${config.control}<span class="labValue"></span><input type="range" aria-label="${config.control}" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.start}"></label>
      <div class="labPresets">${config.presets.map(([n,label])=>`<button type="button" data-value="${n}">${label}</button>`).join('')}</div>
      <div class="labFinding" role="status"><strong></strong><p></p></div>
      <a class="labContinue" href="${destination.href}">${config.action} →</a></div>`;
    const input=this.querySelector('input'), marks=this.querySelector('.labMarks'), value=this.querySelector('.labValue');
    const finding=this.querySelector('.labFinding'), buttons=[...this.querySelectorAll('button')];
    if (topic==='learn') marks.innerHTML=scanOverlay(id);
    const photo=this.querySelector('image');
    const observer=new IntersectionObserver(entries=>{
      if (entries.some(entry=>entry.isIntersecting)) { photo.setAttribute('href',src); observer.disconnect(); }
    });
    observer.observe(this);
    function show() {
      const n=Number(input.value), result=frame(topic,n);
      if (topic==='learn') {
        marks.querySelector('.labSweep').setAttribute('width',n*4);
        marks.querySelector('.labScanLine').setAttribute('transform','translate('+n*4+' 0)');
      } else marks.innerHTML=result.marks;
      value.textContent=unit(topic,n);
      input.setAttribute('aria-valuetext',value.textContent);
      finding.querySelector('strong').textContent=result.reading;
      finding.querySelector('p').textContent=result.note;
      buttons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.value)===n)));
    }
    input.addEventListener('input',show);
    buttons.forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.value;show();}));
    if (topic==='learn') {
      const svg=this.querySelector('svg');
      function sweep(event) {
        const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
        input.value=String(Math.round(p.x/4));
        show();
      }
      svg.addEventListener('pointerdown',e=>{if(e.button===0){svg.setPointerCapture(e.pointerId);sweep(e);}});
      svg.addEventListener('pointermove',e=>{if(svg.hasPointerCapture(e.pointerId)) sweep(e);});
    }
    show();
  }
}
customElements.define('field-investigation',FieldInvestigation);
