import assert from 'node:assert/strict';

export async function checkFieldFilm(browser, base) {
  const page = await browser.newPage({viewport:{width:390,height:844}, reducedMotion:'reduce'});
  try {
    // Tap the real mix outputs to distinguish audible playback from a changing button.
    await page.addInitScript(() => {
      window.filmMeters = [];
      const makeGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function() {
        window.filmContext = this;
        const gain = makeGain.call(this);
        const meter = this.createAnalyser();
        gain.connect(meter);
        const samples = new Float32Array(meter.fftSize);
        window.filmMeters.push(() => {
          meter.getFloatTimeDomainData(samples);
          return Math.max(...samples.map(Math.abs));
        });
        return gain;
      };
      window.filmStarts = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) {
        if (this.buffer) window.filmStarts.push(args[1] || 0);
        return start.apply(this,args);
      };
    });
    await page.goto(new URL('studio/',base).href);
    const film = page.locator('#film');
    await film.getByRole('button',{name:'Prediction',exact:true}).click();
    for (const [width,height] of [[320,568],[390,844],[568,320],[667,375],[844,390],[768,1024],[1024,768],[1024,1366],[1366,768],[1920,1080]]) {
      await page.setViewportSize({width,height});
      const layout = await film.evaluate(el => {
        const box = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
        return {screen:box('.filmScreen'),pane:box('.predictionPane'),art:box('.predictionArt'),
          line:box('.heightLine'),caption:box('.filmCaption'),controls:box('.filmControls'),overflow:el.scrollWidth-el.clientWidth};
      });
      const {screen,pane,art,line,caption,controls} = layout;
      const near = (a,b) => Math.abs(a-b) < 1.5;
      assert.ok(near(art.x+art.width/2,pane.x+pane.width/2) && near(art.y+art.height/2,pane.y+pane.height/2),'Prediction must be centered at '+width+'×'+height);
      assert.ok(near(line.x+line.width/2,pane.x+pane.width/2));
      assert.ok(controls.bottom <= height+1,'Film controls extend to '+controls.bottom+' at '+width+'×'+height);
      assert.ok(art.width > 200 && art.top >= screen.top && art.bottom <= screen.bottom+1);
      assert.ok(caption.right <= art.left+1 || caption.top >= art.bottom-1);
      assert.ok(caption.bottom <= controls.top+1 && layout.overflow < 1);
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>window.filmMeters.length),0,'Opening a film or choosing a still must stay silent');
    const button = name => film.getByRole('button',{name,exact:true});
    await button('Play story').click();
    await page.waitForFunction(()=>window.filmMeters.length===2 && window.filmMeters.every(read=>read()>.001));
    assert.equal(await film.getAttribute('data-shot'),'2','Play must start the chosen scene');
    const voice = film.getByLabel('Narration',{exact:true});
    await voice.uncheck();
    await page.waitForFunction(()=>window.filmMeters[0]()<.0001 && window.filmMeters[1]()>.001);
    await voice.check();
    await film.getByLabel('Ambience',{exact:true}).uncheck();
    await page.waitForFunction(()=>window.filmMeters[0]()>.01 && window.filmMeters[1]()<.0001);
    await button('Pause story').click();
    await button('Resume story').click();
    await page.waitForFunction(()=>window.filmStarts.at(-1)>.1);
    await button('Replay story').waitFor({timeout:18000});
    await button('Replay story').click();
    await page.waitForFunction(()=>document.querySelector('#film').dataset.shot==='1',{},{timeout:15000});
    await button('Prediction').click();
    await film.getByRole('link',{name:'Try one model update'}).click();
    await page.waitForFunction(()=>window.filmContext.state==='suspended');
    assert.equal(await film.isHidden(),true);
    assert.ok(await film.evaluate(el=>!el.classList.contains('playing')));
    await page.goto(new URL('studio/',base).href);
    assert.equal(await film.getByLabel('Ambience',{exact:true}).isChecked(),false);
    await page.route('**/art/audio/*.mp3',route=>route.abort());
    await button('Play story').click();
    await film.getByRole('status').filter({hasText:'captions'}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#film').dataset.shot==='1',{},{timeout:15000});
    console.log('Verified both soundtrack channels, pause/resume, independent mutes, replay, caption fallback and Prediction framing at ten viewport sizes.');
  } finally {
    await page.close();
  }
}
