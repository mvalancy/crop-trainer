// Apply the saved palette before first paint, including on generated guide pages.
(() => {
  const languageModule = new URL('site-access.js',document.currentScript.src);
  const key = 'crop-trainer-theme';
  const modes = ['system', 'light', 'dark'];
  const system = matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { choice = localStorage.getItem(key) || choice; } catch { /* Private storage is optional. */ }

  function apply(mode) {
    choice = modes.includes(mode) ? mode : 'system';
    const theme = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice;
    const selector = document.getElementById('siteTheme');
    if (selector) selector.value = choice;
    if (document.documentElement.dataset.theme === theme) return;
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event('crop-theme-change'));
  }

  apply(choice);
  system.addEventListener('change', () => apply(choice));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
  window.addEventListener('pageshow', () => {
    try { apply(localStorage.getItem(key) || 'system'); } catch { apply(choice); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.createElement('label');
    label.className = 'themeChoice';
    label.textContent = 'Theme';
    const selector = document.createElement('select');
    selector.id = 'siteTheme';
    for (const mode of modes) selector.add(new Option(mode[0].toUpperCase() + mode.slice(1), mode));
    selector.value = choice;
    selector.addEventListener('change', () => {
      apply(selector.value);
      try { localStorage.setItem(key, choice); } catch { /* Keep the choice for this page. */ }
    });
    label.append(selector);
    document.querySelector('.barInner').append(label);
    import(languageModule.href).then(({installSiteAccess})=>installSiteAccess(label));
  });
})();
