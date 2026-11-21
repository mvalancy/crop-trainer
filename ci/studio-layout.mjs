import assert from 'node:assert/strict';

// Record every rendered frame during the actual worker run. A before/after pair
// misses a canvas that jumps during fitting and returns to its initial size.
async function recordGeometry(instrument) {
  await instrument.locator('.instrument:visible').evaluate(workbench => {
    const elements = ['.instrumentStage', '.instrumentInspector', '.instrumentAction', '.instrumentTransport']
      .map(selector => workbench.querySelector(selector));
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
        measure(el.className, [r.x,r.y,r.width,r.height]);
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
    await instrument.locator('#seed').fill('307');
    await recordGeometry(instrument);
    await instrument.getByRole('button',{name:'Scan field',exact:true}).click();
    await instrument.locator('#scanLink[href*="seed=307"]').waitFor({state:'attached'});
    await checkGeometry(instrument,'Scan',width);
    await instrument.getByRole('button',{name:'Findings',exact:true}).click();
    await instrument.locator('#trainLayout').click();
    await instrument.locator('#firstRun.scanReference img').waitFor();
    await instrument.locator('#runPreset').selectOption('quick');
    await instrument.locator('#engine').selectOption('cpu');
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
    await instrument.getByRole('button',{name:'Your plot',exact:true}).click();
    await instrument.locator('#testPly').waitFor();
    await checkGeometry(instrument,'Field test',width);
    console.log('Verified scan-to-fit handoff and stable geometry at '+width+'px.');
  }
}
