import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const figures = /^\[?!\[([^\]\n]+)\]\(([^)\n]+\.svg)\)/gm;

test('Markdown opens with a local animated figure and illustrates each section', t => {
  // The source ZIP has no Git index. Release checks run in a checkout.
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z', '*.md'], {cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe']});
  } catch (error) {
    if (error.code === 'ENOENT' || error.stderr?.includes('not a git repository')) {
      return t.skip('Requires the repository inventory');
    }
    throw error;
  }
  const assets = new Set();
  for (const file of files.split('\0').filter(Boolean)) {
    const source = readFileSync(resolve(root,file), 'utf8')
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart()
      .replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
    const [opening, ...sections] = source.split(/(?=^#{2,6} )/m);
    assert.equal([...opening.matchAll(figures)][0]?.index, 0, file + ' needs an opening illustration');
    for (const section of sections) {
      assert.ok([...section.matchAll(figures)].length, file + ' needs a figure for ' + section.split('\n')[0]);
    }
    for (const [, alt, path] of source.matchAll(figures)) {
      assert.ok(alt.trim(), file + ' needs image alt text');
      assets.add(resolve(root, dirname(file), path));
    }
  }
  for (const file of assets) {
    const svg = readFileSync(file, 'utf8');
    for (const pattern of [/<title[ >]/, /<desc[ >]/, /@keyframes\s/, /prefers-reduced-motion/]) {
      assert.match(svg, pattern, file);
    }
  }
});
