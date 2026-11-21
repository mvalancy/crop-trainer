import assert from 'node:assert/strict';
import {openSection} from './studio-layout.mjs';
import {voiceovers} from '../app/studio-voiceovers.js';

export async function checkStudioNarration(browser, base) {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  const downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/\.(mp3|wasm)$/.test(response.url())) downloads.push(response.url());
  });
  try {
    // Inspect the buffers that actually reach Web Audio, including synthesized speech.
    await page.addInitScript(() => {
      window.spokenBuffers = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) {
        const audible = this.buffer.getChannelData(0).some(sample => Math.abs(sample) > .01);
        window.spokenBuffers.push({rate:this.buffer.sampleRate, audible, offset:args[1] || 0});
        return start.apply(this,args);
      };
    });
    const voice = page.getByRole('button',{name:'Listen to this activity'});
    const card = page.getByRole('region',{name:'Narration player'});
    const frame = page.frameLocator('iframe:not([hidden])');
    await page.goto(new URL('studio/?view=scan',base).href);
    await voice.waitFor();
    assert.deepEqual(downloads,[], 'The reader should load on demand.');
    await voice.click();
    await page.waitForFunction(() => window.spokenBuffers.some(b => b.audible));
    assert.ok(downloads.some(url => url.endsWith('/guide-generate.mp3')));
    await card.getByRole('button',{name:'Pause',exact:true}).click();
    await card.getByRole('button',{name:'Play',exact:true}).click();
    await page.waitForFunction(() => window.spokenBuffers.some(b => b.offset > 0));

    await card.getByRole('button',{name:'Minimize narration'}).click();
    await openSection(page,frame,'Planting');
    const drawer = frame.locator('dialog:modal');
    await drawer.getByRole('button',{name:'Narration controls'}).click();
    const mobileCard = drawer.getByRole('region',{name:'Narration player'});
    await mobileCard.getByText(voiceovers['field-inspector-planting'],{exact:true}).waitFor();
    await mobileCard.getByRole('button',{name:'Pause',exact:true}).click();
    await mobileCard.getByRole('button',{name:'Next passage'}).click();
    await mobileCard.getByRole('button',{name:'Play',exact:true}).click();
    await page.waitForFunction(() => window.spokenBuffers.some(b => b.audible && b.rate === 16000));
    await mobileCard.getByRole('button',{name:'Close narration'}).click();
    await drawer.getByRole('button',{name:'Close settings'}).click();

    await page.setViewportSize({width:1366,height:768});
    const activity = name => page.getByRole('navigation',{name:'Studio activities'}).getByRole('link',{name,exact:true});
    await activity('Docs').click();
    await voice.click();
    await card.getByRole('button',{name:'Pause',exact:true}).click();
    const chapters = card.getByRole('combobox',{name:'Start at section'});
    assert.ok((await chapters.locator('option').count()) > 1);
    await chapters.selectOption({index:1});
    assert.ok((await card.locator('.listenTranscript').textContent()).trim());
    await frame.locator('.guideChapter').getByRole('link',{name:'LiDAR lessons',exact:true}).click();
    await card.locator('header strong').filter({hasText:'How does a browser learn to spot lettuce?'}).waitFor();
    const before = await page.evaluate(() => window.spokenBuffers.length);
    await card.getByRole('button',{name:'Play',exact:true}).click();
    await page.waitForFunction(count => window.spokenBuffers.slice(count).some(b => b.audible && b.rate === 16000),before);
    await activity('Train').click();
    await card.getByText(voiceovers.fit,{exact:true}).waitFor();
    await activity('Field test').click();
    await card.getByText(voiceovers.test,{exact:true}).waitFor();
    await activity('Compare').click();
    await card.getByText(voiceovers.experiment,{exact:true}).waitFor();
    await activity('Learn').click();
    await page.getByRole('button',{name:'Play story'}).waitFor();
    assert.equal(await voice.isVisible(),false);

    // Use the generated chapter index, so new chapters automatically join this check.
    await page.goto(new URL('guide/',base).href);
    const coverage = await page.evaluate(async moduleURL => {
      const {readPassages} = await import(moduleURL);
      const urls = new Set([...document.querySelectorAll('.chapterMenu a[href]')].map(a => a.href));
      urls.add(new URL('index.html', location.href).href);
      const sample = document.createElement('div');
      document.body.append(sample);
      for (const url of urls) {
        const response = await fetch(url);
        const chapter = new DOMParser().parseFromString(await response.text(),'text/html').querySelector('.guideChapter');
        const title = chapter.querySelector('h1').textContent.trim();
        for (const image of chapter.querySelectorAll('img')) image.removeAttribute('src');
        sample.replaceChildren(chapter);
        const passages = readPassages([chapter]);
        if (!passages.some(p => p.heading === title) || !passages.some(p => !p.heading && p.text.length > 20)) {
          throw new Error('Missing chapter narration: ' + url);
        }
      }
      // Values must come from the control and the row at reading time.
      sample.innerHTML = '<label>Seed <input type="number" value="27"></label><table><thead><tr><th>F1</th></tr></thead><tbody><tr><td>0.82</td></tr></tbody></table>';
      sample.querySelector('input').value = '739';
      const values = readPassages([sample]).map(p => p.text);
      return {count:urls.size,values};
    },new URL('app/studio-passages.js',base).href);
    assert.ok(coverage.count >= 62);
    assert.deepEqual(coverage.values,['Seed 739','F1: 0.82']);
    console.log('Read headings and body text from ' + coverage.count + ' generated guide pages and read current control and table values.');

    // Every authored tour must survive packaging under the project subpath.
    for (const key of Object.keys(voiceovers)) {
      const recording = await page.request.get(new URL('art/audio/guide-' + key.toLowerCase() + '.mp3',base).href);
      assert.equal(recording.status(),200,key);
      assert.ok((await recording.body()).length > 1000,key);
    }
    assert.deepEqual(errors,[]);
    console.log('Recorded tours and on-device reading played audible samples. The reader followed settings, chapters and activities and respected pause.');
  } finally {
    await page.close();
  }
}
