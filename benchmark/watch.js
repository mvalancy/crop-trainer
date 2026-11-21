import {createLiveScene} from '../trainer/ui/live-scene.js';
import {sampleCloud} from '../trainer/generator/field.js?v=live1';

export function benchmarkView(host) {
  const scene=createLiveScene(host.querySelector('.liveScene'),{zoomControl:true});
  const body=host.querySelector('tbody'), header=host.querySelector('thead tr');
  const badge=host.querySelector('.watchCount'), stop=host.querySelector('button.watchCancel');
  const phases=[...host.querySelectorAll('.watchSteps li')];
  let seed, total, completed, field, lastScan, lastEpoch;
  const cells=new Map(), inspections=new Map();
  function inspect(button) {
    const frame=inspections.get(button);
    if(!frame)return;
    for(const item of inspections.keys())item.setAttribute('aria-pressed',String(item===button));
    scene.show(frame);
  }
  body.addEventListener('click',event=>{
    const button=event.target.closest('.scorePick');
    if(button)inspect(button);
  });
  function phase(index){
    phases.forEach((el,i)=>{if(i===index)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  }
  return {
    start(firstSeed,labels,enabled){
      host.hidden=!enabled;scene.reset();body.replaceChildren();cells.clear();inspections.clear();field=null;
      if(!enabled)return;
      seed=firstSeed;total=2*labels.length;completed=0;stop.hidden=false;
      [1,2].forEach((i)=>header.cells[i].textContent='Seed '+(seed+i-1));
      for(const label of labels){
        const row=body.insertRow(),name=document.createElement('th');name.scope='row';name.textContent=label;row.append(name);
        cells.set(label,[row.insertCell(),row.insertCell()]);
        for(const cell of cells.get(label)){cell.textContent='Pending';cell.className='pendingScore';}
      }
      badge.textContent='0 / '+total+' scored';
      host.querySelector('.inspectHelp').hidden=true;
      host.focus({preventScroll:true});
      host.scrollIntoView({block:'start'});
    },
    growing(runSeed){
      phase(0);scene.reset();field=null;lastScan=-Infinity;
      scene.show({title:'Growing fields',metric:'Dataset seed '+runSeed,legend:'Sampled laser returns',detail:'Preparing terrain',fraction:0});
    },
    scan(scan,step){
      if(step.done!==1 && step.done!==step.total && performance.now()-lastScan<130)return;
      const cloud=sampleCloud(scan.xyz,scan.cls);
      if(step.done===1)field={cloud,seed:scan.p.seed};
      scene.show({title:step.split+' field',cloud,metric:step.done+' / '+step.total+' scans',legend:'Green · crop returns',detail:scan.labels.num_points.toLocaleString()+' returns',fraction:step.done/step.total});
      lastScan=performance.now();
    },
    fitting(label,epochs){
      phase(1);scene.reset();lastEpoch=-Infinity;
      scene.show({title:label,cloud:field.cloud,metric:'Starting fit',legend:'Training field · seed '+field.seed,detail:epochs+' epochs',fraction:0});
    },
    epoch(p,epochs){
      if(p.epoch>1 && p.epoch!==epochs && performance.now()-lastEpoch<120)return;
      lastEpoch=performance.now();
      scene.show({metric:'Epoch '+p.epoch+' / '+epochs,detail:'Loss '+p.loss.toFixed(4),loss:p,fraction:p.epoch/epochs});
    },
    scoring(label){phase(2);scene.reset();scene.show({title:label,metric:'Checking held-out fields',legend:'○ Prediction   × Missed at 15 cm',detail:'Top view',fraction:0});},
    tile(step){
      scene.show({flat:true,points:step.tile.points,pins:step.predictions,misses:step.missed.map(i=>step.tile.truth[i]),
        metric:'Scored '+step.done+' / '+step.total,detail:'Field seed '+step.tile.seed,fraction:step.done/step.total});
    },
    score(label,row,preview){
      const cell=cells.get(label)[row.seed-seed],bar=document.createElement('span');
      cell.className='watchScore';bar.className='scoreBar';bar.style.setProperty('--score',100*row.meanF1+'%');bar.setAttribute('aria-hidden','true');
      const value=(100*row.meanF1).toFixed(1)+'%', button=document.createElement('button');
      button.type='button';button.className='scorePick';button.disabled=true;
      button.setAttribute('aria-label','Inspect '+label+' on dataset seed '+row.seed+', mean F1 '+value);
      button.append(value,bar);cell.replaceChildren(button);
      const missed=preview.missesByTolerance.find(item=>item.cm===15).boxIndices;
      inspections.set(button,{flat:true,cloud:null,points:preview.points,pins:preview.predictions,
        misses:missed.map(i=>preview.truth[i]),title:label+' · seed '+row.seed,metric:value+' mean F1',
        legend:'○ Prediction   × Missed at 15 cm',detail:'Soil included · field '+preview.seed,fraction:1});
      badge.textContent=++completed+' / '+total+' scored';
    },
    end(title){
      phase(-1);stop.hidden=true;
      for(const button of inspections.keys())button.disabled=false;
      if(completed){
        inspect(inspections.keys().next().value);host.querySelector('.inspectHelp').hidden=false;
      }else scene.show({title,metric:'0 scored'});
      badge.textContent=title+' · '+completed+' / '+total+' scored';
    }
  };
}
