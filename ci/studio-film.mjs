import assert from 'node:assert/strict';

// Missing SVG references can leave the pins visible on an entirely empty plot.
async function checkBotanicalPlate(page,film) {
  const stage=film.locator('.filmStage');
  const plant=film.locator('#filmRosette');
  for (const scene of ['Labels','Epoch','Validation','Cutoff']) {
    await film.getByRole('button',{name:scene,exact:true}).click();
    const withPlants=await stage.screenshot();
    await plant.evaluate(el=>el.style.opacity='0');
    const withoutPlants=await stage.screenshot();
    await plant.evaluate(el=>el.style.removeProperty('opacity'));
    const fraction=await page.evaluate(async images=>{
      async function pixels(data) {
        const image=new Image();
        image.src='data:image/png;base64,'+data;
        await image.decode();
        const canvas=document.createElement('canvas');
        canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,0,0);
        return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      }
      const [a,b]=await Promise.all(images.map(pixels));
      let changed=0;
      for(let i=0;i<a.length;i+=4) if(Math.abs(a[i+1]-b[i+1])>12) changed++;
      return 4*changed/a.length;
    },[withPlants,withoutPlants].map(bytes=>bytes.toString('base64')));
    assert.ok(fraction>.005,scene+' must actually paint its lettuce illustration');
  }
}

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
    const artwork = await film.locator('image[href$=".webp"]').evaluateAll(nodes => Promise.all(nodes.map(async node => {
      const image = new Image();
      image.src = node.getAttribute('href');
      await image.decode();
      return image.naturalWidth;
    })));
    assert.ok(artwork.length === 3 && artwork.every(width=>width>=1000),'Each scene needs its complete botanical plate.');
    const button = name => film.getByRole('button',{name,exact:true});
    await button('Play').focus();
    await page.keyboard.press('Tab');
    assert.ok(await film.locator('.tryShot:not([inert])').evaluate(link=>document.activeElement===link),
      'The practice link should immediately follow Play in keyboard order.');
    for (const [width,height] of [[320,568],[390,844],[568,320],[667,375],[844,390],[768,1024],[1024,768],[1024,1366],[1366,768],[1920,1080]]) {
      await page.setViewportSize({width,height});
      await page.emulateMedia({colorScheme:width%3 ? 'dark' : 'light'});
      let lastStage;
      for (const name of ['Leaf','Returns','Labels','Prediction','Epoch','Validation','Cutoff']) {
        await button(name).click();
        const layout = await film.evaluate((el,scene) => {
          const box = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
          // These are the bounds of the painted plant, the scan rosette and the
          // two measured specimens. Test what the camera shows in screen pixels.
          const [selector,left,top,right,bottom] = {
            Leaf:['.leafCamera',-210,-137,210,137],
            Returns:['.scanCanopy',-134,-131,134,131],
            Labels:['.shotLabels',-170,-112,170,112],
            Prediction:['.shotHeight',-200,-80,180,120],
            Epoch:['.shotEpoch',-184,-80,184,105],
            Validation:['.shotValidation',-179,-112,179,112],
            Cutoff:['.shotCutoff',-179,-112,179,143]
          }[scene];
          const matrix = el.querySelector(selector).getScreenCTM();
          const point = (x,y) => new DOMPoint(x,y).matrixTransform(matrix).toJSON();
          const target = scene === 'Returns' ? box('.targetCenter') : null;
          const marking = scene === 'Prediction' ? box('.heightLine') : null;
          return {pane:box('.filmStage'),caption:box('.filmCaption'),controls:box('.filmControls'),
            center:point(0,0),topLeft:point(left,top),bottomRight:point(right,bottom),target,marking,
            overflow:el.scrollWidth-el.clientWidth};
        },name);
        const {pane,caption,controls,center,topLeft,bottomRight,target,marking} = layout;
        assert.ok(await film.locator('#playFilm').evaluate(el=>{
          const box=el.getBoundingClientRect();
          return el.ownerDocument.elementFromPoint(box.x+box.width/2,box.y+box.height/2)===el;
        }),name+' Play is covered at '+width+'×'+height);
        const playback=await film.locator('#playFilm').boundingBox();
        const practice=await film.locator('.tryShot:not([inert])').boundingBox();
        assert.ok(playback.y<=practice.y+practice.height && playback.x+playback.width<=practice.x+1,
          name+' must show playback before practice at '+width+'×'+height);
        const near = (a,b) => Math.abs(a-b) < 1.5;
        const message = name+' at '+width+'×'+height;
        assert.ok(near(center.x,pane.x+pane.width/2) && near(center.y,pane.y+pane.height/2),message);
        if (target) assert.ok(near(target.x+target.width/2,center.x) && near(target.y+target.height/2,center.y),message);
        if (marking) assert.ok(near(marking.x+marking.width/2,center.x),message);
        assert.ok(topLeft.x >= pane.left-1 && topLeft.y >= pane.top-1 && bottomRight.x <= pane.right+1 && bottomRight.y <= pane.bottom+1,message);
        assert.ok(bottomRight.x-topLeft.x > 100,message+' painted width '+(bottomRight.x-topLeft.x)+' in '+pane.width+'×'+pane.height);
        assert.ok(caption.right <= pane.left+1 || caption.top >= pane.bottom-1,message);
        assert.ok(controls.bottom <= height+1 && layout.overflow < 1 && caption.bottom <= controls.top+1,message);
        if (lastStage) assert.deepEqual(pane,lastStage,'Changing scenes moved the stage at '+message);
        lastStage = pane;
      }
    }
    await page.setViewportSize({width:390,height:844});
    await checkBotanicalPlate(page,film);
    assert.equal(await page.evaluate(()=>window.filmMeters.length),0,'Opening a film or choosing a still must stay silent');
    assert.deepEqual(await film.locator('.scoreValue').allTextContents(),['0.62','0.62']);
    const ambience = film.getByLabel('Ambience',{exact:true});
    assert.equal(await ambience.isChecked(),false);
    await button('Prediction').click();
    await button('Play').click();
    await page.waitForFunction(()=>window.filmMeters.length===2 && window.filmMeters[0]()>.001 && window.filmMeters[1]()===0);
    await ambience.check();
    await page.waitForFunction(()=>window.filmMeters[1]()>.001);
    assert.equal(await film.getAttribute('data-scene'),'prediction','Play must start the chosen scene');
    assert.deepEqual(await film.locator('.scoreValue').allTextContents(),['0.62','0.62'],'Reduced motion keeps the explanatory final frame.');
    const voice = film.getByLabel('Narration',{exact:true});
    await voice.uncheck();
    await page.waitForFunction(()=>window.filmMeters[0]()<.0001 && window.filmMeters[1]()>.001);
    await voice.check();
    await film.getByLabel('Ambience',{exact:true}).uncheck();
    await page.waitForFunction(()=>window.filmMeters[0]()>.01 && window.filmMeters[1]()<.0001);
    await button('Pause').click();
    await button('Resume').click();
    await page.waitForFunction(()=>window.filmStarts.at(-1)>.1);
    await page.waitForFunction(()=>document.getElementById('film').dataset.scene==='epoch',{},{timeout:16000});
    await button('Cutoff').click();
    await button('Replay').waitFor({timeout:24000});
    await button('Replay').click();
    await page.waitForFunction(()=>document.querySelector('#film').dataset.shot==='1',{},{timeout:15000});
    await button('Prediction').click();
    await film.getByRole('link',{name:'Try one model update'}).click();
    await page.waitForFunction(()=>window.filmContext.state==='suspended');
    assert.equal(await film.isHidden(),true);
    assert.ok(await film.evaluate(el=>!el.classList.contains('playing')));
    await page.goto(new URL('studio/',base).href);
    assert.equal(await film.getByLabel('Ambience',{exact:true}).isChecked(),false);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await button('Play').click();
    await page.waitForFunction(() => {
      const y = Number(document.querySelector('.photon').getAttribute('cy'));
      return y > -180 && y < -2;
    });
    await page.waitForFunction(() => Number(document.querySelector('.reflected').getAttribute('cy')) < -1);
    await button('Returns').click();
    await page.waitForFunction(() => {
      const width = Number(document.querySelector('.scanReveal').getAttribute('width'));
      return width > 12 && width < 425;
    });
    await button('Pause').click();
    const stopped = await film.locator('.scanReveal').getAttribute('width');
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(await film.locator('.scanReveal').getAttribute('width'),stopped);
    await button('Resume').click();
    await page.waitForFunction(previous => Number(document.querySelector('.scanReveal').getAttribute('width')) > Number(previous), stopped);
    await button('Prediction').click();
    await page.waitForFunction(() => document.querySelector('.scoreValue').textContent === '0.50');
    await page.waitForFunction(() => [...document.querySelectorAll('.scoreValue')].every(el=>el.textContent === '0.62'),null,{timeout:13000});
    await button('Pause').click();
    await button('Leaf').click();
    await page.route('**/art/audio/*.mp3',route=>route.abort());
    await page.goto(new URL('studio/',base).href);
    await button('Play').click();
    await film.getByRole('status').filter({hasText:'captions'}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#film').dataset.shot==='1',{},{timeout:15000});
    console.log('Verified both soundtrack channels, pause/resume, independent mutes, replay, caption fallback and seven centered film compositions at ten viewport sizes.');
  } finally {
    await page.close();
  }
}
