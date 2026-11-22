import assert from 'node:assert/strict';
import {languages} from '../app/language-core.js';

async function measureControls(page, context) {
  const positions = await page.locator('.appBar').evaluate(bar => {
    const rect = el => {
      const {x,y,width,height} = el.getBoundingClientRect();
      return [x,y,width,height].map(Math.round);
    };
    const visible = [...bar.querySelectorAll('a,button,select')].filter(el =>
      el.checkVisibility() && el.getBoundingClientRect().width > 0);
    const controls = visible.map(rect);
    return {
      theme:rect(bar.querySelector('#siteTheme')),
      language:rect(bar.querySelector('#siteLanguage')),
      controls, names:visible.map(el=>el.id || el.className || el.textContent.trim()), width:document.documentElement.clientWidth
    };
  });
  for (const [i,[x,y,w,h]] of positions.controls.entries()) {
    assert.ok(x >= -1 && x+w <= positions.width+1,context+' has an offscreen header control');
    for (const [j,[bx,by,bw,bh]] of positions.controls.entries()) {
      if (j<=i) continue;
      assert.ok(Math.min(x+w,bx+bw)-Math.max(x,bx)<=1 || Math.min(y+h,by+bh)-Math.max(y,by)<=1,
        context+' overlaps '+positions.names[i]+' and '+positions.names[j]);
    }
  }
  const [x,y,w,h] = positions.theme;
  const [lx,ly,lw,lh] = positions.language;
  assert.ok(w>=44 && lw>=44 && h>=44 && lh>=44,context+' has a small preference target');
  assert.ok(lx>=x+w && lx-x-w<=6 && y===ly,context+' separated the two preferences');
  return [positions.width-lx-lw,ly,positions.width-x-w,y];
}

export async function checkSiteHeader(browser, base) {
  const page = await browser.newPage();
  try {
    const routes = ['','trainer/','benchmark/','guide/',...['learn','scan','train','compare','test','docs'].map(view=>'studio/?view='+view)];
    for (const [width,height] of [[320,640],[740,360],[1366,768]]) {
      await page.setViewportSize({width,height});
      let reference;
      for (const route of routes) {
        await page.goto(new URL(route,base).href);
        const select=page.locator('#siteLanguage');
        await select.waitFor();
        for (const lang of width===320 ? Object.keys(languages) : ['ar','en']) {
          await select.selectOption(lang);
          await page.waitForFunction(l=>(document.documentElement.dataset.language || 'en')===l,lang);
          const context=width+'px '+(route||'home')+' '+lang;
          const positions=await measureControls(page,context);
          reference ??=positions;
          assert.deepEqual(positions,reference,context+' moved the preferences');
          if (width===320) {
            await page.evaluate(()=>document.documentElement.style.fontSize='200%');
            assert.deepEqual(await measureControls(page,context+' at 200%'),reference);
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
              context+' overflows the page with enlarged text');
            await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
          }
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),context+' overflows the page');
        }
      }
    }
    await page.setViewportSize({width:320,height:640});
    for (const view of ['scan','train','compare','test']) {
      await page.goto(new URL('studio/?view='+view+'&lang=ar',base).href);
      await page.waitForFunction(()=>document.documentElement.dataset.language==='ar');
      const reference=await measureControls(page,view);
      const opener=page.locator('#openSettings');
      if (await opener.getAttribute('aria-expanded')!=='true') await opener.click();
      const drawer=page.frameLocator('.studioFrame:not([hidden])').locator('dialog.instrumentInspector:visible');
      await drawer.evaluate(el=>el.ownerDocument.documentElement.style.fontSize='200%');
      assert.deepEqual(await measureControls(page,view+' settings'),reference);
      const back=drawer.locator('.inspectorBack');
      if (await back.isVisible()) await back.click();
      for (const topic of await drawer.locator('.topicButton').all()) {
        await topic.click();
        const panel=drawer.locator('.instrumentPanel:visible');
        const {id,overflow}=await panel.evaluate(el=>{
          for (const details of el.querySelectorAll('details')) details.open=true;
          return {id:el.id,overflow:el.scrollWidth-el.clientWidth};
        });
        assert.ok(overflow<=1,id+' overflows the enlarged settings panel by '+overflow+'px');
        await back.click();
      }
    }
    console.log('Language and Theme stayed adjacent in the same header positions across the classic pages, all six studio modes, RTL, rotation and enlarged text.');
  } finally {await page.close();}
}
