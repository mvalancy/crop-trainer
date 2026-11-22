import assert from 'node:assert/strict';

export async function checkInvestigations(browser,base) {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    const frame=page.frameLocator('.studioFrame:not([hidden])');
    const topics={
      learn:['Returns','85% of the illustration swept'],
      scan:['Dense scan','leaf returns'],
      train:['One update','both crop scores 0.62'],
      compare:['Be selective','2 matched · 0 extra · 2 missed'],
      test:['Wide rings','4 matched · 1 extra · 0 missed']
    };
    for (const [view,[preset,reading]] of Object.entries(topics)) {
      await page.goto(new URL('studio/?view='+view,base).href);
      await page.getByRole('navigation',{name:'Activity sections'}).getByRole('link',{name:'Explore',exact:true}).click();
      const lab=frame.locator('#explore-'+view+' field-investigation');
      await lab.getByRole('button',{name:preset,exact:true}).click();
      await lab.getByRole('status').filter({hasText:reading}).waitFor();
      if (view==='scan') await lab.getByRole('status').filter({hasText:'The seedling caught'}).waitFor();
      const slider=lab.getByRole('slider');
      await slider.press('Home');
      const before=await slider.getAttribute('aria-valuetext');
      await slider.press('ArrowRight');
      assert.notEqual(await slider.getAttribute('aria-valuetext'),before);
      await lab.getByRole('link').click();
      assert.ok(!new URL(page.url()).searchParams.has('step') || !page.url().includes('step=explore'));
      await page.goBack();
      await lab.getByRole('slider').waitFor();
    }
    await page.goto(new URL('studio/?view=docs',base).href);
    const chapter=frame.locator('.guideChapter');
    await chapter.getByRole('link',{name:'LiDAR lessons',exact:true}).click();
    const scan=chapter.locator('field-investigation');
    await scan.getByRole('button',{name:'Dense scan'}).click();
    await scan.getByRole('status').filter({hasText:'The seedling caught'}).waitFor();
    await chapter.getByRole('button',{name:'Study figure',exact:true}).first().click();
    const viewer=frame.getByRole('dialog',{name:'Study an illustration'});
    await viewer.getByRole('button',{name:'Next',exact:true}).click();
    const motion=viewer.getByRole('button',{name:'Pause motion',exact:true});
    await motion.click();
    await viewer.getByRole('slider',{name:'Animation time'}).press('End');
    assert.ok(await viewer.getByRole('button',{name:'Play motion'}).isVisible());
    await viewer.getByRole('button',{name:'Magnify'}).click();
    assert.equal(await viewer.getByRole('button',{name:'Magnify'}).getAttribute('aria-pressed'),'true');
    await viewer.getByRole('button',{name:'Close illustration'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await chapter.getByRole('button',{name:'Study figure',exact:true}).first().click();
    assert.equal(await viewer.getByRole('slider',{name:'Animation time'}).count(),0);
    await page.keyboard.press('Escape');
    await viewer.waitFor({state:'hidden'});
    await page.goto(new URL('guide/docs/tomato-training-duration.html',base).href);
    const chart=page.locator('.guidePlot').first();
    await chart.locator('summary').click();
    await chart.getByRole('combobox').selectOption({label:'Branching precision change on grids'});
    assert.deepEqual(await chart.locator('.plotRow strong').allTextContents(),['−1.14 points','−2.62 points']);
    for (const crop of ['lettuce','bench-lettuce','artichoke','young-tomato','apple','grapevine','high-wire-tomato']) {
      await page.goto(new URL('guide/trainer/plants/'+crop+'.html',base).href);
      const specimen=page.locator('.guideSpecimen');
      await specimen.getByRole('combobox').selectOption({index:1});
      await specimen.getByRole('slider').press('ArrowRight');
      assert.equal(await specimen.getByRole('slider').getAttribute('aria-valuetext'),'40 degrees');
      assert.ok((await specimen.locator('.specimenFinding').innerText()).length>20);
      const recipe=new URL(await specimen.getByRole('link').getAttribute('href'));
      assert.equal(recipe.searchParams.get('plantForm'),await specimen.getByRole('combobox').inputValue());
    }
    assert.deepEqual(errors,[]);
    console.log('Verified five interactive field experiments, chapter controls, SVG motion scrubbing, plots of recorded data and all seven crop specimens.');
  } finally {await page.close();}
}
