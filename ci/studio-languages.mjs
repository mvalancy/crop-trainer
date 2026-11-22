import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {languages,languageTags,core} from '../app/language-core.js';
export async function checkLanguages(browser,base) {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(new URL('studio/',base).href);
    const select=page.locator('#siteLanguage');
    assert.deepEqual(await select.locator('option').allTextContents(),Object.values(languages));
    for(const lang of ['ar','es','zh','fr']){
      await select.selectOption(lang);
      await page.locator('html[lang="'+languageTags[lang]+'"]').waitFor({state:'attached'});
      const film=page.locator('#film');
      const play=film.getByRole('button',{name:core('Play',lang),exact:true});
      await play.focus();
      const response=page.waitForResponse(r=>r.url().endsWith('/'+lang+'-leaf-voice.mp3') && r.ok());
      await play.press('Enter');await response;
      await film.getByRole('button',{name:core('Pause',lang),exact:true}).press('Space');
      assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
    }
    await select.selectOption('ar');
    await page.goto(new URL('studio/?view=test&step=explore',base).href);
    const frame=page.frameLocator('.studioFrame:not([hidden])');
    const lab=frame.locator('#explore-test field-investigation');
    await lab.getByRole('button',{name:'حلقات واسعة'}).press('Enter');
    const status=lab.getByRole('status');
    await status.filter({hasText:'مطابقات: 4 · علامات زائدة: 1 · نباتات فائتة: 0'}).waitFor();
    const voice=page.getByRole('button',{name:core('Listen to this activity','ar')});
    await voice.focus();await voice.press('Enter');
    const card=page.getByRole('region',{name:core('Narration player','ar')});
    await card.getByRole('combobox',{name:core('Narration speed','ar')}).selectOption('1.25');
    await card.getByRole('button',{name:core('Pause','ar'),exact:true}).press('Enter');
    await card.getByRole('button',{name:core('Close narration','ar')}).press('Escape');
    assert.ok(await voice.evaluate(el=>el===document.activeElement));
    await page.goto(new URL('guide/',base).href);
    await page.getByRole('heading',{name:core('Crop Trainer field guide','ar'),exact:true}).waitFor();
    await page.getByRole('button',{name:core('Listen to this activity','ar')}).waitFor();
    for(const width of [320,390,844,1366]){
      await page.setViewportSize({width,height:width===844?390:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Arabic guide overflow at '+width);
    }
    // Keep the language chooser and playback controls reachable with enlarged type.
    await page.setViewportSize({width:320,height:660});
    for(const route of ['guide/', 'studio/', 'studio/?view=scan']){
      await page.goto(new URL(route,base).href);
      await page.locator('html[dir=rtl]').waitFor({state:'attached'});
      await page.evaluate(()=>document.documentElement.style.fontSize='200%');
      const bounds=await select.boundingBox();
      assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=320,'Language chooser clipped at '+route);
      if(route==='studio/'){
        const controls=page.locator('.filmControls');
        assert.ok(await controls.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Film controls overflow');
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(new URL('trainer/?plan=quick',base).href);
    await page.locator('html[dir=rtl]').waitFor({state:'attached'});
    await page.locator('#engine').selectOption('cpu');
    await page.locator('#run').click();
    await page.locator('#downloadRun:enabled').waitFor();
    const file=page.waitForEvent('download');
    await page.locator('#downloadRun').click();
    const report=JSON.parse(await readFile(await (await file).path(),'utf8'));
    assert.equal(report.backend,'CPU');
    assert.deepEqual(report.scores.map(score=>score.cm),[7.5,10,15]);
    await page.goto(new URL('guide/',base).href);
    await select.selectOption('en');
    await page.getByRole('heading',{name:'Crop Trainer field guide',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Verified language order, localized film playback, Arabic matching counts, reading direction, keyboard focus return, direct chapter access and English restoration.');
  }finally{await page.close();}
}
