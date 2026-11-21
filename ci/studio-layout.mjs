import assert from 'node:assert/strict';

export async function openSection(page, frame, label) {
  const launcher = page.locator('#openSettings');
  if (await launcher.getAttribute('aria-expanded') !== 'true') await launcher.click();
  const drawer = frame.locator('.instrumentInspector[open]:visible');
  await drawer.waitFor();
  if (await drawer.getByRole('heading', {name:label,exact:true}).count()) return;
  const back = drawer.getByRole('button', {name:'All settings sections'});
  if (await back.isVisible()) await back.click();
  await drawer.getByRole('button', {name:label,exact:true}).click();
}
export async function closeOverlay(page, frame) {
  const modal = frame.locator('dialog:modal');
  if (await modal.count()) {
    await modal.getByRole('button', {name:'Close settings'}).click();
    await page.waitForFunction(() => !history.state?.studioDrawer);
  }
}

// Record every rendered frame during the actual worker run. A before/after pair
// misses a canvas that jumps during fitting and returns to its initial size.
async function recordGeometry(instrument) {
  await instrument.locator('.instrument:visible').evaluate(workbench => {
    const elements = ['.instrumentStage', '.instrumentAction', '.instrumentTransport']
      .map(selector => workbench.querySelector(selector));
    elements.push(...workbench.querySelectorAll('.instrumentReadout, #fieldCaption, #stage, #progress'));
    const live = workbench.querySelector('.liveScene canvas, #testMap');
    const extremes = new Map();
    const phases = new Set();
    let frames = 0;
    let request;
    function measure(key, values) {
      if (!extremes.has(key)) extremes.set(key, values.map(value => [value, value]));
      values.forEach((value, i) => {
        const range = extremes.get(key)[i];
        range[0] = Math.min(range[0], value);
        range[1] = Math.max(range[1], value);
      });
    }
    function sample() {
      frames++;
      elements.forEach(el => {
        const r = el.getBoundingClientRect();
        measure(el.id || el.className, [r.x,r.y,r.width,r.height]);
      });
      measure('viewport scroll', [scrollX,scrollY]);
      const scene = live.getBoundingClientRect();
      if (scene.height) measure('live canvas', [scene.x,scene.y,scene.width,scene.height]);
      phases.add(workbench.querySelector('#stage, #generationStatus, #testStatus, output#status')?.textContent);
      request = requestAnimationFrame(sample);
    }
    sample();
    workbench.stopRecording = () => {
      cancelAnimationFrame(request);
      return {frames, phases:[...phases], ranges:Object.fromEntries(extremes)};
    };
  });
}

async function checkGeometry(instrument, mode, width) {
  const sample = await instrument.locator('.instrument:visible').evaluate(el => el.stopRecording());
  assert.ok(sample.frames > 2, mode+' must render intermediate worker frames');
  assert.ok(sample.ranges['live canvas'], mode+' must display a live canvas');
  for (const [region, dimensions] of Object.entries(sample.ranges)) {
    assert.ok(dimensions.every(([min,max]) => max-min <= 1),
      mode+' at '+width+'px moved '+region+' '+JSON.stringify(dimensions));
  }
  return sample.phases;
}

