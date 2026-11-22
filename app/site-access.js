import {installLanguages} from './language.js';
import {installPageNarration} from './page-narration.js';
export function installSiteAccess(theme) {
  if(document.getElementById('siteLanguage'))return;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./language.css',import.meta.url).href;document.head.append(sheet);
  installLanguages(theme);
  installPageNarration();
}
