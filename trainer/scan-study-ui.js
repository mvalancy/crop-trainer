import {studyMap,reached} from './scan-study-map.js';
import {RAY_BUDGETS,sensorName} from './sensors.js';
import {cropProfile} from './crops.js';

const metricText={
  returns:'A plant is marked when at least one surviving scan point came from it. The generator tracks the source of each point.',
  peaks:'A plant is marked when a height peak can be matched within 15 cm. A nearby peak can come from soil or clutter.',
  orchard:'Gold rings are tree-base estimates from the experimental orchard locator. It uses the spread of XYZ points at several heights. A green dot marks a tree matched within 15 cm.',
  pins:'Gold rings are predictions. The height-only baseline keeps the tallest peaks first and removes neighbors within the crop’s minimum spacing. Each pin can match one plant within 15 cm.'
};
const format=n=>n.toLocaleString();
export function initScanStudy(params) {
  const el=id=>document.getElementById(id), details=el('scan-study'), form=el('studyForm');
  const low=el('studyLow'),high=el('studyHigh'),metric=el('studyMetric'),target=el('studyTarget');
  const run=el('studyRun'),cancel=el('studyCancel'),status=el('studyStatus');
  const canvases=[el('studyFirst'),el('studySecond')], maps=canvases.map(studyMap);
  let recipe,scanUrl,worker,results=[],frames=[],complete=false,changingField=false;
  for(const [select,key,initial] of [[low,'studyLow',30000],[high,'studyHigh',100000]]){
    select.replaceChildren(...RAY_BUDGETS.map(n=>new Option(format(n),String(n))));
    const requested=Number(params.get(key));
    select.value=String(RAY_BUDGETS.includes(requested)?requested:initial);
  }
  if(Object.hasOwn(metricText,params.get('studyMetric')))metric.value=params.get('studyMetric');
  if(location.hash==='#scan-study')details.open=true;
  window.addEventListener('hashchange',()=>{if(location.hash==='#scan-study')details.open=true;});
  let requestedBox=params.has('studyBox')?Number(params.get('studyBox')):-1;

  function stop(){worker?.terminate();worker=undefined;cancel.hidden=true;run.disabled=!recipe||changingField;}
  function reset(){
    stop();complete=false;results=[];frames=[];
    el('studyResults').hidden=true;el('studyInspect').hidden=true;el('studyScores').hidden=true;
    status.textContent='';high.setCustomValidity('');
  }
  function armUrl(arm) {
    const url=new URL(scanUrl);
    url.searchParams.set('budget',results[arm].recipe.points);url.searchParams.set('tile',results[arm].tileId);
    for(const key of ['studyLow','studyHigh','studyMetric','studyBox','box'])url.searchParams.delete(key);
    if(target.value!=='')url.searchParams.set('box',target.value);
    url.hash='scan-viewer';return url.href;
  }
  function render() {
    const selected=target.value===''?-1:Number(target.value),mode=metric.value;
    for(const [i,map] of maps.entries()){
      map.draw({cloud:results[i]?null:frames[i],result:results[i],metric:mode,selected});
      const out=el(i?'studyCountB':'studyCountA'),r=results[i];
      if(r){
        const marked=r.plants.filter(p=>reached(p,mode)).length;
        out.textContent=format(marked)+' of '+r.plants.length+' plants · '+format(r.sampledRays)+' rays sampled';
      }
    }
    if(!complete)return;
    const targetText=results[0].target==='plant-base-xy'
      ? 'Positions mark the planted bases.' : 'Positions mark the horizontal midpoints of the modeled plant boxes.';
    el('studyMetricHelp').textContent=metricText[mode]+' '+targetText;
    let gained=0,lost=0;
    results[0].plants.forEach((p,i)=>{
      const a=reached(p,mode),b=reached(results[1].plants[i],mode);
      if(!a && b)gained++;
      if(a && !b)lost++;
    });
    el('studyChange').textContent=gained+' additional plants marked at the second budget · '+lost+' marked only at the first.';
    const p=results[0].plants[selected],q=results[1].plants[selected];
    el('studyTargetDetail').textContent=p?'Plant '+selected+' received '+p.returns+' and '+q.returns+' crop returns.':'Select a plant on either map or use the list to inspect its returns.';
    el('studyLinkA').href=armUrl(0);el('studyLinkB').href=armUrl(1);
    const share=new URL(scanUrl);share.hash='scan-study';
    share.searchParams.set('studyLow',results[0].recipe.points);share.searchParams.set('studyHigh',results[1].recipe.points);
    share.searchParams.set('studyMetric',mode);
    share.searchParams.delete('box');share.searchParams.delete('studyBox');
    if(p)share.searchParams.set('studyBox',selected);
    el('studyShare').href=share.href;
  }
  function showScores() {
    const body=el('studyScoreBody');body.replaceChildren();
    for(const r of results){
      const methods=[['Height only',r.heightScores]];
      if(r.orchardScores)methods.push(['Orchard base',r.orchardScores]);
      for(const [name,scores] of methods)for(const s of scores){
        const row=body.insertRow();
        const cells=[name,format(r.sampledRays),s.cm+' cm',s.tp,s.fp,s.fn,s.f1===null?'—':s.f1.toFixed(3)];
        for(const value of cells)row.insertCell().textContent=value;
      }
    }
    el('studyScores').hidden=false;
  }
  function finish() {
    stop();complete=true;frames=[];el('studyInspect').hidden=false;
    const plants=results[0].plants;
    target.replaceChildren(new Option('All plants',''),...plants.map((_,i)=>new Option('Plant '+i,i)));
    if(Number.isInteger(requestedBox)&&requestedBox>=0&&requestedBox<plants.length)target.value=String(requestedBox);
    requestedBox=-1;showScores();render();
    status.textContent=results[0].sampledRays===results[1].sampledRays
      ? 'Both budgets reached the same scanner limit of '+format(results[0].sampledRays)+' rays. Choose Reference in Scan settings to test a denser grid.'
      : 'Completed both scans of the same '+plants.length+' plants.';
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!recipe||changingField)return;
    const budgets=[Number(low.value),Number(high.value)];
    if(budgets[0]>=budgets[1]){
      high.setCustomValidity('Choose a second budget higher than the first.');high.reportValidity();return;
    }
    reset();el('studyResults').hidden=false;run.disabled=true;cancel.hidden=false;
    el('studyTitleA').textContent=format(budgets[0])+' rays requested';el('studyTitleB').textContent=format(budgets[1])+' rays requested';
    el('studyCountA').textContent='Sampling…';el('studyCountB').textContent='Waiting…';status.textContent='Growing the first scan…';render();
    function fail(message){reset();status.textContent=message;}
    try{worker=new Worker(new URL('./scan-study-worker.js?v=paired-study1',import.meta.url),{type:'module'});}
    catch(error){fail(error.message);return;}
    const active=worker;active.onerror=e=>{if(active===worker)fail(e.message||'The comparison worker stopped.');};
    active.onmessage=({data})=>{
      if(active!==worker)return;
      if(data.type==='error'){fail(data.message);return;}
      if(data.type==='row'){
        frames[data.arm]=data.cloud;maps[data.arm].draw({cloud:data.cloud});
        el(data.arm?'studyCountB':'studyCountA').textContent='Sampling row '+data.row+' of '+data.rows;
      }else if(data.type==='arm'){
        results[data.arm]=data.result;frames[data.arm]=null;render();
      }else if(data.type==='complete')finish();
    };
    active.postMessage({recipe,budgets});
  });
  cancel.onclick=()=>{reset();status.textContent='Comparison canceled.';};
  for(const select of [low,high])select.addEventListener('change',reset);
  metric.addEventListener('change',render);target.addEventListener('change',render);
  canvases.forEach((canvas,i)=>canvas.addEventListener('click',event=>{
    if(!complete)return;
    const id=maps[i].pick(event,results[i].plants);if(id>=0){target.value=String(id);render();}
  }));
  new ResizeObserver(()=>{if(!el('studyResults').hidden)render();}).observe(canvases[0]);
  details.addEventListener('toggle',()=>{if(details.open&&!el('studyResults').hidden)render();});
  el('studySave').onclick=()=>{
    if(!complete)return;
    const report={format:'crop-trainer-ray-study-v1',source:el('studyShare').href,arms:results};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='ray-study-'+recipe.seed+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return {
    setScan(scan,url){changingField=false;reset();recipe=scan.p;scanUrl=url;run.disabled=false;
      const orchardOption=metric.querySelector('[value=orchard]');orchardOption.hidden=orchardOption.disabled=recipe.crop!=='apple';
      if(orchardOption.disabled&&metric.value==='orchard')metric.value='returns';
      const guide=el('studyGuide');
      guide.href='https://github.com/mvalancy/crop-trainer/blob/main/docs/'+(orchardOption.disabled?'seedling-density.md':'orchard-bases.md');
      guide.textContent=orchardOption.disabled?'What happened on six seedling fields?':'Can a scan locate the base of an apple tree?';
      el('studyField').textContent=cropProfile(recipe.crop).name+' · field '+recipe.seed+' · '+sensorName(recipe.sampling);},
    pause(){changingField=true;reset();},
    resume(){changingField=false;run.disabled=!recipe;}
  };
}
