import {installLanguages} from './language.js';
import {installPageNarration} from './page-narration.js';

// Wait for the shared styles before moving the controls into the header. This also
// covers the classic release, which loads this module from the verified studio.
const stylesReady = Promise.all(['language.css','site-header.css'].map(file => new Promise(resolve => {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL(file,import.meta.url).href;
  sheet.onload = sheet.onerror = resolve;
  document.head.append(sheet);
})));

export async function installSiteAccess(theme) {
  await stylesReady;
  if (document.getElementById('siteLanguage')) return;
  const bar = theme.closest('.barInner');
  const tools = document.createElement('div');
  tools.className = 'siteTools';
  bar.classList.add('appBar');
  bar.append(tools);

  const slot = bar.querySelector('#listenSlot');
  if (slot) tools.append(slot);
  else installPageNarration(tools);

  const label = document.createElement('span');
  label.className = 'preferenceLabel';
  label.id = 'siteThemeLabel';
  label.append(theme.firstChild);
  theme.prepend(label);
  theme.title = label.textContent;
  theme.querySelector('select').setAttribute('aria-labelledby',label.id);
  theme.insertAdjacentHTML('afterbegin','<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>');
  tools.append(theme);
  installLanguages(theme);
}
