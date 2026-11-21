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
  '.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
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
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.setDefaultTimeout(60_000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if (response.url().startsWith(base.origin+'/') && response.status()>=400) errors.push(response.status()+' '+response.url());
  });
  async function open(path) {
    const response=await page.goto(new URL(path,base).href);
    assert.equal(response?.status(),200);
  }
  async function downloadJSON(button) {
    const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
    assert.equal(await download.failure(),null);
    return JSON.parse((await buffer(await download.createReadStream())).toString('utf8'));
  }

  await open('?crop=lettuce&seed=27&sensor=reference&budget=12000');
  const id=page.locator('#scanId');
  await id.filter({hasText:/^[0-9a-f]{16}$/}).waitFor();
  const firstId=await id.textContent();
  const seed=page.locator('#seed');
  await seed.fill('28');
  await page.getByRole('button',{name:'Grow and scan'}).click();
  await page.waitForFunction(first=>/^[0-9a-f]{16}$/.test(document.querySelector('#scanId').textContent)
    && document.querySelector('#scanId').textContent!==first,firstId);
  const recipe=await downloadJSON(page.getByRole('button',{name:'Recipe (.json)',exact:true}));
  assert.equal(recipe.recipe.seed,28);
  assert.equal(recipe.tile_id,await id.textContent());
  const help=page.getByRole('button',{name:'Help with Field seed',exact:true});
  await help.click();
  const bubble=page.locator('#'+await help.getAttribute('aria-controls'));
  assert.equal(await bubble.getAttribute('role'),'tooltip');
  assert.ok(await bubble.isVisible());
  await page.keyboard.press('Escape');
  await bubble.waitFor({state:'hidden'});
  console.log('Mobile field generator grew a new planting, exported its recipe and opened and dismissed help.');

  for (const viewport of [{width:1366,height:768},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await open('?crop=apple&plantArchitecture=3&plantForm=open-vase&budget=12000&seed=8119411');
    await page.locator('#copyScan:enabled').waitFor();
    const anatomy=page.locator('#anatomySettings');
    if (!(await anatomy.evaluate(el=>el.open))) await anatomy.locator('summary').click();
    await page.locator('.scanSummary').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight/2,behavior:'instant'}));
    assert.ok(await page.evaluate(()=>document.querySelector('#scan-viewer').getBoundingClientRect().bottom <=
      document.querySelector('.scanSummary').getBoundingClientRect().top+1), 'Apple viewer overlaps scan summary at '+viewport.width+'px');
    assert.equal((await downloadJSON(page.locator('#labels'))).crop,'apple');

    const canvas=page.locator('#map');
    await canvas.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await canvas.hover();
    const before=await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,210);
    await page.waitForFunction(y=>scrollY>y,before);
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
  console.log('Apple viewer left the advanced-settings summary clickable, scrolled the page and entered/exited fullscreen at desktop and mobile sizes.');

  await open('trainer/?plan=quick&engine=cpu&crop=lettuce&seed=27&sensor=reference&epochs=3');
  await page.locator('#run').click();
  const weights=await downloadJSON(page.locator('#downloadWeights'));
  assert.equal(weights.format,'crop-trainer-weights-v1');
  assert.equal(weights.epochs,3);
  assert.equal(weights.crop,'lettuce');
  assert.ok(weights.weights.length>0 && weights.weights.every(Number.isFinite));
  const run=await downloadJSON(page.locator('#downloadRun'));
  assert.equal(run.backend,'CPU');
  assert.ok(run.stats.samples>0);
  assert.deepEqual(run.scores.map(row=>row.cm),[7.5,10,15]);
  console.log('Training shed completed a CPU fit, scored fresh fields and exported usable weights.');

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
  assert.deepEqual(errors,[]);
  console.log('Paired benchmark exported both seeds, three cutoffs and three matching distances.');
} finally {
  try {await browser?.close();} finally {await new Promise(done=>server.close(done));}
}