export async function checkStudioLayout(page, base) {
  for (const width of [390,1366]) {
    await page.setViewportSize({width,height:width===390 ? 844 : 768});
    await page.goto(new URL('studio/?view=scan',base).href);
    const instrument = page.frameLocator('iframe:not([hidden])');
    await instrument.locator('#fieldCaption').filter({hasText:'plants'}).waitFor();
    await openSection(page,instrument,'Planting');
    await instrument.locator('#seed').fill('307');
    await closeOverlay(page,instrument);
    await recordGeometry(instrument);
    await instrument.getByRole('button',{name:'Scan field',exact:true}).click();
    await instrument.locator('#scanLink[href*="seed=307"]').waitFor({state:'attached'});
    await checkGeometry(instrument,'Scan',width);
    await openSection(page,instrument,'Findings');
    await closeOverlay(page,instrument);
    await instrument.locator('#trainLayout').click();
    await instrument.locator('#firstRun.scanReference img').waitFor();
    await openSection(page,instrument,'Setup');
    await instrument.locator('#runPreset').selectOption('quick');
    await instrument.locator('#engine').selectOption('cpu');
    await closeOverlay(page,instrument);
    await recordGeometry(instrument);
    await instrument.getByRole('button',{name:'Start training',exact:true}).click();
    await instrument.locator('#stage').filter({hasText:'Run complete'}).waitFor();
    const phases = await checkGeometry(instrument,'Train',width);
    assert.ok(phases.some(phase => phase.includes('Generating')));
    assert.ok(phases.some(phase => phase.includes('Training')));
    await instrument.getByRole('link',{name:'View scores',exact:true}).click();
    await instrument.locator('#runReview').waitFor();
    await page.goto(new URL('studio/?view=compare',base).href);
    await instrument.locator('#run:enabled').waitFor();
    await recordGeometry(instrument);
    await instrument.locator('#run').click();
    await instrument.locator('#cancel:enabled').waitFor();
    await openSection(page,instrument,'Scoreboard');
    await closeOverlay(page,instrument);
    await instrument.locator('#cancel').click();
    await instrument.locator('#run:enabled').waitFor();
    await checkGeometry(instrument,'Compare',width);

    await page.goto(new URL('studio/?view=test',base).href);
    await instrument.locator('#testRunExample:enabled').waitFor();
    await recordGeometry(instrument);
    await instrument.locator('#testRunExample').click();
    await instrument.locator('#testMap:visible').waitFor();
    await instrument.getByRole('button',{name:'Inspect detections'}).click();
    await instrument.locator('#testExport').waitFor();
    assert.equal(await instrument.locator('[data-instrument=test]').getAttribute('data-input'),'example');
    await openSection(page,instrument,'Your plot');
    await instrument.locator('#testPly').waitFor();
    await checkGeometry(instrument,'Field test',width);
    console.log('Verified scan-to-fit handoff and stable geometry at '+width+'px.');
  }
}

export async function checkDrawer(page, base) {
  for (const [width,height] of [[320,640],[740,360],[1366,768]]) {
    await page.setViewportSize({width,height});
    await page.goto(new URL('studio/?view=scan',base).href);
    const frame = page.frameLocator('iframe:not([hidden])');
    const stage = frame.locator('.instrumentStage:visible');
    await frame.locator('#fieldCaption').filter({hasText:'plants'}).waitFor();
    const before = await stage.boundingBox();
    await openSection(page,frame,'Planting');
    const drawer = frame.locator('dialog[open]:visible');
    const bounds = await drawer.boundingBox();
    if (width < 1000) {
      assert.equal(await frame.locator('dialog:modal').count(),1);
      assert.deepEqual(await stage.boundingBox(),before);
      assert.ok(bounds.width <= width-32);
      assert.equal(await page.locator('.studioBar').evaluate(el=>el.inert),true);
      await page.keyboard.press('Escape');
      await drawer.waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.activeElement.id==='openSettings' && !history.state?.studioDrawer);
      await page.locator('#openSettings').click();
      await drawer.getByRole('button',{name:'All settings sections'}).click();
      const last = drawer.getByRole('button',{name:'Findings',exact:true});
      await last.focus();
      await page.keyboard.press('Tab');
      assert.equal(await frame.locator(':focus').getAttribute('aria-label'),'Close settings');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await frame.locator(':focus').getAttribute('aria-label'),'Findings');
      await page.goBack();
      await drawer.waitFor({state:'hidden'});
      await page.goForward();
      await drawer.waitFor();
      await closeOverlay(page,frame);
      await page.locator('#openSettings').click();
      const field = await stage.boundingBox();
      await page.mouse.click(field.x + field.width - 10, field.y + 25);
      await drawer.waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.activeElement.id==='openSettings' && !history.state?.studioDrawer);
    } else {
      assert.equal(await frame.locator('dialog:modal').count(),0);
      assert.ok(bounds.x + bounds.width <= before.x+1);
      await page.locator('#openSettings').click();
      assert.ok((await stage.boundingBox()).width > before.width + 200);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(new URL('studio/?view=scan&step=recipe',base).href);
  const frame = page.frameLocator('iframe:not([hidden])');
  await frame.locator('dialog:modal #noise').selectOption('clean');
  await frame.locator('#applyScanSettings').click();
  await frame.locator('dialog:modal').waitFor({state:'hidden'});
  await frame.locator('#scanLink[href*="noise=clean"]').waitFor({state:'attached'});
  assert.equal(new URL(page.url()).searchParams.has('step'),false);
}
