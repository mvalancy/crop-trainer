// Serve only the built artifact at the same project path used by GitHub Pages.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,resolve,sep} from 'node:path';
import {buffer} from 'node:stream/consumers';
import {chromium} from 'playwright';

if (process.argv.length !== 3) throw Error('Usage: node ci/smoke-pages.mjs <built-pages-directory>');
const root=resolve(process.argv[2]);
await stat(resolve(root,'index.html'));
const prefix='/crop-trainer/';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript',
  '.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.csv':'text/csv','.png':'image/png','.wasm':'application/wasm','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (!path.startsWith(prefix)) {res.writeHead(404).end();return;}
    const file=resolve(root,path.slice(prefix.length)+(path.endsWith('/')?'index.html':''));
    if (!file.startsWith(root+sep)) {res.writeHead(404).end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done,fail)=>server.once('error',fail).listen(0,'127.0.0.1',done));
const base=new URL(prefix,'http://127.0.0.1:'+server.address().port);
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  page.setDefaultTimeout(60_000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if (response.url().startsWith(base.origin+'/') && response.status()>=400) errors.push(response.status()+' '+response.url());
  });
  if (process.env.CHECK_WIP_RELEASE === '1') {
    // The WIP entrance also works in local checkouts. Resolve its public URL
    // against this exact staged artifact before permitting Pages to publish it.
    const publicBase = 'https://mvalancy.github.io/crop-trainer/';
    const studio = new URL('next/studio/',publicBase).href;
    const stagedStudio = new URL('next/studio/',base).href;
    await page.route(studio, route => route.fulfill({status:302,headers:{location:stagedStudio}}));
    for (const path of ['', 'trainer/', 'benchmark/']) {
      await page.goto(new URL(path,base).href);
      const entrance = page.getByRole('link',{name:'WIP: open the narrated learning studio'});
      assert.equal(await entrance.innerText(),'WIP');
      assert.equal(await entrance.evaluate(link => link.href),studio);
    }
    await page.getByRole('link',{name:'WIP: open the narrated learning studio'}).click();
    await page.waitForURL(stagedStudio);
    await page.getByRole('button',{name:'Switch activity'}).click();
    await page.getByRole('navigation',{name:'Studio activities'}).getByRole('link',{name:'Docs',exact:true}).click();
    const article = page.frameLocator('iframe:not([hidden])').locator('.guideChapter');
    await article.getByRole('heading',{name:'Crop Trainer field guide',exact:true}).waitFor();
    await Promise.all([
      page.waitForResponse(r => r.url() === new URL('next/art/audio/reader/english.wasm',base).href && r.ok()),
      page.getByRole('button',{name:'Listen to this activity'}).click()
    ]);
    await page.getByRole('button',{name:'Close narration'}).click();
    await page.goto('about:blank');
    await page.unrouteAll({behavior:'wait'});
    console.log('All three WIP entrances resolved to the studio. Its Docs reader loaded the local voice from /next/.');
  }
  async function open(path) {
    const response=await page.goto(new URL(path,base).href);
    assert.equal(response?.status(),200);
    const icons=await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(links=>
      Promise.all(links.map(async link=>{
        const image=new Image();
        image.src=link.href;
        await image.decode();
        return [link.rel,link.sizes.value,new URL(link.href).pathname,image.naturalWidth,image.naturalHeight];
      })));
    assert.deepEqual(icons,[
      ['icon','32x32',prefix+'art/crop-mark-32.png',32,32],
      ['icon','any',prefix+'art/crop-mark.svg',64,64],
      ['apple-touch-icon','180x180',prefix+'art/crop-touch.png',180,180]
    ]);
  }
  async function downloadFile(action, gesture) {
    const [download]=await Promise.all([page.waitForEvent('download'),action[gesture]()]);
    assert.equal(await download.failure(),null,'the browser must finish downloading '+download.suggestedFilename());
    return {name:download.suggestedFilename(),buffer:await buffer(await download.createReadStream())};
  }
  async function downloadJSON(button, gesture = 'click') {
    const file=await downloadFile(button,gesture);
    return JSON.parse(file.buffer.toString('utf8'));
  }

  function clippedValues(controls, allOptions=false) {
    return controls.evaluateAll((elements, checkAllOptions)=>{
      const measure=document.createElement('canvas').getContext('2d');
      return elements.filter(control=>{
        const style=getComputedStyle(control);
        measure.font=style.font;
        const options=checkAllOptions && control.options
          ? Array.from(control.options).filter(o=>!o.hidden && !o.disabled).map(o=>o.text)
          : [control.selectedOptions?.[0]?.text ?? control.value];
        const available=control.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
        return options.some(text=>measure.measureText(text).width+16>available); // Allow for the arrow or spinner.
      }).map(control=>control.id);
    }, allOptions);
  }

  async function checkDirectHelp(target, gesture, expected) {
    await target.scrollIntoViewIfNeeded();
    if (gesture === 'focus') await page.keyboard.press('Tab'); // Use keyboard focus modality.
    await target[gesture]();
    const visible = page.locator('[role="tooltip"]:visible');
    await visible.filter({hasText:expected}).waitFor({timeout:5_000});
    assert.equal(await visible.count(),1,'only the active explanation should be open');
    assert.ok(await visible.evaluate(el=>{
      const b=el.getBoundingClientRect();
      return b.left>=0 && b.top>=0 && b.right<=innerWidth+1 && b.bottom<=innerHeight+1;
    }), 'help should fit in the viewport');
    if (gesture === 'focus') {
      const description=await target.evaluate(el=>(el.getAttribute('aria-describedby') || '').split(/\s+/)
        .map(id=>document.getElementById(id)?.textContent || '').join(' '));
      assert.match(description,expected,'the focused control should expose the same explanation to assistive tech');
    }
    await page.keyboard.press('Escape');
    await visible.waitFor({state:'hidden',timeout:2_000});
    if (gesture === 'focus') assert.ok(await target.evaluate(el=>el===document.activeElement));
  }

  async function checkOrbitDirection(canvas, boxes) {
    // In the side preset a tree on the near edge should follow a rightward drag.
    const tree = boxes.findIndex(box => box.base_xy_m[1] > 7);
    assert.ok(tree >= 0, 'use a tree on the near side of this 10 m planting');
    async function markerPosition() {
      // Compare the same rendered pose with/without the highlight ring. This
      // tracks the actual image independently of the ring color or line width.
      return canvas.evaluate(async (el, tree) => {
        const select = document.querySelector('#highlight');
        async function pixels(value) {
          select.value = value;
          select.dispatchEvent(new Event('change'));
          await new Promise(requestAnimationFrame);
          return new Uint32Array(el.getContext('2d').getImageData(0,0,el.width,el.height).data.buffer);
        }
        const plain = await pixels(''), highlighted = await pixels(String(tree));
        let x = 0, y = 0, count = 0;
        for (let i=0; i<plain.length; i++) if (plain[i] !== highlighted[i]) {
          x += i % el.width; y += Math.floor(i / el.width); count++;
        }
        if (!count) throw Error('The selected tree has no visible highlight on the canvas.');
        return {x:x/count, y:y/count};
      }, tree);
    }
    async function dragFromSide(dx,dy) {
      await page.locator('#view').selectOption('side');
      await canvas.scrollIntoViewIfNeeded();
      const start = await markerPosition();
      const rect = await canvas.boundingBox(), x = rect.x+rect.width/2, y = rect.y+rect.height/2;
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x+dx,y+dy);
      await page.mouse.up();
      const end = await markerPosition();
      return {x:end.x-start.x, y:end.y-start.y};
    }
    assert.ok((await dragFromSide(24,0)).x > 2, 'rightward drag should turn the near tree right');
    assert.ok((await dragFromSide(-24,0)).x < -2, 'leftward drag should turn the near tree left');
    const tilt = await dragFromSide(0,24);
    assert.ok(tilt.y > 2 && Math.abs(tilt.x) < 1, 'downward drag should still tilt the near tree down without sideways movement');
    console.log('The rendered tree followed left and right drags and retained its vertical tilt direction.');
  }

  // Follow a real lesson at the Pages subpath and keep the reader's palette across workspaces.
  await page.emulateMedia({colorScheme:'dark'});
  await open('?budget=12000');
  const theme = page.getByRole('combobox', {name:'Theme',exact:true});
  assert.equal(await theme.inputValue(),'system');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await theme.selectOption('light');
  await page.getByRole('link',{name:'Docs',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.locator('.guideChapter').getByRole('link',{name:'LiDAR lessons',exact:true}).click();
  assert.equal(new URL(page.url()).pathname,prefix+'guide/docs/first-steps/README.html');
  await page.locator('.guideChapter img').first().evaluate(img=>img.decode());
  await theme.selectOption('dark');
  await page.getByRole('link',{name:'Open the hands-on field lesson'}).click();
  assert.equal(new URL(page.url()).hash,'#guide');
  for (const section of ['trainer/', 'benchmark/']) {
    await open(section);
    assert.equal(await theme.inputValue(),'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(await page.getByRole('link',{name:'Docs',exact:true}).count(),1);
  }
  await page.emulateMedia({colorScheme:'light'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await theme.selectOption('system');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  console.log('The Docs tab opened the illustrated lesson and returned to the app. Theme selection followed the system and persisted across workspaces.');

  await open('?crop=lettuce&seed=27&sensor=reference&budget=12000');
  const id=page.locator('#scanId');
  await id.filter({hasText:/^[0-9a-f]{16}$/}).waitFor();
  const firstId=await id.textContent();
  const seed=page.locator('#seed');
  await seed.fill('28');
  await page.getByRole('button',{name:'Grow and scan',exact:true}).click();
  await page.waitForFunction(first=>/^[0-9a-f]{16}$/.test(document.querySelector('#scanId').textContent)
    && document.querySelector('#scanId').textContent!==first,firstId);
  const recipe=await downloadJSON(page.getByRole('button',{name:'Recipe (.json)',exact:true}),'tap');
  assert.equal(recipe.recipe.seed,28);
  assert.equal(recipe.tile_id,await id.textContent());
  await checkDirectHelp(page.locator('#ply'),'hover',/XYZ/i);
  await checkDirectHelp(page.locator('#readouts [data-help-label="Crop returns"] dd'),'tap',/points.*plant/i);
  const help=page.getByRole('button',{name:'Help with Field seed',exact:true});
  await help.click();
  const bubble=page.locator('#'+await help.getAttribute('aria-controls'));
  assert.equal(await bubble.getAttribute('role'),'tooltip');
  assert.ok(await bubble.isVisible());
  await page.keyboard.press('Escape');
  await bubble.waitFor({state:'hidden'});
  console.log('Mobile field generator grew a new planting, exported its recipe and opened and dismissed help.');

  await page.locator('#fitTab').click();
  const lesson=page.locator('#weightBench');
  await page.locator('#oneUpdate').click();
  await lesson.locator('[data-help-label="Height weight"] dd').filter({hasText:'0.50'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#weightBench').dataset.phase==='done');
  assert.equal(await page.locator('#practiceScore').textContent(),'0.62');
  assert.equal(await page.locator('#weedScore').textContent(),'0.62');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#resetWeight').click();
  assert.equal(await page.locator('#lessonWeight').textContent(),'0.00');
  await page.locator('#oneUpdate').click();
  assert.equal(await lesson.getAttribute('data-phase'),'done');
  await page.emulateMedia({reducedMotion:'no-preference'});
  console.log('Learning from one labeled lettuce updated the shared weight and both scores, including reduced-motion playback.');

  for (const viewport of [{width:1366,height:768},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await open('?crop=apple&plantArchitecture=3&plantForm=open-vase&budget=12000&seed=8119411');
    await page.locator('#copyScan:enabled').waitFor();
    const cameraTools=page.locator('#scan-view-controls');
    assert.equal(await cameraTools.evaluate(el=>el.open),viewport.width===1366);
    if (viewport.width===390) {
      const toggle=cameraTools.locator(':scope > summary');
      await toggle.press('Enter');
      assert.ok(await page.locator('#view').isVisible());
      await page.locator('#view').selectOption('side');
      await toggle.press('Enter');
      assert.ok(await page.locator('#view').isHidden());
    }
    await page.locator('#scan-settings a[href="#advanced-scan"]').click();
    const anatomy=page.locator('#advanced-scan #anatomySettings');
    if (!(await anatomy.evaluate(el=>el.open))) await anatomy.locator('summary').click();
    const originalAppleId=await id.textContent();
    await page.locator('#appleCanopy').selectOption('dormant');
    await page.locator('#applyScanSettings').click();
    await page.waitForFunction(first=>document.querySelector('#scanId').textContent!==first &&
      new URL(document.querySelector('#scanLink').href).searchParams.get('appleCanopy')==='dormant',originalAppleId);
    assert.ok(await page.evaluate(()=>document.querySelector('.scanSummary').getBoundingClientRect().bottom <=
      document.querySelector('#advanced-scan').getBoundingClientRect().top+1), 'Advanced settings must follow the scan summary');
    await page.locator('.scanSummary').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight/2,behavior:'instant'}));
    assert.ok(await page.evaluate(()=>document.querySelector('#scan-viewer').getBoundingClientRect().bottom <=
      document.querySelector('.scanSummary').getBoundingClientRect().top+1), 'Apple viewer overlaps scan summary at '+viewport.width+'px');
    const labels=await downloadJSON(page.locator('#labels'));
    assert.equal(labels.crop,'apple');
    const canvas=page.locator('#map');
    if (viewport.width===1366) await checkOrbitDirection(canvas,labels.boxes);
    await canvas.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await canvas.hover();
    const before=await page.evaluate(()=>({y:scrollY,top:document.querySelector('#scan-viewer').getBoundingClientRect().top}));
    await page.mouse.wheel(0,210);
    await page.waitForFunction(y=>scrollY>y,before.y);
    const drift=await page.evaluate(({y,top})=>Math.abs((scrollY-y) +
      document.querySelector('#scan-viewer').getBoundingClientRect().top-top),before);
    assert.ok(drift<2,'The inline apple viewer should move with the document when scrolling');
    const fullscreen=page.locator('.viewer > .viewExpandButton');
    await fullscreen.click();
    const expanded=page.locator('.viewer.viewExpanded');
    await expanded.waitFor({timeout:10_000});
    const fullscreenMode=await expanded.evaluate(el=>document.fullscreenElement===el?'native':
      el.closest('dialog[open]')?'dialog':null);
    assert.ok(fullscreenMode,'An expanded viewer must occupy native fullscreen or an open dialog');
    console.log('Apple viewer at '+viewport.width+' × '+viewport.height+' used '+fullscreenMode+' fullscreen.');
    await fullscreen.click();
    await page.locator('.viewer.viewExpanded').waitFor({state:'detached',timeout:10_000});
  }
  console.log('Apple viewer applied a foliage change, kept the summary clickable, scrolled the page and entered/exited fullscreen at desktop and mobile sizes.');

  // A populated scaffold study opens the longest controls and results on the generator.
  const orchardQuery=new URLSearchParams({crop:'apple',plantArchitecture:2,plantForm:'open-vase',
    plantCondition:'healthy',appleCanopy:'leafy',seed:7412177,sensor:'reference',budget:60000,
    ground:true,noise:'clean',weeds:'off',sticks:'off',boards:'off',studyMode:'damage',studyBox:0});
  await open('?'+orchardQuery);
  await page.locator('#field details').evaluateAll(groups=>groups.forEach(group=>{group.open=true;}));
  await page.locator('#damageZoom').click();
  assert.equal(await page.locator('#damageZoom').getAttribute('aria-pressed'),'true');
  await page.locator('#studyRun').click();
  await page.locator('#studyInspect:visible').waitFor();
  await page.locator('#studyScores').evaluate(group=>{group.open=true;});
  const study=await downloadJSON(page.locator('#studySave'),'tap');
  assert.equal(study.format,'crop-trainer-damage-study-v1');
  assert.deepEqual(study.arms.map(arm=>arm.recipe.plantCondition),['healthy','damaged']);
  assert.equal(await page.locator('#studyTarget').inputValue(),'0');
  for (const [i,link] of ['#studyLinkA','#studyLinkB'].entries()) {
    const url=new URL(await page.locator(link).getAttribute('href'));
    assert.equal(url.searchParams.get('tile'),study.arms[i].tileId);
    assert.equal(url.searchParams.get('box'),'0');
  }
  const methods=[['Height only','heightScores'],['Sampled cells','sampledHeightScores'],['Orchard base','orchardScores']];
  for (const viewport of [{width:320,height:700},{width:768,height:1024},{width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    const layout=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const viewer=rect('#field .viewer'),settings=rect('#scan-settings'),camera=rect('.cameraHelp');
      const sideBySide=viewer.right<=settings.left+1 || settings.right<=viewer.left+1;
      return {
        overflow:document.documentElement.scrollWidth>innerWidth,
        sideBySide:sideBySide && Math.max(viewer.top,settings.top)<Math.min(viewer.bottom,settings.bottom),
        viewerFirst:viewer.bottom<=settings.top+1,
        toolsTouchScan:Math.abs(rect('#scan-view-controls').top-viewer.bottom)<=2,
        toolsAboveSettings:rect('#scan-view-controls').bottom<=settings.top+1,
        summaryAfterWorkspace:rect('.scanSummary').top+1>=Math.max(viewer.bottom,settings.bottom,camera.bottom),
        advancedAfterSummary:rect('#advanced-scan').top+1>=rect('.scanSummary').bottom
      };
    });
    assert.ok(!layout.overflow && layout.toolsTouchScan && layout.summaryAfterWorkspace && layout.advancedAfterSummary,
      'The expanded generator must fit its viewport and keep its summary and settings reachable at '+viewport.width+'px');
    assert.ok(viewport.width===1366 ? layout.sideBySide : layout.viewerFirst && layout.toolsAboveSettings,
      'Keep the scan visible beside the laptop settings and first on narrower screens');
    await page.locator('#recipe').click({trial:true});
    await page.locator('#studySave').click({trial:true});
    if (viewport.width===320) {
      for (const view of ['first','second','both']) {
        await page.locator('input[name=studyMapView][value='+view+']').check();
        assert.equal(await page.locator('#studyFirst').isVisible(),view!=='second');
        assert.equal(await page.locator('#studySecond').isVisible(),view!=='first');
      }
    }
    for (const cm of [7.5,10,15]) {
      await page.locator('#studyScoreDistance').selectOption(String(cm));
      const groups=await page.locator('#studyScoreBody tbody').evaluateAll(bodies=>bodies.map(body=>({
        method:body.querySelector('[scope=rowgroup]').textContent,
        values:Array.from(body.rows).slice(1).map(row=>Array.from(row.querySelectorAll('td'),cell=>cell.textContent))
      })));
      assert.deepEqual(groups,methods.map(([method,key])=>({method,values:study.arms.map(arm=>{
        const s=arm[key].find(score=>score.cm===cm);
        return [String(s.tp),String(s.fp),String(s.fn),s.f1.toFixed(3)];
      })})));
    }
    const unreachable=await page.locator('#studyScoreBody th,#studyScoreBody td').evaluateAll(cells=>cells.filter(cell=>{
      cell.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      const b=cell.getBoundingClientRect();
      return !cell.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
    }).map(cell=>cell.textContent));
    assert.deepEqual(unreachable,[],'Every score column must be reachable at '+viewport.width+'px');
  }
  console.log('Expanded orchard controls, exports, paired scans and every matching distance worked at phone, tablet and laptop sizes.');

  await page.setViewportSize({width:320,height:700});
  await page.locator('#crop').selectOption('high-wire-tomato');
  await page.locator('#seed').fill('4294967295');
  await page.locator('#scan').selectOption('os1-128');
  await page.locator('#budget').selectOption('1000000');
  assert.match(await page.locator('#grow #resolutionInfo').innerText(), /262,144 of the 1,000,000 requested rays/);
  assert.deepEqual(await clippedValues(page.locator('#grow select, #grow input[type=number]')),[],
    'All four selected recipe values should be readable on a narrow phone');

  // Replay a documented tree whose nearby v4 candidates all fell out during spacing.
  const traceQuery=new URLSearchParams(orchardQuery);
  for (const [key,value] of Object.entries({plantArchitecture:3,plantForm:'central-leader',
    seed:14151223,studyMode:'scaffolds',studyMetric:'orchard',studyBox:2})) traceQuery.set(key,value);
  await open('?'+traceQuery+'#scan-study');
  await page.locator('#studyRun').tap();
  const trace=page.locator('#studyOrchardTrace');
  await trace.waitFor({state:'visible'});
  const traceReport=await downloadJSON(page.locator('#studySave'),'tap');
  assert.deepEqual(traceReport.arms.map(arm=>arm.tileId),['ac90cc2ee71a50fe','c1222bdf0546d761']);
  for (const [i,expected] of [[20,1,'7.7 cm','matched'],[3,0,'79.2 cm','spacing']].entries()) {
    const side=i?'B':'A', tree=traceReport.arms[i].plants[2];
    const row=await Promise.all(['Support','Spaced','Nearest'].map(key=>page.locator('#study'+key+side).innerText()));
    assert.deepEqual([...row,await page.locator('#studyOutcome'+side).getAttribute('data-state')],expected.map(String));
    assert.deepEqual([tree.orchardTrace.supportCellCount,tree.orchardTrace.spacedCellCount,
      (tree.nearestOrchardPinM*100).toFixed(1)+' cm',tree.orchardTrace.state],expected);
  }
  await page.locator('#studyZoom').check();
  assert.ok(await page.locator('#studyZoomKey').isVisible());
  assert.equal(new URL(await page.locator('#studyShare').getAttribute('href')).searchParams.get('studyZoom'),'tree');
  // Final centering can bring an outside cell into the scoring circle.
  await page.locator('#studyTarget').selectOption('10');
  assert.equal(await page.locator('#studySpacedB').innerText(),'0');
  assert.equal(await page.locator('#studyOutcomeB').getAttribute('data-state'),'matched');
  assert.equal(new URL(await page.locator('#studyShare').getAttribute('href')).searchParams.get('studyBox'),'10');
  await page.locator('#studyTarget').selectOption('');
  assert.ok(await trace.isHidden());
  assert.ok(await page.locator('#studyZoom').isHidden());
  console.log('Orchard traces reproduced the documented spacing loss and a matched tree after refinement.');

  await page.locator('#studyMode').selectOption('spacing');
  await page.locator('#studySpacing').selectOption('1.35');
  assert.deepEqual(await clippedValues(page.locator('#studySpacing,#studyMode')),[],
    'The selected spacing and comparison mode should be readable at 320px');
  await page.locator('#studyRun').tap();
  await page.locator('#studySave:visible').waitFor();
  const spacingReport=await downloadJSON(page.locator('#studySave'),'tap');
  const [standard,wider]=spacingReport.arms;
  assert.deepEqual([standard.orchardSeparationMeters,wider.orchardSeparationMeters],[1.05,1.35]);
  assert.equal(standard.tileId,wider.tileId);
  assert.deepEqual(standard.heightScores,wider.heightScores);
  assert.deepEqual(standard.sampledHeightScores,wider.sampledHeightScores);
  assert.deepEqual(await page.locator('#studyScoreBody tbody th[scope=row]').allTextContents(),['Fixed','Fixed','1.05 m','1.35 m']);
  assert.deepEqual([standard.reusedScan,wider.reusedScan,wider.timingsMs.generation],[false,true,0]);
  assert.equal(new URL(spacingReport.source).searchParams.get('studySpacing'),'1.35');

  const rankQuery=new URLSearchParams(traceQuery);
  for (const [key,value] of Object.entries({plantArchitecture:4,seed:19105417,sensor:'os1-64',studyMode:'ranking',
    studyMetric:'orchard',studyBox:9,studyZoom:'tree',studyCloud:'on'})) rankQuery.set(key,value);
  await open('?'+rankQuery+'#scan-study');
  await page.locator('#studyRun').tap();
  await trace.waitFor();
  const ranking=await downloadJSON(page.locator('#studySave'),'tap');
  const [usual,low]=ranking.arms;
  assert.equal(ranking.format,'crop-trainer-orchard-ranking-study-v1');
  assert.deepEqual([usual.tileId,low.tileId],Array(2).fill('9bf8d00c2d9b6d4b'));
  assert.deepEqual([usual.orchardRanking,low.orchardRanking],['support','low-wood']);
  assert.equal(usual.orchardSeparationMeters,low.orchardSeparationMeters);
  assert.deepEqual(usual.heightPins,low.heightPins);
  assert.deepEqual(usual.sampledHeightScores,low.sampledHeightScores);
  assert.equal(usual.reusedScan,false);
  assert.equal(low.reusedScan,true);
  assert.equal(low.timingsMs.generation,0);
  for (const [side,arm,distance,matched] of [['A',usual,'50.4 cm',false],['B',low,'4.6 cm',true]]) {
    assert.equal(await page.locator('#studyNearest'+side).innerText(),distance);
    assert.equal(arm.plants[9].orchard,matched);
  }
  assert.equal(low.plants[9].orchardTrace.topCandidate.lowCellCount,1);
  const patch=page.locator('#studyLowPatch');
  assert.equal(low.plants[9].orchardTrace.bestCellId,33315);
  assert.deepEqual(low.orchardLowCellIds,[19917,33115]);
  // 33115 is one 200-cell row south of the candidate, in the bottom-middle square.
  const squares=patch.locator('.lowPatchGrid span');
  assert.equal(await squares.count(),9);
  assert.deepEqual(await squares.evaluateAll(nodes=>nodes.flatMap((node,i)=>node.classList.contains('occupied')?[i]:[])),[7]);
  assert.match(await patch.innerText(),/1 of 9 cells occupied/);
  for (const width of [1024,1440,320,390]) {
    await page.setViewportSize({width,height:844});
    const tableBox=await trace.locator('table').boundingBox(), patchBox=await patch.boundingBox();
    if (width>=1024) {
      assert.ok(patchBox.x>=tableBox.x+tableBox.width-1, 'Show the low-return evidence beside the tree table on a laptop');
    } else {
      assert.ok(patchBox.y>=tableBox.y+tableBox.height-1, 'Read the low-return evidence after the tree table on a phone');
    }
    assert.ok(patchBox.x>=0 && patchBox.x+patchBox.width<=width+1, 'Keep the low-return evidence inside the viewport');
  }
  assert.ok(await page.locator('#studyZoom').isChecked());
  assert.ok(await page.locator('#studyLowReturnsKey').isVisible());
  await page.locator('#studyCloud').uncheck();
  assert.ok(await page.locator('#studyLowReturnsKey').isHidden());
  assert.ok(await patch.isVisible(), 'The 3×3 inset uses the full detector mask independently of point preview');
  await page.locator('#studyMetric').selectOption('returns');
  assert.ok(await patch.isHidden());
  assert.deepEqual(await page.locator('#studyScoreBody tbody th[scope=row]').allTextContents(),['Fixed','Fixed','Usual rule','Low returns']);
  const source=new URL(ranking.source);
  assert.equal(source.searchParams.get('studyMode'),'ranking');
  assert.equal(source.searchParams.get('studyZoom'),'tree');
  assert.equal(source.searchParams.get('studyBox'),'9');
  assert.ok(!new URL(await page.locator('#studyLinkA').getAttribute('href')).searchParams.has('studyMode'));
  await page.locator('#field details').evaluateAll(groups=>groups.forEach(group=>{group.open=true;}));
  for (const family of ['system-ui','DejaVu Sans']) {
    await page.evaluate(name=>document.documentElement.style.setProperty('--sans',name+', sans-serif'),family);
    for (const width of [320,390,608,704,1024,1088,1440]) {
      await page.setViewportSize({width,height:844});
      assert.deepEqual(await clippedValues(page.locator('#grow select, .viewTools select, #studyForm select:enabled:visible, #advanced-scan select:enabled:visible'),true),
        [],'Generator options should fit at '+width+'px in '+family);
    }
  }
  rankQuery.set('seed','18101637');
  rankQuery.set('sensor','reference');
  rankQuery.set('plantCondition','damaged');
  rankQuery.set('plantForm','open-vase');
  rankQuery.set('studyBox','1');
  await open('?'+rankQuery+'#scan-study');
  await page.locator('#studyRun').click();
  await trace.waitFor();
  assert.equal(await page.locator('#scanId').textContent(),'e648f678bc2c34a5');
  assert.equal(await page.locator('#studySupportB').innerText(),'0');
  assert.ok(await patch.isHidden(), 'A tree with no candidate should show no candidate patch');
  console.log('The lower-return study replayed one orchard scan and checked the visible low-cell evidence, fixed controls and saved result.');

  const boardQuery=new URLSearchParams(orchardQuery);
  for (const [key,value] of Object.entries({seed:21490513,sensor:'os1-64',plantArchitecture:4,plantForm:'central-leader',
    plantCondition:'healthy',appleCanopy:'leafy',studyMode:'boards',studyMetric:'orchard',studyCloud:'on',studyBox:1})) boardQuery.set(key,value);
  await open('?'+boardQuery+'#scan-study');
  await page.locator('#studyRun').click();
  await page.locator('#studySave:visible').waitFor();
  const boardReport=await downloadJSON(page.locator('#studySave'));
  assert.equal(boardReport.format,'crop-trainer-orchard-boards-study-v1');
  const [near,across]=boardReport.arms;
  assert.deepEqual(near.plants.map(p=>[p.x,p.y]),across.plants.map(p=>[p.x,p.y]));
  const scanLinks=[];
  for (const [arm,side,placement,tile,returns,scores] of [
    [near,'A','plant','2067527bcc475e59',619,[[2,12,9],[3,11,8],[6,8,5]]],
    [across,'B','independent','112581f2a17baf5d',642,[[1,12,10],[2,11,9],[4,9,7]]]
  ]) {
    assert.deepEqual([arm.boardPlacement,arm.tileId,arm.recipe.boards,arm.reusedScan,arm.orchardRanking],
      [placement,tile,true,false,'low-wood']);
    assert.deepEqual([arm.boardReturns,arm.boardPreviewReturns,arm.previewPoints],[returns,100,9000]);
    assert.deepEqual(arm.orchardScores.map(s=>[s.tp,s.fp,s.fn]),scores);
    assert.match(await page.locator('#studyCount'+side).innerText(),new RegExp(String(returns)));
    scanLinks.push(new URL(await page.locator('#studyLink'+side).getAttribute('href')));
  }
  assert.deepEqual([near.plants[1].orchard,across.plants[1].orchard],[true,false]);
  assert.deepEqual([near.plants[1].boardReturns15cm,across.plants[1].boardReturns15cm],[16,0]);
  assert.match(await page.locator('#studyTargetDetail').innerText(),/16 board returns.*0 with boards across the plot/);
  assert.ok(await page.locator('#studyBoardReturnsKey').isVisible());
  await page.locator('#studyCloud').uncheck();
  assert.ok(await page.locator('#studyBoardReturnsKey').isHidden());
  assert.equal(new URL(await page.locator('#studyShare').getAttribute('href')).searchParams.get('studyMode'),'boards');
  await page.locator('#studyZoom').check();
  await page.locator('#studyRun').click();
  await page.locator('#studySave:visible').waitFor();
  assert.equal(await page.locator('#studyTarget').inputValue(),'1');
  assert.ok(await page.locator('#studyZoom').isChecked());
  for (const [i,url] of scanLinks.entries()) {
    assert.equal(url.searchParams.get('studyMode'),null);
    assert.equal(url.searchParams.get('box'),'1');
    await page.goto(url.href);
    await page.locator('#recipe:enabled').waitFor();
    const saved=await downloadJSON(page.locator('#recipe'));
    assert.equal(saved.tile_id,boardReport.arms[i].tileId);
    assert.equal(saved.recipe.boardPlacement ?? 'plant',boardReport.arms[i].boardPlacement);
  }
  console.log('Board placement held the planting and detector fixed, distinguished full and preview returns and replayed both scans.');

  await open('trainer/?plan=quick&engine=cpu&crop=lettuce&seed=27&sensor=reference&epochs=3');
  {
    const diagram=page.locator('#detectorDiagram'), family=page.locator('#architecture');
    const layerWidths=()=>diagram.locator('.networkWidthLabel').allTextContents();
    const shape=page.locator('#shapeSummary');
    await family.selectOption('linear');
    assert.deepEqual(await layerWidths(),['13','1']);
    assert.match(await shape.innerText(),/14 trainable parameters/);
    await page.emulateMedia({reducedMotion:'reduce'});
    const step=page.getByRole('button',{name:'Next layer',exact:true});
    await step.tap();
    assert.equal(await diagram.locator('[data-current]').getAttribute('data-stage'),'output');
    assert.match(await page.locator('#networkStep').innerText(),/sigmoid/i);
    assert.equal(await diagram.evaluate(el=>el.getAnimations({subtree:true}).length),0);
    await step.tap();
    assert.equal(await diagram.locator('[data-current]').getAttribute('data-stage'),'input');

    await page.emulateMedia({reducedMotion:'no-preference'});
    await family.selectOption('neural');
    const design=page.locator('#modelOptions');
    if (!(await design.evaluate(el=>el.open))) await design.locator('summary').click();
    const depth=page.locator('#depth'), units=page.locator('#widths input');
    await depth.selectOption('4');
    for (const input of await units.all()) await input.fill('32');
    assert.deepEqual(await layerWidths(),['13','32','32','32','32','1']);
    assert.match(await shape.innerText(),/3,649 trainable parameters/);
    for (const viewport of [{width:1366,height:768},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await diagram.scrollIntoViewIfNeeded();
      const box=await diagram.boundingBox();
      assert.ok(box.width>=240 && box.height>=145 && box.x>=0 && box.x+box.width<=viewport.width,
        'The detector diagram should stay large enough to read within the viewport');
    }
    await page.getByRole('button',{name:'Replay signal',exact:true}).tap();
    await page.waitForFunction(()=>document.querySelector('#detectorDiagram').dataset.flow==='playing' &&
      document.querySelector('#detectorDiagram .networkSignal').getAnimations().length>0);
    await depth.selectOption('1');
    await units.first().fill('4');
    assert.deepEqual(await layerWidths(),['13','4','1']);
    assert.match(await shape.innerText(),/61 trainable parameters/);
    console.log('Detector diagram showed logistic and four-layer parameter counts, replayed its signal and traced layers with reduced motion.');
  }
  await page.locator('#run').click();
  const weights=await downloadJSON(page.locator('#downloadWeights'));
  assert.equal(weights.format,'crop-trainer-weights-v1');
  assert.equal(weights.epochs,3);
  assert.equal(weights.crop,'lettuce');
  assert.ok(weights.weights.length>0 && weights.weights.every(Number.isFinite));
  await checkDirectHelp(page.locator('#downloadWeights'),'focus',/field test/i);
  await checkDirectHelp(page.locator('#s15'),'hover',/extra pins.*missed plants/i);
  const run=await downloadJSON(page.locator('#downloadRun'));
  assert.equal(run.backend,'CPU');
  assert.ok(run.stats.samples>0);
  assert.deepEqual(run.scores.map(row=>row.cm),[7.5,10,15]);
  console.log('Training shed completed a CPU fit, scored fresh fields and exported usable weights.');

  await open('trainer/#field-test');
  assert.equal(await page.locator('#testModelSource').inputValue(),'file');
  assert.deepEqual(await page.locator('input[type=file]').evaluateAll(inputs=>inputs.map(input=>input.id).sort()),
    ['testLabels','testPly','testWeights'], 'each field-test file input should have a tested example');
  async function uploadExample(link, input, mimeType) {
    const file=await downloadFile(page.locator('#field-test a[download]'+link),'tap');
    await page.locator(input).setInputFiles({...file,mimeType});
    return file.name;
  }
  const exampleWeights=await uploadExample('#exampleWeights','#testWeights','application/json');
  const exampleScan=await uploadExample('#examplePly','#testPly','application/octet-stream');
  assert.match(exampleScan,/^[a-f0-9]{16}\.ply$/);
  await page.locator('#testDetect').click();
  await page.locator('#testResults:visible').waitFor();
  assert.ok(await page.locator('#testMatchDistance').isHidden(),'scan-only predictions have no reference tolerance');
  assert.ok(await page.locator('#testExtraControl').isHidden(),'surveyed centers are required to call a pin extra');
  assert.ok(await page.locator('#testAlignment').isHidden(),'alignment checks need a survey');
  const exampleCounts=[[7.5,88,100,129],[10,117,71,100],[15,137,51,80]];
  for (const [link,type,extension] of [['#exampleCentersCsv','text/csv','.csv'],['#exampleLabelsJson','application/json','.json']]) {
    const referenceName=await uploadExample(link,'#testLabels',type);
    assert.ok(referenceName.endsWith(extension),'download the intended reference format from '+link);
    await page.locator('#testDetect').click();
    await page.locator('#testMetrics:visible').waitFor();
    const fieldReport=await downloadJSON(page.locator('#testExport'));
    assert.equal(fieldReport.files.model.name,exampleWeights);
    assert.equal(fieldReport.files.scan.name,exampleScan);
    assert.equal(fieldReport.files.labels.name,referenceName);
    assert.equal(fieldReport.references.length,217);
    assert.deepEqual(fieldReport.evaluation.scores.map(s=>[s.cm,s.tp,s.fp,s.fn]),exampleCounts);
    const scoreRows=await page.locator('#testRows tr').evaluateAll(rows=>rows.slice(0,3).map(row=>
      Array.from(row.cells).slice(1,5).map(cell=>cell.textContent)));
    assert.deepEqual(scoreRows,exampleCounts.map(([cm,...counts])=>[cm+' cm',...counts.map(String)]));
    await page.locator('#testMatchDistance').selectOption('7.5');
    assert.match(await page.locator('#testOutcome').textContent(),/88 of 217 reference centers matched within 7\.5 cm/);
    assert.match(await page.locator('#testStageSummary').textContent(),/7\.5 cm/);
    assert.deepEqual(await page.locator('#testStageRows dd').allTextContents(),fieldReport.stagesAtCm['7.5'].map(s=>String(s.matched)));
    await page.locator('#testOverlay').selectOption('baseline');
    const baselineMatches=fieldReport.baselineEvaluation.scores.find(s=>s.cm===7.5).tp;
    assert.ok((await page.locator('#testOutcome').textContent()).includes(baselineMatches+' of 217 reference centers matched within 7.5 cm'));
    await page.locator('#testOverlay').selectOption('model');
    await page.locator('#testMatchDistance').selectOption('15');
    assert.match(await page.locator('#testOutcome').textContent(),/137 of 217 reference centers matched within 15 cm/);
    assert.deepEqual(await page.locator('#testStageRows dd').allTextContents(),fieldReport.stages15cm.map(s=>String(s.matched)));
  }
  {
    const metrics=page.locator('#testMetrics'), wide=metrics.locator(':scope > table');
    const compact=metrics.getByRole('table',{name:'Trained model',exact:true});
    for (const width of [320,390]) {
      await page.setViewportSize({width,height:740});
      await compact.waitFor();
      assert.ok(await wide.isHidden());
      assert.deepEqual(await compact.getByRole('columnheader').allTextContents(),['Measure','7.5 cm','10 cm','15 cm']);
      assert.deepEqual(await compact.getByRole('row',{name:/^Matched /}).getByRole('cell').allTextContents(),['88','117','137']);
      assert.ok(await metrics.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'all field scores must fit without a sideways swipe');
    }
    await checkDirectHelp(compact.getByRole('row',{name:/^Recall /}).getByRole('cell').last(),'focus',/137 of 217 labeled plants matched/);
    await page.setViewportSize({width:1366,height:768});
    assert.ok(await wide.isVisible());
    assert.equal(await metrics.getByRole('table').count(),1,'wide screens expose a single comparison table');
    await page.setViewportSize({width:390,height:844});
  }
  console.log('Downloaded example weights, scan and both reference formats; the Field Test scored all 217 held-out lettuce plants.');

  await open('trainer/?fieldExample=tomato-640#field-test');
  const runExample = page.locator('#testRunExample:enabled');
  await runExample.waitFor();
  assert.equal(await page.locator('#testExample').inputValue(),'tomato-640');
  for (const [fit, matches, extras] of [['tomato-640',53,23],['tomato-40',1,4]]) {
    await page.locator('#testExample').selectOption(fit);
    await runExample.click();
    await page.locator('#testExampleResult:visible').waitFor();
    const example = await downloadJSON(page.locator('#testExport'));
    assert.equal(example.files.model.name,fit+'.json');
    assert.equal(example.files.scan.name,'56b872a50fcac3ab.ply');
    assert.equal(example.references.length,110);
    const at15 = example.evaluation.scores.find(score=>score.cm===15);
    assert.deepEqual([at15.tp,at15.fp],[matches,extras]);
    if (fit === 'tomato-640') {
      await page.locator('#testExampleCutoff').click();
      const trial = await downloadJSON(page.locator('#testExport'));
      assert.deepEqual(trial.files,example.files);
      assert.deepEqual(trial.savedCutoff.pins,example.pins);
      assert.deepEqual(trial.savedCutoff.evaluation,example.evaluation);
      for (const distance of [7.5,15]) {
        await page.locator('#testMatchDistance').selectOption(String(distance));
        const before = example.evaluation.scores.find(s=>s.cm===distance);
        const after = trial.evaluation.scores.find(s=>s.cm===distance);
        assert.deepEqual([after.tp,after.fp,after.fn],distance===15?[26,5,84]:[23,8,87]);
        const deltas = await page.locator('#testCutoffRows tr').evaluateAll(rows=>rows.map(tr=>
          Array.from(tr.cells).slice(1).map(td=>Number(td.textContent.replace('−','-')))));
        assert.deepEqual(deltas,['tp','fp','fn'].map(key=>[before[key],after[key],after[key]-before[key]]));
        await page.locator('#testOverlay').selectOption('changes');
        const lost = distance===15 ? 27 : 21;
        assert.equal(await page.locator('#testOutcome').textContent(),
          'At '+distance+' cm, 0 gained a match and '+lost+' lost a match. '+(110-lost)+' kept the same status.');
        await page.locator('#testOverlay').selectOption('saved');
        assert.ok((await page.locator('#testOutcome').textContent()).includes(before.tp+' of 110'));
        await page.locator('#testOverlay').selectOption('model');
        assert.ok((await page.locator('#testOutcome').textContent()).includes(after.tp+' of 110'));
      }
      await page.locator('#testAlignment > summary').click();
      await page.locator('#testCheckAlignment').click();
      await page.locator('#testAlignmentTable:visible').waitFor();
      const shiftMatches=await page.locator('#testAlignmentRows tr').evaluateAll(rows=>
        rows.map(row=>Number(row.cells[1].textContent)));
      assert.deepEqual(shiftMatches,[26,23,24,22,23],'recorded XY and four independent 10 cm survey shifts at 15 cm');
      assert.equal(shiftMatches[0],trial.evaluation.scores.find(s=>s.cm===15).tp);
      await page.locator('#testShift').selectOption('25');
      assert.equal(await page.locator('#testAlignmentRows tr').count(),0,'changing shift clears the previous scores');
      assert.deepEqual(await downloadJSON(page.locator('#testExport')),trial,'viewing survey shifts preserves the original report');
      await page.locator('#testExtraOnly').check();
      assert.equal(await page.locator('#testExtraCount').textContent(),'of 5');
      const detail=page.locator('#testExtraDetail');
      assert.match(await detail.textContent(),/Pin 3\b.*4\.82 m.*5\.18 m.*0\.937.*32\.6 cm/);
      await page.locator('#testExtraNext').click();
      assert.match(await detail.textContent(),/Pin 4\b.*0\.923.*25\.4 cm/);
      await page.locator('#testMatchDistance').selectOption('7.5');
      assert.equal(await page.locator('#testExtraCount').textContent(),'of 8');
      assert.match(await detail.textContent(),/Pin 4\b/,'the same extra pin stays selected when the tolerance changes');
      await page.locator('#testOverlay').selectOption('changes');
      assert.ok(await page.locator('#testExtraInspector').isHidden());
      await page.locator('#testOverlay').selectOption('model');
      await page.locator('#testAdjustCutoff').click();
      assert.equal(await page.locator('#testCutoff').evaluate(input=>input===document.activeElement && input.closest('details').open),true);
    }
  }
  console.log('Both saved tomato fits placed the documented pins on the same regenerated seedling scan.');

  await open('trainer/?fieldExample=tomato-weed-random#field-test');
  await runExample.click();
  const randomFit=await downloadJSON(page.locator('#testExport'));
  assert.ok(await page.locator('#testWeedComparison').isHidden(),'the comparison needs measured results for both fits');
  await page.locator('#testOtherFit').click();
  const hardFit=await downloadJSON(page.locator('#testExport'));
  assert.deepEqual(randomFit.files.scan,hardFit.files.scan);
  assert.deepEqual(randomFit.files.labels,hardFit.files.labels);
  assert.equal(randomFit.files.scan.name,'3b07cf65952362c6.ply');
  assert.notEqual(randomFit.files.model.sha256,hardFit.files.model.sha256);
  for (const [fit,expected] of [[randomFit,[[35,42,79],[41,36,73],[44,33,70]]],
                                [hardFit,[[23,29,91],[28,24,86],[30,22,84]]]]) {
    assert.equal(fit.detector.threshold,.65);
    assert.deepEqual(fit.evaluation.scores.map(({tp,fp,fn})=>[tp,fp,fn]),expected);
  }
  assert.deepEqual(await page.locator('#testWeedComparison tbody tr').evaluateAll(rows=>
    rows.map(row=>Array.from(row.cells).slice(1).map(cell=>Number(cell.textContent)))),[[44,33,70],[30,22,84]]);
  await page.locator('#testCompareWeedMap').click();
  assert.equal(await page.locator('#testOverlay').inputValue(),'weedChanges');
  for (const cm of [7.5,10,15]) {
    await page.locator('#testMatchDistance').selectOption(String(cm));
    const random=randomFit.evaluation.pinByReferenceAtCm[cm], hard=hardFit.evaluation.pinByReferenceAtCm[cm];
    const changes=random.map((pin,i)=>Number(hard[i]>=0)-Number(pin>=0));
    for (const [group, change] of [['Gained',1],['Lost',-1]]) {
      const expected=changes.flatMap((value,i)=>value===change ? [i] : []);
      const listed=await page.locator('#testWeed'+group+' [data-reference]').evaluateAll(options=>
        options.map(option=>Number(option.dataset.reference)));
      assert.deepEqual(listed,expected,'Changed seedlings should match both exported reports at '+cm+' cm');
    }
  }
  await page.locator('#testWeedPlant').selectOption('77');
  assert.match(await page.locator('#testWeedDetail').innerText(),/11\.2\s*cm/);
  const seedlingLink=new URL(await page.locator('#testWeed3D').getAttribute('href'));
  assert.equal(seedlingLink.searchParams.get('box'),'77');
  assert.equal(seedlingLink.searchParams.get('tile'),randomFit.files.scan.name.replace(/\.ply$/,''));
  assert.ok(await page.locator('#testAlignment').isHidden());
  console.log('Both background-sampling fits reproduced their scores and located the gained seedling on the same planting.');

  // Re-run one of the shed's own held-out scans from its saved scan and weights.
  // This catches a mismatch between training, the downloadable model and Field Test extraction.
  await open('trainer/?plan=quick&engine=cpu&crop=tomato&plantArchitecture=2&plantForm=mixed&validationPlantForm=seedling&seed=687139&sensor=reference&validationSensor=os1-64&epochs=3&minimumHeight=0.035&featureMode=local-ground&sampleLimit=600&positiveSampling=form-soil&valFields=1');
  await page.locator('#run:enabled').waitFor();
  const mode=page.locator('#featureMode');
  assert.equal(await mode.inputValue(),'local-ground');
  const guide=page.locator('#localGroundGuide');
  await guide.locator('summary').click();
  for (const width of [1366,390,320]) {
    await page.setViewportSize({width,height:768});
    const graphic=guide.locator('img');
    await graphic.scrollIntoViewIfNeeded();
    await graphic.evaluate(img=>img.decode());
    const bounds=await graphic.boundingBox();
    assert.ok(bounds.width>=220 && bounds.x>=0 && bounds.x+bounds.width<=width+1,'the illustration must remain readable inside the viewport');
    if (width===1366) {
      const columns=await mode.evaluate(select=>{
        const group=select.closest('#detectorOptions'), panel=group.getBoundingClientRect();
        return [panel.width,group.parentElement.clientWidth,document.querySelector('#localGroundGuide').getBoundingClientRect().width];
      });
      assert.ok(columns[0]>=.9*columns[1] && columns[2]>=.9*columns[0],
        'the expanded detector controls and their illustrated guide should fill the settings panel on a laptop');
    }
  }
  assert.equal(new URL(await page.locator('#featuresBench').evaluate(link=>link.href)).searchParams.get('comparison'),'features');
  await page.locator('#run').click();
  const heldOutRun=await downloadJSON(page.locator('#downloadRun'));
  const modelFile=await downloadFile(page.locator('#downloadWeights'),'click');
  const savedModel=JSON.parse(modelFile.buffer.toString('utf8'));
  assert.equal(savedModel.featureSchema,'crop-peak-13-local-ground-v1');
  assert.equal(savedModel.featureMode,'local-ground');
  const replaySettings=await downloadJSON(page.locator('#downloadSettings'));
  assert.equal(replaySettings.featureMode,'local-ground');
  assert.equal(replaySettings.positiveSampling,'form-soil');
  assert.equal(replaySettings.sampleLimit,600);
  assert.equal(heldOutRun.stats.samples,600);
  const composition=heldOutRun.stats.positiveExamplesByFormSoil;
  assert.equal(composition.reduce((count,group)=>count+group.selected,0),300);
  assert.ok(composition.every(group=>group.selected<=group.available));
  assert.equal(await page.locator('#samplingRows tr').count(),composition.length);
  const tileLink=new URL(await page.locator('#inspectScan').evaluate(link=>link.href));
  const replayTile=heldOutRun.tiles.find(tile=>tile.tile_id===tileLink.searchParams.get('tile'));
  assert.ok(replayTile,'the inspection link should point to a scored holdout tile');
  await page.goto(tileLink.href);
  await page.locator('#ply:enabled').waitFor();
  assert.equal(await page.locator('#scanId').textContent(),replayTile.tile_id);
  const scanFile=await downloadFile(page.locator('#ply'),'click');
  const labelFile=await downloadFile(page.locator('#labels'),'click');
  await open('trainer/#field-test');
  await page.locator('#testWeights').setInputFiles({...modelFile,mimeType:'application/json'});
  await page.locator('#testPly').setInputFiles({...scanFile,mimeType:'application/octet-stream'});
  await page.locator('#testLabels').setInputFiles({...labelFile,mimeType:'application/json'});
  await page.locator('#testDetect').click();
  const replayReport=await downloadJSON(page.locator('#testExport'));
  assert.equal(replayReport.detector.featureSchema,savedModel.featureSchema);
  const matchCounts=rows=>rows.map(({cm,tp,fp,fn})=>[cm,tp,fp,fn]);
  assert.deepEqual(matchCounts(replayReport.evaluation.scores),matchCounts(replayTile.byTolerance));
  await page.locator('#testCutoffSettings > summary').click();
  await page.locator('#testCutoff').fill('0.20');
  await page.locator('#testDetect').click();
  const trial=await downloadJSON(page.locator('#testExport'));
  assert.deepEqual(trial.files,replayReport.files);
  assert.deepEqual(trial.baselineEvaluation,replayReport.baselineEvaluation);
  assert.equal(trial.detector.savedThreshold,savedModel.threshold);
  assert.equal(trial.detector.threshold,.20);
  await page.locator('#testResetCutoff').click();
  await page.locator('#testDetect').click();
  assert.deepEqual(await downloadJSON(page.locator('#testExport')),replayReport,'reset reproduces the saved detector');
  console.log('Saved local-ground tomato weights reproduced the held-out counts at every tolerance and restored the original report after a cutoff trial.');

  await open('benchmark/');
  await page.locator('#benchOptions > summary').click();
  for (const [crop,comparison] of [['lettuce','models'],['apple','forms'],['high-wire-tomato','density'],['tomato','features'],['tomato','sampling']]) {
    await page.locator('#crop').selectOption(crop);
    await page.locator('#comparison').selectOption(comparison);
    for (const width of [320,390,608,844,1024,1440]) {
      await page.setViewportSize({width,height:844});
      assert.deepEqual(await clippedValues(page.locator('#benchForm select:enabled:visible'),true),[],
        comparison+' benchmark choices should fit at '+width+'px');
    }
  }

  await open('benchmark/?comparison=cutoffs&crop=lettuce&seed=27&sensor=reference&epochs=3&live=off');
  await page.locator('#run').click();
  const report=await downloadJSON(page.locator('#export'));
  assert.equal(report.domain,'synthetic');
  assert.equal(report.comparison,'cutoffs');
  assert.deepEqual([...new Set(report.rows.map(row=>row.seed))].sort((a,b)=>a-b),[27,28]);
  for (const seed of [27,28]) {
    const rows=report.rows.filter(row=>row.seed===seed);
    assert.deepEqual(rows.map(row=>row.threshold).sort((a,b)=>a-b),[.35,.5,.65]);
    for (const row of rows) {
      assert.deepEqual(row.scores.map(score=>score.cm),[7.5,10,15]);
      assert.ok(row.scores.every(score=>Number.isFinite(score.f1)));
    }
  }
  const scores=page.locator('#scoreDetails');
  if (!(await scores.evaluate(el=>el.open))) await scores.locator('summary').click();
  const f1Cell=page.locator('#scoreRows tr').first().locator('td').nth(7);
  assert.ok(/\d/.test(await f1Cell.innerText()), 'inspect a score from the completed run');
  await checkDirectHelp(f1Cell,'hover',/precision and recall/i);
  await page.setViewportSize({width:320,height:700});
  for (const distance of ['7.5','10','15','all']) {
    await page.locator('#scoreDistance').selectOption(distance);
    const cells=await page.locator('#scoreRows tr').evaluateAll(rows=>rows.map(row=>Array.from(row.cells,cell=>cell.textContent)));
    const visibleScores=report.rows.flatMap(row=>row.scores.filter(s=>distance==='all' || s.cm===Number(distance)));
    assert.deepEqual(cells.map(r=>r.slice(4)),visibleScores.map(s=>[
      s.cm+' cm',s.precision.toFixed(4),s.recall.toFixed(4),s.f1.toFixed(4),String(s.tp),String(s.fp),String(s.fn)
    ]));
    assert.equal(new URL(await page.locator('#replay').getAttribute('href')).searchParams.get('scoreDistance'),distance);
  }
  assert.ok(await scores.evaluate(el=>el.scrollWidth<=el.clientWidth+1 &&
    Array.from(el.querySelectorAll('tbody td')).every(cell=>{
      const rect=cell.getBoundingClientRect();
      return rect.width>0 && rect.left>=0 && rect.right<=innerWidth;
    })), 'Each phone score and label must fit without sideways scrolling');
  console.log('Paired benchmark exported both seeds, three cutoffs and three matching distances.');

  await open('benchmark/?comparison=cutoffs&trialCutoff=.70&crop=tomato&seed=1603129&epochs=3&live=off');
  assert.equal(await page.locator('#cutoffSchedule').inputValue(),'pair');
  await page.locator('#run').click();
  const cutoffPair=await downloadJSON(page.locator('#export'));
  assert.deepEqual(cutoffPair.thresholds,[.5,.7]);
  assert.deepEqual(cutoffPair.rows.map(r=>[r.seed,r.threshold]),[[1603129,.5],[1603129,.7],[1603130,.7],[1603130,.5]]);
  const heading=await page.locator('#coverageHead [data-cutoff]').allTextContents();
  assert.deepEqual(heading,['At 0.50','At 0.70']);
  const cm=Number(await page.locator('#cutoffDistance').inputValue());
  const totals=cutoffPair.thresholds.map(threshold=>cutoffPair.rows.filter(row=>row.threshold===threshold)
    .reduce((sum,row)=>sum+row.byGround.find(g=>g.ground).scores.find(s=>s.cm===cm).tp,0));
  const displayed=await page.locator('#coverageRows tr').evaluateAll(rows=>
    [2,3].map(column=>rows.reduce((sum,row)=>sum+Number(row.cells[column].textContent.replace('—','0')),0)));
  assert.deepEqual(displayed,totals,'cutoff columns should account for all matched plants with ground present');
  const trialLink=await page.locator('#results a').nth(1).evaluate(a=>a.href);
  assert.equal(new URL(trialLink).searchParams.get('threshold'),'0.7');
  await page.goto(trialLink);await page.locator('#run:enabled').waitFor();
  assert.equal(Number(await page.locator('#threshold').inputValue()),.7);
  console.log('Custom cutoff columns matched the soil-present results and linked to the selected Training Shed threshold.');

  await open('benchmark/?comparison=features&crop=tomato&plantArchitecture=2&plantForm=mixed&validationPlantForm=seedling&seed=23671943&sensor=reference&validationSensor=os1-64&epochs=3&peakAveraging=occupied&live=off');
  assert.ok(await page.locator('#featureMode').isDisabled(),'the feature comparison fixes both contenders');
  await page.locator('#run').click();
  const paired=await downloadJSON(page.locator('#export'));
  assert.equal(paired.comparison,'features');
  const sharedScanLinks=await page.locator('#fieldRows a, #pairViewer').evaluateAll(anchors=>anchors.map(anchor=>anchor.href));
  assert.ok(sharedScanLinks.length>1);
  for (const href of sharedScanLinks) {
    const q=new URL(href).searchParams;
    assert.equal(q.get('peakAveraging'),'occupied');
    assert.equal(q.has('featureMode'),false,'a shared scan should carry only settings common to both feature contenders');
  }
  const links=await page.locator('#results a').evaluateAll(anchors=>anchors.map(anchor=>anchor.href));
  for (const seed of [23671943,23671944]) {
    const twins=paired.rows.filter(row=>row.seed===seed);
    assert.deepEqual(twins.map(row=>row.featureMode).sort(),['absolute','local-ground']);
    const manifests=twins.map(row=>paired.datasets[row.datasetIndex].recipeManifest);
    assert.deepEqual(manifests[0],manifests[1],'both feature sets need the same training and validation scans');
    for (const row of twins) {
      assert.ok(links.some(href=>{
        const query=new URL(href).searchParams;
        return Number(query.get('seed'))===seed && query.get('featureMode')===row.featureMode;
      }),'the contender should replay in the Training shed with its original seed and features');
    }
  }
  console.log('Both tomato feature sets shared every scan and replayed from their benchmark rows.');

  await open('benchmark/?comparison=sampling&sampleLimit=240&crop=tomato&plantArchitecture=2&plantForm=mixed&seed=687139&sensor=reference&validationSensor=os1-64&validationPlantForm=seedling&epochs=3&minimumHeight=0.035&featureMode=local-ground&live=off');
  assert.equal(await page.locator('#sampleLimit').inputValue(),'240');
  await page.locator('#run').click();
  const sampling=await downloadJSON(page.locator('#export'));
  assert.equal(sampling.comparison,'sampling');
  const rowLinks=await page.locator('#results a').evaluateAll(anchors=>anchors.map(a=>a.href));
  for (const seed of [687139,687140]) {
    const arms=sampling.rows.filter(row=>row.seed===seed);
    assert.deepEqual(arms.map(row=>row.positiveSampling).sort(),['form-soil','ordinary']);
    const sets=arms.map(row=>sampling.datasets[row.datasetIndex]);
    assert.deepEqual(sets[0].recipeManifest,sets[1].recipeManifest);
    for (const [index,arm] of arms.entries()) {
      const stats=sets[index].stats;
      assert.equal(stats.samples,240);
      assert.equal(stats.positiveExamplesByFormSoil.reduce((n,group)=>n+group.selected,0),stats.samples/2);
      assert.ok(rowLinks.some(href=>{
        const q=new URL(href).searchParams;
        return Number(q.get('seed'))===seed && q.get('positiveSampling')===arm.positiveSampling && q.get('sampleLimit')==='240';
      }),'the replay link should restore this sampler, field seed and exact row budget');
    }
  }
  const balancedRow=sampling.rows.find(row=>row.positiveSampling==='form-soil');
  const balancedLink=rowLinks.find(href=>{
    const q=new URL(href).searchParams;
    return Number(q.get('seed'))===balancedRow.seed && q.get('positiveSampling')==='form-soil';
  });
  await page.goto(balancedLink);
  await page.locator('#run:enabled').click();
  const repeated=await downloadJSON(page.locator('#downloadRun'));
  assert.deepEqual(repeated.recipeManifest,sampling.datasets[balancedRow.datasetIndex].recipeManifest);
  assert.deepEqual(repeated.scores,balancedRow.scores,'refitting from a benchmark row should reproduce its held-out scores');
  console.log('Both sampling rules used equal budgets, and the Training shed reproduced a benchmark row on the same scans.');

  await open('benchmark/?comparison=negatives&crop=tomato&plantArchitecture=2&seed=2103181&sensor=reference&validationSensor=os1-64&validationPlantForm=seedling&epochs=3&sampleLimit=240&minimumHeight=0.035&featureMode=local-ground&live=off');
  await page.locator('#run').click();
  await page.locator('#cancel:enabled').click();
  await page.locator('#run:enabled').click();
  const backgrounds=await downloadJSON(page.locator('#export'));
  assert.equal(backgrounds.rows.length,4,'restarting should leave one pair per seed');
  for (const seed of [2103181,2103182]) {
    const arms=backgrounds.rows.filter(row=>row.seed===seed);
    assert.deepEqual(arms.map(row=>row.negativeSampling).sort(),['half-hard','ordinary']);
    const [first,second]=arms.map(row=>backgrounds.datasets[row.datasetIndex]);
    assert.deepEqual(first.recipeManifest,second.recipeManifest);
    for (const row of arms) {
      const draw=row.backgroundSelection;
      assert.equal(draw.selected,120);
      assert.equal(draw.hardCount,row.negativeSampling==='half-hard'?60:0);
      assert.equal(draw.scoreBins.reduce((sum,n)=>sum+n,0),draw.selected);
    }
  }
  const hardIndex=backgrounds.rows.findIndex(row=>row.negativeSampling==='half-hard');
  const hardRow=backgrounds.rows[hardIndex];
  await page.locator('#negativeModel').selectOption(String(hardIndex));
  const negativeWeights=await downloadFile(page.locator('#downloadNegative'),'click');
  assert.deepEqual(JSON.parse(negativeWeights.buffer),hardRow.weightArtifact);
  const negativeTile=hardRow.tiles.find(tile=>tile.ground);
  const viewer=await page.locator('#fieldRows a').evaluateAll((links,id)=>
    links.find(link=>new URL(link.href).searchParams.get('tile')===id)?.href,negativeTile.tile_id);
  assert.ok(viewer,'a scored benchmark planting should open in the viewer');
  await page.goto(viewer);
  const negativeScan=await downloadFile(page.locator('#ply:enabled'),'click');
  const negativeLabels=await downloadFile(page.locator('#labels'),'click');
  await open('trainer/#field-test');
  for (const [id,file,mimeType] of [['testWeights',negativeWeights,'application/json'],
       ['testPly',negativeScan,'application/octet-stream'],['testLabels',negativeLabels,'application/json']]) {
    await page.locator('#'+id).setInputFiles({...file,mimeType});
  }
  await page.locator('#testDetect:enabled').click();
  const backgroundReplay=await downloadJSON(page.locator('#testExport'));
  assert.deepEqual(matchCounts(backgroundReplay.evaluation.scores),matchCounts(negativeTile.byTolerance));
  console.log('A canceled background benchmark restarted, exported its selected model and reproduced a held-out scan in Field Test.');

  await open('benchmark/?comparison=scaling&crop=tomato&plantArchitecture=2&seed=3301907&sensor=reference&epochs=3&sampleLimit=240&live=off');
  await page.locator('#run').click();
  const cross=await downloadJSON(page.locator('#export'));
  assert.equal(cross.rows.length,8);
  for (const seed of [3301907,3301908]) {
    await page.locator('#scalingSeed').selectOption(String(seed));
    const group=cross.rows.filter(r=>r.seed===seed);
    const [ordinary,mined]=['ordinary','distance-matched'].map(draw=>group.find(r=>r.negativeSampling===draw && r.scaleSource===draw));
    assert.notDeepEqual(ordinary.weightArtifact.scaling,mined.weightArtifact.scaling);
    for (const row of group) {
      const source=row.scaleSource==='ordinary'?ordinary:mined;
      assert.deepEqual(row.weightArtifact.scaling,source.weightArtifact.scaling);
      assert.deepEqual(row.tiles.map(t=>t.tile_id),ordinary.tiles.map(t=>t.tile_id));
      assert.equal(row.epochs,3);
      assert.equal(row.threshold,.65);
    }
    const shuffledMined=group.find(r=>r.negativeSampling==='ordinary' && r.scaleSource==='distance-matched');
    const save=page.getByRole('button',{name:'Save weights for Shuffled rows · difficult scale on seed '+seed,exact:true});
    assert.deepEqual(await downloadJSON(save),shuffledMined.weightArtifact);
  }
  console.log('All four scaling fits kept the shared test scans and exported their actual training scale on both seeds.');

  await open('benchmark/?comparison=epochs');
  assert.equal(await page.locator('#epochSchedule').inputValue(),'classic','older links should keep their 10/40/100 comparison');
  await open('benchmark/?comparison=epochs&shortEpochs=2&longEpochs=5&crop=tomato&plantArchitecture=2&plantForm=mixed&validationPlantForm=seedling&seed=820713&sensor=reference&validationSensor=os1-64&minimumHeight=0.035&featureMode=local-ground&sampleLimit=240&live=off');
  assert.equal(await page.locator('#epochSchedule').inputValue(),'pair');
  await page.locator('#longEpochs').fill('2');
  await page.locator('#run').click();
  assert.ok(await page.locator('#longEpochs').evaluate(el=>!el.validity.valid),'equal comparison lengths should be rejected');
  await page.locator('#longEpochs').fill('5');
  await page.locator('#run').click();
  const epochRun=await downloadJSON(page.locator('#export'));
  assert.deepEqual(epochRun.rows.map(row=>[row.seed,row.epochs]),[[820713,2],[820713,5],[820714,5],[820714,2]]);
  for (const seed of [820713,820714]) {
    const rows=epochRun.rows.filter(r=>r.seed===seed);
    assert.equal(rows[0].datasetIndex,rows[1].datasetIndex,'both durations must use the same generated dataset');
  }
  await page.locator('#scoreDetails').evaluate(el=>el.open=true);
  await page.locator('#scoreDistance').selectOption('all');
  for (const ground of ['present','removed']) {
    await page.locator('#scoreGround').selectOption(ground);
    const expected=epochRun.rows.flatMap(r=>r.byGround.find(g=>g.ground===(ground==='present')).scores);
    const actual=await page.locator('#scoreRows tr').evaluateAll(rows=>rows.map(r=>Array.from(r.cells).slice(-3).map(c=>Number(c.textContent))));
    assert.deepEqual(actual,expected.map(s=>[s.tp,s.fp,s.fn]),'visible counts should come from the selected ground condition');
  }
  const fiveEpochs=epochRun.rows[1];
  const epochLink=new URL(await page.locator('#results a').nth(1).getAttribute('href'),page.url());
  assert.equal(epochLink.searchParams.get('epochs'),String(fiveEpochs.epochs));
  await page.goto(epochLink.href);
  // The shed applies replay settings after it loads the training modules.
  await page.locator('#run:enabled').waitFor();
  assert.equal(await page.locator('#epochs').inputValue(),String(fiveEpochs.epochs));
  await page.locator('#run:enabled').click();
  const epochReplay=await downloadJSON(page.locator('#downloadRun'));
  assert.deepEqual(epochReplay.recipeManifest,epochRun.datasets[fiveEpochs.datasetIndex].recipeManifest);
  assert.deepEqual(epochReplay.scores,fiveEpochs.scores);
  await page.locator('#lossEpoch').press('Home');
  const firstLoss='Epoch 1 · loss '+epochReplay.loss[0].toPrecision(4)+' · 240 example visits';
  assert.equal(await page.locator('#lossEpoch').getAttribute('aria-valuetext'),firstLoss);
  await page.locator('#lossEpoch').press('End');
  assert.match(await page.locator('#lossText').textContent(),/Epoch 5 .*1,200 example visits/);
  const nextExperiment=new URL(await page.locator('#resultEpochBench').evaluate(a=>a.href)).searchParams;
  assert.deepEqual(['comparison','seed','sampleLimit','shortEpochs','longEpochs'].map(key=>nextExperiment.get(key)),
    ['epochs','820713','240','5','50']);
  console.log('Custom epoch lengths shared both datasets, exposed each soil condition and refit identically in the Training shed.');
  assert.deepEqual(errors,[]);
  console.log('Direct file and result help worked with hover, touch and keyboard; the first export tap downloaded its file.');
} finally {
  try {await browser?.close();} finally {await new Promise(done=>server.close(done));}
}
