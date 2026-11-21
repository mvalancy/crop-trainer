// Snapshot the visible lesson, controls and measurements when a reading starts.
// A passage is also the transcript, pause/resume unit and target for section jumps.
export function readPassages(roots) {
  const passages = [];
  let words = [];
  function flush(heading) {
    const text = words.join(' ').replace(/\s+/g, ' ').trim();
    words = [];
    // Keep sentence endings intact where possible. Long paths and code samples
    // can have no spaces at all, so also bound the input to the voice engine.
    function emit(line) {
      if (!/[\p{L}\p{N}]/u.test(line)) return;
      passages.push({text:line, heading});
      heading = undefined;
    }
    let line = '';
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const next = sentence.trim();
      if (!next) continue;
      if (line && line.length + next.length >= 280) {
        emit(line);
        line = '';
      }
      for (const word of next.split(/\s+/)) {
        for (const part of word.match(/.{1,200}/gu)) {
          if (line.length + part.length >= 280 && line) {
            emit(line);
            line = '';
          }
          line += (line ? ' ' : '') + part;
        }
      }
    }
    if (line) emit(line);
  }
  function visit(el) {
    if (el.nodeType === 3) { words.push(el.nodeValue); return; }
    if (el.nodeType !== 1 || el.matches('script,style,template,[hidden],[aria-hidden="true"],.helpTrigger,.helpDisabledProxy,.studioListen,.listenCard')) return;
    if (!el.checkVisibility() && el.ownerDocument.defaultView.getComputedStyle(el).display !== 'contents') return;
    const tag = el.localName;
    if (tag === 'img' || tag === 'canvas' || tag === 'svg') {
      const description = el.getAttribute('alt') || el.getAttribute('aria-label') || el.querySelector('desc')?.textContent || el.querySelector('title')?.textContent;
      if (description) { flush(); words.push(description); flush(); }
      return;
    }
    // A separate ARIA label often carries the unit or name of a numeric control.
    if (['input','textarea','select'].includes(tag) && el.hasAttribute('aria-label')) {
      words.push(el.getAttribute('aria-label'));
    }
    if (tag === 'textarea') { words.push(el.value); return; }
    if (tag === 'select') { words.push([...el.selectedOptions].map(option=>option.text).join(', ')); return; }
    if (tag === 'input') {
      if (el.type === 'checkbox' || el.type === 'radio') words.push(el.checked ? 'selected' : 'unselected');
      else if (!['hidden','password','file'].includes(el.type)) words.push(el.value);
      return;
    }
    if (tag === 'table') {
      flush();
      const labels = [...el.tHead?.rows[0]?.cells || []].map(cell=>cell.innerText.trim());
      for (const row of el.rows) {
        if (row.parentElement === el.tHead || !row.checkVisibility()) continue;
        words.push([...row.cells].map((cell,i)=>(labels[i] ? labels[i] + ': ' : '') + cell.innerText.trim()).join('. '));
        flush();
      }
      return;
    }
    const heading = /^h[1-6]$/.test(tag) ? el.textContent.trim() : undefined;
    const block = heading || /^(address|article|aside|blockquote|br|button|dd|div|dl|dt|fieldset|figcaption|figure|label|legend|li|main|ol|output|p|pre|section|summary|ul)$/.test(tag);
    if (block) flush();
    if (tag === 'details' && !el.open) { if (el.querySelector('summary')) visit(el.querySelector('summary')); }
    else for (const child of el.childNodes) visit(child);
    if (block) flush(heading);
  }
  for (const root of roots) { if (root) visit(root); flush(); }
  return passages;
}
