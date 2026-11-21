import {studyMap,reached,drawLowPatch} from './scan-study-map.js?v=board-placement1';
import {RAY_BUDGETS,sensorName} from '../generator/sensors.js';
import {cropProfile} from '../generator/crops.js';

const metricText={
  returns:'A plant is marked when at least one surviving scan point came from it. The generator tracks the source of each point.',
  peaks:'A plant is marked when a height peak can be matched within 15 cm. A nearby peak can come from soil or clutter.',
  orchard:'Gold rings are tree-base estimates from the experimental orchard locator. It uses the spread of XYZ points at several heights. A green dot marks a tree matched within 15 cm.',
  sampledPins:'Gold rings mark peaks found by averaging heights only where rays landed. This can reveal a short plant between gaps. Raised soil can also produce a peak. Compare the extra pins with the standard height method.',
  pins:'Gold rings are predictions. The height-only baseline keeps the tallest peaks first and removes neighbors within the crop’s minimum spacing. Each pin can match one plant within 15 cm.'
};
const orchardMiss={
  support:'no cell within 15 cm had enough support from the scan.',
  spacing:'cells near the base qualified, then the spacing rule removed them.',
  refinement:'a cell survived spacing near the base. Final centering moved its pin outside 15 cm.',
  'assigned-elsewhere':'a final pin was within 15 cm, but it matched another tree.'
};
const boardNames=['At trees','Across plot'];
const format=n=>n.toLocaleString();
export function initScanStudy(params) {
  const el=id=>document.getElementById(id), details=el('scan-study'), form=el('studyForm');
  const low=el('studyLow'),high=el('studyHigh'),metric=el('studyMetric'),target=el('studyTarget');
  const comparison=el('studyMode'),cloud=el('studyCloud'),spacing=el('studySpacing');
  const zoom=el('studyZoom');
  zoom.checked=params.get('studyZoom')==='tree';
  const run=el('studyRun'),cancel=el('studyCancel'),status=el('studyStatus');
  const canvases=[el('studyFirst'),el('studySecond')], maps=canvases.map(studyMap);
  let recipe,scanUrl,worker,results=[],frames=[],complete=false,changingField=false;
  for(const [select,key,initial] of [[low,'studyLow',30000],[high,'studyHigh',100000]]){
    select.replaceChildren(...RAY_BUDGETS.map(n=>new Option(format(n),String(n))));
    const requested=Number(params.get(key));
    select.value=String(RAY_BUDGETS.includes(requested)?requested:initial);
  }
  const scoreDistance=el('studyScoreDistance'), requestedTolerance=params.get('studyTolerance');
  if ([...scoreDistance.options].some(option=>option.value===requestedTolerance)) {
    scoreDistance.value=requestedTolerance;
    el('studyScores').open=true;
  }
  if ([...spacing.options].some(option=>option.value===params.get('studySpacing'))) spacing.value=params.get('studySpacing');
  const requestedMode=params.get('studyMode');
  if(['layouts','damage','scaffolds','spacing','ranking','boards'].includes(requestedMode))comparison.value=requestedMode;
  showSettings();
  if(Object.hasOwn(metricText,params.get('studyMetric')))metric.value=params.get('studyMetric');
  if(params.has('studyCloud'))cloud.checked=params.get('studyCloud')==='on';
  if(location.hash==='#scan-study')details.open=true;
  window.addEventListener('hashchange',()=>{if(location.hash==='#scan-study')details.open=true;});
  let requestedBox=params.has('studyBox')?Number(params.get('studyBox')):-1;

  function stop(){worker?.terminate();worker=undefined;cancel.hidden=true;run.disabled=!recipe||changingField;}
  function reset(){
    stop();complete=false;results=[];frames=[];
    el('studyResults').hidden=true;el('studyInspect').hidden=true;el('studyScores').hidden=true;
    status.textContent='';high.setCustomValidity('');
  }
  function ruleNames(mode=comparison.value){
    if(mode==='spacing')return ['1.05 m',spacing.value+' m'];
    if(mode==='ranking')return ['Usual rule','Low returns'];
    return null;
  }
  function showSettings(){
    const mode=comparison.value;
    for(const select of [low,high]){
      select.disabled=mode!=='budgets';select.closest('label').hidden=select.disabled;
    }
    spacing.disabled=mode!=='spacing';
    spacing.closest('label').hidden=spacing.disabled;
    const rules=ruleNames(mode);
    run.textContent=({spacing:'Compare pin spacing',ranking:'Compare ranking rules',boards:'Compare board placement'})[mode] ?? 'Compare scans';
    cloud.checked=mode==='layouts' || mode==='boards' || Boolean(rules);
    if(rules || mode==='boards' || mode==='damage' || mode==='scaffolds')metric.value='orchard';
    el('studyQuestion').textContent={
      ranking:'Can low laser returns help locate a trunk? Both rules start with the same possible bases. The trial gives a spot priority if nearby points sit 15 to under 48 cm above the plot’s zero-height plane. The soil can rise or fall around that plane.',
      boards:'Do boards make the locator guess where a tree grows? In the first scan each board is centered on a tree. In the second its position is chosen anywhere on the plot. Both scans use the same trees, board shapes and low-return ranking rule.',
      spacing:'Can two guesses belong to one tree? Use the same scan twice and change how far apart the locator keeps candidate pins. Check the matched trees and extra guesses.',
      scaffolds:'How does changing the thickness of a tree’s main branches affect woody returns and its predicted base? Both versions use the same planting, scanner and ray budget.',
      damage:'Does the base pin move when one scaffold breaks on each tree?',
      layouts:'Where do the rays land? Scan the same plants with a reference grid and a simulated OS1-64 ring layout.',
      budgets:'Do more laser rays help you find more plants?'
    }[mode];
    updateGuide();
  }
  function updateGuide(){
    if(!recipe)return;
    const guide=el('studyGuide');
    let page='seedling-density.md', label='What happened on six seedling fields?';
    if(recipe.crop==='apple'){
      page='orchard-bases.md';label='Can a scan locate the base of an apple tree?';
      if(comparison.value==='spacing'){
        page+='#does-shorter-pin-spacing-recover-the-missed-bases';
        label='Did closer pins find more trees?';
      }else if(comparison.value==='ranking'){
        page='orchard-ranking.md';label='When did low returns help locate a trunk?';
      }else if(comparison.value==='boards'){
        page='orchard-boards.md';label='How does moving the boards change the result?';
      }
    }
    guide.href='https://github.com/mvalancy/crop-trainer/blob/main/docs/'+page;
    guide.textContent=label;
  }
  function armUrl(arm) {
    const url=new URL(scanUrl);
    // A geometry comparison preserves the source budget, including 0 for a seeded budget.
    if(comparison.value==='damage')url.searchParams.set('plantCondition',results[arm].recipe.plantCondition);
    else if(comparison.value==='scaffolds')url.searchParams.set('plantArchitecture',results[arm].recipe.plantArchitecture);
    else if(comparison.value==='boards'){
      url.searchParams.set('boards','on');
      if(arm===1)url.searchParams.set('boardPlacement','independent');
      else url.searchParams.delete('boardPlacement');
    }else if(!ruleNames())url.searchParams.set('budget',results[arm].recipe.points);
    url.searchParams.set('tile',results[arm].tileId);
    url.searchParams.set('sensor',results[arm].recipe.sampling.key);
    for(const key of ['studyMode','studyCloud','studyLow','studyHigh','studyMetric','studyTolerance','studySpacing','studyZoom','studyBox','box'])url.searchParams.delete(key);
    if(target.value!=='')url.searchParams.set('box',target.value);
    url.hash='scan-viewer';return url.href;
  }
  function renderOrchardTrace(selected, visible) {
    const evidence=results.map(arm=>arm?.plants[selected]);
    const panel=el('studyOrchardTrace');
    panel.hidden=!visible || evidence.length!==2 || !evidence.every(plant=>plant?.orchardTrace);
    const patch=el('studyLowPatch');
    const cellId=evidence[1]?.orchardTrace?.bestCellId;
    patch.hidden=panel.hidden || !Number.isInteger(cellId);
    if(patch.hidden){
      if(patch.firstChild)patch.replaceChildren();
    }else{
      drawLowPatch(patch,cellId,results[1].orchardLowCellIds);
    }
    if (panel.hidden) return false;
    const rules=ruleNames();
    el('studyTraceTitle').textContent='Tree '+selected+' · 15 cm orchard check';
    for (const [i,plant] of evidence.entries()) {
      const suffix=i?'B':'A', trace=plant.orchardTrace;
      const arm=results[i];
      const armTitle=rules?.[i] ?? ({
        boards:boardNames[i],
        scaffolds:'v'+arm.recipe.plantArchitecture,
        damage:i?'Broken':'Intact',
        layouts:i?'OS1-64':'Grid',
        budgets:format(arm.recipe.points)+' rays'
      })[comparison.value];
      el('studyTraceArm'+suffix).textContent=armTitle;
      el('studySupport'+suffix).textContent=format(trace.supportCellCount);
      el('studySpaced'+suffix).textContent=format(trace.spacedCellCount);
      el('studyNearest'+suffix).textContent=plant.nearestOrchardPinM===null?'No pins':(100*plant.nearestOrchardPinM).toFixed(1)+' cm';
      const outcome=el('studyOutcome'+suffix);
      outcome.textContent=plant.orchard?'Matched':'Missed';
      outcome.dataset.state=trace.state;
    }
    const [a,b]=evidence.map(plant=>plant.orchardTrace.state);
    const notes=[];
    if (a===b && a!=='matched') notes.push((rules?'With both settings, ':'In both scans, ')+orchardMiss[a]);
    else for (const [i,state] of [a,b].entries()) {
      let context=i?'In the second scan':'In the first scan';
      if(comparison.value==='spacing')context='At '+rules[i];
      if(comparison.value==='ranking')context=i?'With low returns included':'Under the usual rule';
      if (state!=='matched') notes.push(context+', '+orchardMiss[state]);
    }
    if (evidence.some(plant=>plant.orchard && !plant.orchardTrace.spacedCellCount)) {
      notes.push('A pin can move into the circle during final centering.');
    }
    if (comparison.value==='ranking' && !evidence[1].orchardTrace.topCandidate) {
      notes.push('A spot must qualify under the usual rule before low returns can raise its priority.');
    }
    const note=el('studyTraceNote');
    note.textContent=notes.join(' ');
    note.hidden=!notes.length;
    return true;
  }
  function render() {
    const selected=target.value===''?-1:Number(target.value),mode=metric.value;
    const rules=ruleNames();
    const lowCellIds=comparison.value==='ranking' && cloud.checked ? results[1]?.orchardLowCellIds : undefined;
    el('studyLowReturnsKey').hidden=!lowCellIds;
    if(lowCellIds){
      const n=lowCellIds.length;
      el('studyLowReturnsCount').textContent=n
        ? format(n)+' cyan 5 cm '+(n===1?'cell':'cells')+' in this plot · returns 15 to under 48 cm high'
        : 'No cells in this plot recorded returns 15 to under 48 cm high.';
    }
    const boardStudy=comparison.value==='boards';
    const boardKey=el('studyBoardReturnsKey');
    boardKey.hidden=!(boardStudy && cloud.checked && complete);
    if(!boardKey.hidden){
      el('studyBoardReturnsCount').textContent='Orange squares mark board hits in the full-plot previews · '+format(results[0].boardPreviewReturns)+' at trees and '+format(results[1].boardPreviewReturns)+' across the plot.';
    }
    const showOrchard=mode==='orchard'||comparison.value==='damage'||comparison.value==='scaffolds';
    const canZoom=complete && selected>=0 && mode==='orchard';
    const focused=canZoom && zoom.checked;
    el('studyZoomTools').hidden=!canZoom;
    el('studyZoomKey').hidden=!focused;
    const traced=renderOrchardTrace(selected,complete && showOrchard);
    for(const [i,map] of maps.entries()){
      map.draw({cloud:!results[i]||cloud.checked?frames[i]:null,result:results[i],metric:mode,selected,focused,lowCellIds,showBoards:boardStudy});
      const out=el(i?'studyCountB':'studyCountA'),r=results[i];
      const distance=el(i?'studyDistanceB':'studyDistanceA'),plant=r?.plants[selected];
      distance.hidden=traced || !(complete&&plant&&r.orchardPins&&showOrchard);
      if(!distance.hidden){
        const nearest=plant.nearestOrchardPinM===null?'no orchard pins':'nearest orchard pin '+(plant.nearestOrchardPinM*100).toFixed(1)+' cm';
        distance.textContent=(i?'Second':'First')+' scan · '+nearest+' · '+(plant.orchard?'matched':'missed')+' at 15 cm';
      }
      if(r){
        const marked=r.plants.filter(p=>reached(p,mode)).length;
        const scoring={pins:r.heightScores,sampledPins:r.sampledHeightScores,orchard:r.orchardScores}[mode];
        const extras=scoring?.find(s=>s.cm===15)?.fp;
        const extraCount=extras===undefined?'':' · '+format(extras)+(extras===1?' extra pin':' extra pins');
        const wood=r.orchardWoodReturns===undefined?'':' · '+format(r.orchardWoodReturns)+' returns from tree wood';
        out.textContent=boardStudy
          ? format(marked)+'/'+r.plants.length+' trees'+extraCount+' · '+format(r.boardReturns)+' board returns'
          : format(marked)+' of '+r.plants.length+' plants'+extraCount+' · '+format(r.sampledRays)+' rays sampled'+wood;
      }
    }
    if(!complete)return;
    const targetText=results[0].target==='plant-base-xy'
      ? 'Positions mark the planted bases.' : 'Positions mark the horizontal midpoints of the modeled plant boxes.';
    el('studyMetricHelp').textContent=metricText[mode]+' '+targetText;
    el('studyPeakGuide').hidden=mode!=='sampledPins';
    let gained=0,lost=0;
    results[0].plants.forEach((p,i)=>{
      const a=reached(p,mode),b=reached(results[1].plants[i],mode);
      if(!a && b)gained++;
      if(a && !b)lost++;
    });
    const change=el('studyChange');
    if((rules || boardStudy) && mode==='orchard'){
      const [standard,trial]=results.map(r=>r.orchardScores.find(s=>s.cm===15));
      const subject=boardStudy?'boards across the plot':'the trial';
      const matches=gained || lost
        ? 'At 15 cm '+subject+' gained '+gained+(gained===1?' match':' matches')+' and lost '+lost+'.'
        : 'Both settings matched the same '+standard.tp+(standard.tp===1?' tree.':' trees.');
      const extras=trial.fp===standard.fp
        ? 'Both produced '+trial.fp+(trial.fp===1?' extra pin.':' extra pins.')
        : 'Extra pins '+(trial.fp>standard.fp?'rose':'fell')+' from '+standard.fp+' to '+trial.fp+'.';
      change.textContent=matches+' '+extras;
    }else if(rules){
      change.textContent='Both maps use the same returns and height peaks. Select Orchard base pin to compare the tree-base predictions.';
    }else{
      change.textContent=gained+' plants marked only in the second scan · '+lost+' marked only in the first.';
    }
    const p=results[0].plants[selected],q=results[1].plants[selected];
    el('studyTargetDetail').textContent=p?'Plant '+selected+' received '+p.returns+' and '+q.returns+' crop returns.':'Select a plant on either map or use the list to inspect its returns.';
    if(boardStudy && p) el('studyTargetDetail').textContent='Within 15 cm of tree '+selected+' the scans recorded '+format(p.boardReturns15cm)+' board returns with boards at trees and '+format(q.boardReturns15cm)+' with boards across the plot. The tree itself supplied '+format(p.returns)+' and '+format(q.returns)+' crop returns.';
    if (rules && p) el('studyTargetDetail').textContent='Tree '+selected+' received '+format(p.returns)+' crop returns in the shared scan.';
    el('studyLinkA').textContent=rules?'Open scan in 3D':'First scan in 3D';
    el('studyLinkB').hidden=Boolean(rules);
    el('studyLinkA').href=armUrl(0);el('studyLinkB').href=armUrl(1);
    const share=new URL(scanUrl);share.hash='scan-study';
    if(comparison.value==='spacing')share.searchParams.set('studySpacing',spacing.value);
    else share.searchParams.delete('studySpacing');
    if(comparison.value!=='budgets')share.searchParams.set('studyMode',comparison.value);
    else{
      share.searchParams.set('studyLow',results[0].recipe.points);share.searchParams.set('studyHigh',results[1].recipe.points);
    }
    if(focused)share.searchParams.set('studyZoom','tree');
    else share.searchParams.delete('studyZoom');
    share.searchParams.set('studyCloud',cloud.checked?'on':'off');
    share.searchParams.set('studyMetric',mode);
    if (scoreDistance.value!=='15') share.searchParams.set('studyTolerance',scoreDistance.value);
    else share.searchParams.delete('studyTolerance');
    share.searchParams.delete('box');share.searchParams.delete('studyBox');
    if(p)share.searchParams.set('studyBox',selected);
    el('studyShare').href=share.href;
  }
  function showScores() {
    const table=el('studyScoreBody'), arms=el('studyScoreArms');
    const rules=ruleNames();
    const cm=Number(scoreDistance.value);
    for (const body of [...table.tBodies]) body.remove();
    arms.replaceChildren();
    for (const [i,result] of results.entries()) {
      const line=document.createElement('p'), name=document.createElement('strong');
      const title=el(i?'studyTitleB':'studyTitleA').textContent;
      name.textContent=rules?title:(i?'Second scan':'First scan');
      const layout=sensorName(result.recipe.sampling);
      const description=rules?layout:comparison.value==='layouts'?title:title+' · '+layout;
      line.append(name,' · '+description+' · '+format(result.sampledRays)+' sampled rays');
      if(comparison.value==='boards') {
        const id=document.createElement('code');
        id.textContent=result.tileId;
        line.append(' · scan ',id);
      }
      arms.append(line);
    }
    const methods=[
      ['Height only','heightScores','Each empty grid cell counts as zero when averaging nearby heights. The detector keeps tall peaks that are far enough apart.'],
      ['Sampled cells','sampledHeightScores','The average uses cells where a ray recorded a point. This can expose short plants and can also give raised soil an extra pin.'],
      ['Orchard base','orchardScores','This rule estimates each tree base from XYZ points at several heights.']
    ];
    for (const [name,key,help] of methods) {
      if (!results[0][key]) continue;
      const body=table.createTBody(), title=document.createElement('th');
      title.scope='rowgroup'; title.colSpan=5;
      title.textContent=comparison.value==='boards' && key==='orchardScores'?'Orchard base · low-return ranking':name;
      title.dataset.help=help;
      body.insertRow().append(title);
      const fixedBaseline=rules && key!=='orchardScores';
      const armsToShow=fixedBaseline?[results[0]]:results;
      armsToShow.forEach((result,i)=>{
        const score=result[key].find(s=>s.cm===cm);
        const row=body.insertRow(), arm=document.createElement('th');
        arm.scope='row';
        arm.textContent=fixedBaseline?'Fixed':rules?.[i] ?? (comparison.value==='boards'?boardNames[i]:i?'Second':'First');
        if(fixedBaseline)arm.dataset.help='This height detector used the same points and kept the same pin spacing in both runs.';
        row.append(arm);
        for (const value of [score.tp,score.fp,score.fn]) row.insertCell().textContent=String(value);
        const f1=row.insertCell();
        f1.textContent=score.f1===null?'—':score.f1.toFixed(3);
        f1.dataset.helpLabel=name+' · F1 at '+cm+' cm';
        f1.dataset.help=score.f1===null
          ? 'The detector placed no pins and the field contains no plants, so this score is undefined.'
          : 'F1 balances extra pins and missed plants on a scale from 0 to 1. This scan has '+score.tp+' matches, '+score.fp+' extra pins and '+score.fn+' missed plants.';
      });
    }
    el('studyScores').hidden=false;
  }
  function finish() {
    stop();complete=true;el('studyInspect').hidden=false;
    const plants=results[0].plants;
    const trees=recipe.crop==='apple';
    target.replaceChildren(new Option(trees?'All trees':'All plants',''),...plants.map((_,i)=>new Option((trees?'Tree ':'Plant ')+i,i)));
    if(Number.isInteger(requestedBox)&&requestedBox>=0&&requestedBox<plants.length)target.value=String(requestedBox);
    requestedBox=-1;showScores();render();
    if(ruleNames()){
      const change=comparison.value==='spacing'?'Only the spacing between orchard candidates changed.'
        :'Both rules kept candidates 1.05 m apart. The trial gave priority to spots with nearby low returns.';
      status.textContent='Scored the same '+format(results[0].returnedPoints)+' returns twice. '+change;
      return;
    }
    if(comparison.value==='boards'){
      status.textContent='Both scans sampled '+format(results[0].sampledRays)+' rays across the same '+plants.length+' planted tree bases. Both used low-return ranking and 1.05 m pin spacing.';
      return;
    }
    if(comparison.value==='layouts'){
      status.textContent='Both layouts sampled '+format(results[0].sampledRays)+' rays over the same '+plants.length+' plants.';
      return;
    }
    if(comparison.value==='damage'){
      status.textContent='Compared intact and damaged scans at the same '+plants.length+' tree bases.';
      return;
    }
    if(comparison.value==='scaffolds'){
      status.textContent='Compared scaffold widths in v3 and v4 at the same '+plants.length+' planted tree bases.';
      return;
    }
    status.textContent=results[0].sampledRays===results[1].sampledRays
      ? 'Both budgets reached the same scanner limit of '+format(results[0].sampledRays)+' rays. Choose Reference in Scan settings to test a denser grid.'
      : 'Completed both scans of the same '+plants.length+' plants.';
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!recipe||changingField)return;
    const budgets=[Number(low.value),Number(high.value)];
    const mode=comparison.value;
    if(mode==='budgets'&&budgets[0]>=budgets[1]){
      high.setCustomValidity('Choose a second budget higher than the first.');high.reportValidity();return;
    }
    if(complete && target.value!=='') requestedBox=Number(target.value);
    reset();el('studyResults').hidden=false;run.disabled=true;cancel.hidden=false;
    const titles={boards:['Boards at trees','Boards across the plot'],ranking:['Usual rule','Low returns'],spacing:['Standard · 1.05 m spacing','Trial · '+spacing.value+' m spacing'],layouts:['Reference grid','OS1-64 · simulated rings'],damage:['Intact scaffolds','One broken scaffold per tree'],
      scaffolds:['Original scaffold widths · v3','Variable scaffold widths · v4'],
      budgets:budgets.map(budget=>format(budget)+' rays requested')};
    const views=ruleNames(mode) ?? (mode==='boards'?boardNames:['First scan','Second scan']);
    el('studyViewA').textContent=views[0];
    el('studyViewB').textContent=views[1];
    el('studyTitleA').textContent=titles[mode][0];el('studyTitleB').textContent=titles[mode][1];
    el('studyCountA').textContent='Sampling…';el('studyCountB').textContent='Waiting…';status.textContent='Growing the first scan…';render();
    function fail(message){reset();status.textContent=message;}
    try{worker=new Worker(new URL('./scan-study-worker.js?v=board-placement1',import.meta.url),{type:'module'});}
    catch(error){fail(error.message);return;}
    const active=worker;active.onerror=e=>{if(active===worker)fail(e.message||'The comparison worker stopped.');};
    active.onmessage=({data})=>{
      if(active!==worker)return;
      if(data.type==='error'){fail(data.message);return;}
      if(data.type==='row'){
        frames[data.arm]=data.cloud;maps[data.arm].draw({cloud:data.cloud,showBoards:mode==='boards'});
        el(data.arm?'studyCountB':'studyCountA').textContent='Sampling row '+data.row+' of '+data.rows;
      }else if(data.type==='arm'){
        results[data.arm]=data.result;frames[data.arm]=data.cloud;render();
      }else if(data.type==='complete')finish();
    };
    active.postMessage({recipe,budgets,mode,orchardSpacing:Number(spacing.value)});
  });
  cancel.onclick=()=>{reset();status.textContent='Comparison canceled.';};
  for(const select of [low,high,spacing])select.addEventListener('change',()=>{
    if (complete && target.value!=='') requestedBox=Number(target.value);
    reset();
  });
  comparison.addEventListener('change',()=>{
    if(complete && target.value!=='')requestedBox=Number(target.value);
    reset();showSettings();
  });
  for (const choice of details.querySelectorAll('input[name="studyMapView"]')) {
    choice.addEventListener('change',()=>{
      el('studyMaps').dataset.view=choice.value;
      render();
    });
  }
  scoreDistance.addEventListener('change',()=>{ if(complete) {showScores();render();} });
  zoom.addEventListener('change',render);
  cloud.addEventListener('change',render);
  metric.addEventListener('change',render);target.addEventListener('change',render);
  canvases.forEach((canvas,i)=>canvas.addEventListener('click',event=>{
    if(!complete)return;
    const id=maps[i].pick(event,results[i].plants);if(id>=0){target.value=String(id);render();}
  }));
  const resizeMaps=new ResizeObserver(()=>{if(!el('studyResults').hidden)render();});
  for (const canvas of canvases) resizeMaps.observe(canvas);
  details.addEventListener('toggle',()=>{if(details.open&&!el('studyResults').hidden)render();});
  el('studySave').onclick=()=>{
    if(!complete)return;
    const prefix={boards:'orchard-boards-study',ranking:'orchard-ranking-study',spacing:'orchard-spacing-study',damage:'damage-study',scaffolds:'scaffold-study',layouts:'layout-study',budgets:'ray-study'}[comparison.value];
    const report={format:'crop-trainer-'+prefix+'-v1',source:el('studyShare').href,arms:results};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=prefix+'-'+recipe.seed+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return {
    setScan(scan,url){changingField=false;reset();recipe=scan.p;scanUrl=url;run.disabled=false;
      const orchardOption=metric.querySelector('[value=orchard]');orchardOption.hidden=orchardOption.disabled=recipe.crop!=='apple';
      const damageOption=comparison.querySelector('[value=damage]');
      damageOption.hidden=damageOption.disabled=recipe.crop!=='apple'||!(recipe.plantArchitecture>=2);
      for (const mode of ['spacing','ranking','boards']) {
        const option=comparison.querySelector('[value='+mode+']');
        option.hidden=option.disabled=orchardOption.disabled;
      }
      if(orchardOption.disabled && (ruleNames() || comparison.value==='boards')){
        const selection=comparison.selectedOptions[0].textContent;
        comparison.value='budgets';metric.value='returns';showSettings();
        status.textContent=selection+' is available with apple trees. Showing ray budgets.';
      }
      const scaffoldOption=comparison.querySelector('[value=scaffolds]');
      scaffoldOption.hidden=scaffoldOption.disabled=recipe.crop!=='apple';
      if(damageOption.disabled&&comparison.value==='damage'){
        comparison.value='budgets';metric.value='returns';showSettings();
        status.textContent='Scaffold damage requires structured apple trees. Showing ray budgets.';
      }
      if(scaffoldOption.disabled&&comparison.value==='scaffolds'){
        comparison.value='budgets';metric.value='returns';showSettings();
        status.textContent='Scaffold widths are available with apple trees. Showing ray budgets.';
      }
      if(orchardOption.disabled&&metric.value==='orchard')metric.value='returns';
      updateGuide();
      el('studyField').textContent=cropProfile(recipe.crop).name+' · field '+recipe.seed+' · '+sensorName(recipe.sampling);},
    pause(){if(recipe)requestedBox=-1;changingField=true;reset();},
    resume(){changingField=false;run.disabled=!recipe;}
  };
}
