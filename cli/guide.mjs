// Render trusted repository Markdown with the bundled MIT-licensed Marked parser.
// Both the static Pages artifact and the dependency-free local server use this path.
import {readFile, readdir} from 'node:fs/promises';
import {posix as path} from 'node:path';
import {marked} from './vendor/marked.mjs';
import {isPublicPath, markdownDirectories} from './site-files.mjs';

const root = new URL('../', import.meta.url);
const contents = 'docs/README.md';
const published = 'https://mvalancy.github.io/crop-trainer/';
const repository = 'https://github.com/mvalancy/crop-trainer/';
const lessons = ['README', 'models', 'learning', 'scoring', 'fieldwork'].map(name => 'docs/first-steps/' + name + '.md');

function escape(value) {
  return value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function pagePath(file) {
  return file === contents ? 'guide/index.html' : 'guide/' + file.replace(/\.md$/, '.html');
}

function group(file) {
  if (lessons.includes(file)) return 'First steps';
  if (file.startsWith('trainer/plants/')) return 'Growing guides';
  if (file.startsWith('docs/')) return 'Field studies and guides';
  return 'Project handbook';
}

export async function loadGuide(files) {
  if (!files) {
    const lists = await Promise.all(markdownDirectories.map(async dir =>
      (await readdir(new URL(dir + '/', root))).map(name => path.join(dir, name))));
    files = lists.flat();
  }
  const pages = new Map();
  for (const file of [...files].filter(file => file.endsWith('.md') && isPublicPath(file)).sort()) {
    const source = await readFile(new URL(file, root), 'utf8');
    const title = source.match(/^# (.+)$/m)?.[1] ?? file;
    pages.set(pagePath(file), {file, title, source});
  }
  return pages;
}

export function renderGuide(route, pages) {
  const {file, title, source} = pages.get(route);
  const dir = path.dirname(route);
  const home = path.relative(dir, '.') + '/';
  const href = file => path.relative(dir, pagePath(file));
  function resolveLink(raw) {
    if (raw.startsWith('#')) return raw;
    const url = new URL(raw.replaceAll('&amp;', '&'), published + file);
    if (url.href.startsWith(repository + 'blob/main/') && url.pathname.endsWith('.md')) {
      return href(url.pathname.split('/blob/main/')[1]) + url.hash;
    }
    if (!url.href.startsWith(published)) return raw;
    const local = decodeURIComponent(url.pathname.slice(new URL(published).pathname.length));
    const suffix = url.search + url.hash;
    if (pages.has(pagePath(local)) && local.endsWith('.md')) return href(local) + suffix;
    if (local && !local.endsWith('/') && !isPublicPath(local)) {
      return repository + 'blob/main/' + local + suffix;
    }
    return home + local + suffix;
  }
  const used = new Set();
  const html = marked.parse(source, {gfm:true})
    .replace(/(<(?:img|a)\s[^>]*?\b(?:href|src)=")([^"]+)"/g,
      (_, prefix, url) => prefix + escape(resolveLink(url).replaceAll('&amp;', '&')) + '"')
    .replace(/<h([1-6])>(.*?)<\/h\1>/gs, (_, level, text) => {
      const base = text.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '').replaceAll(' ', '-');
      let id = base;
      for (let i = 1; used.has(id); i++) id = base + '-' + i;
      used.add(id);
      return '<h' + level + ' id="' + escape(id) + '">' + text + '</h' + level + '>';
    })
    .replaceAll('<table>', '<div class="guideTable" role="region" aria-label="Data table" tabindex="0"><table>')
    .replaceAll('</table>', '</table></div>');
  const chapters = [...pages.values()];
  const groups = ['First steps', 'Growing guides', 'Field studies and guides', 'Project handbook'];
  const shelf = groups.map(label => {
    const list = chapters.filter(p => p.file !== contents && group(p.file) === label);
    list.sort((a,b) => label === 'First steps' ? lessons.indexOf(a.file) - lessons.indexOf(b.file) : a.title.localeCompare(b.title, 'en'));
    const links = list.map(p => '<li><a href="' + href(p.file) + '"' +
      (p.file === file ? ' aria-current="page"' : '') + '>' + escape(p.title) + '</a></li>').join('');
    return '<details' + ((file === contents ? label === 'First steps' : label === group(file)) ? ' open' : '') +
      '><summary>' + label + '</summary><ul>' + links + '</ul></details>';
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · Crop Trainer</title><link rel="icon" href="${home}art/crop-mark.svg">
<script src="${home}app/theme.js"></script><script type="module" src="${home}app/reader.js"></script><link rel="stylesheet" href="${home}app/farm.css"><link rel="stylesheet" href="${home}app/reader.css"><link rel="stylesheet" href="${home}app/theme.css"></head>
<body><a class="skip" href="#chapter">Skip to chapter</a>
<header class="siteBar"><div class="barInner"><a class="brand" href="${home}"><img class="mark" src="${home}art/crop-mark.svg" width="32" height="32" alt="">Crop Trainer</a>
<nav aria-label="Main navigation"><a href="${home}#field">Field generator</a><a href="${home}trainer/">Training shed</a><a href="${home}benchmark/">Benchmark</a><a href="${href(contents)}" aria-current="page">Docs</a></nav>
<span class="sourceLinks"><a class="repoLink" href="${repository}">GitHub</a><a class="wipLink" href="https://mvalancy.github.io/crop-trainer/next/studio/" aria-label="WIP: try the development workspace" title="Try the development workspace">WIP</a></span></div></header>
<main class="guideLayout"><aside class="guideShelf"><a class="shelfTitle" href="${href(contents)}">Field guide</a>
<details class="chapterMenu" open><summary>Browse chapters</summary><nav aria-label="Chapters">${shelf}</nav></details></aside><article class="guideChapter" id="chapter" tabindex="-1">${html}</article></main></body></html>\n`;
}
