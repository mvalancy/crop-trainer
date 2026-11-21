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
  '.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.csv':'text/csv','.png':'image/png'};
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
  }
  console.log('Downloaded example weights, scan and both reference formats; the Field Test scored all 217 held-out lettuce plants.');

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
  assert.deepEqual(errors,[]);
  console.log('Paired benchmark exported both seeds, three cutoffs and three matching distances.');
  console.log('Direct file and result help worked with hover, touch and keyboard; the first export tap downloaded its file.');
} finally {
  try {await browser?.close();} finally {await new Promise(done=>server.close(done));}
}
