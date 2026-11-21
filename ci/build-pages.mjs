// Stage only tracked browser assets and public docs, under any Pages subpath.
import {execFileSync} from 'node:child_process';
import {copyFile, lstat, mkdir, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {forwardAsset, isPublicPath, movedAssets} from '../cli/site-files.mjs';

if (process.argv.length !== 3) throw Error('Usage: node ci/build-pages.mjs EMPTY_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2]);
await mkdir(out, {recursive:true});
if ((await readdir(out)).length) throw Error('Choose an empty output directory.');
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'}).split('\0');
const files = new Set(tracked.filter(isPublicPath));
for (const path of files) {
  const src = join(root, path), dest = join(out, path);
  if (!(await lstat(src)).isFile()) throw Error('Expected a regular site file: ' + path);
  await mkdir(dirname(dest), {recursive:true});
  await copyFile(src, dest);
}
for (const [path, target] of movedAssets) {
  if (!files.has(target) || files.has(path)) throw Error('Invalid compatibility path: ' + path);
  await writeFile(join(out, path), forwardAsset(path));
}
console.log(`Staged ${files.size} public files and ${movedAssets.size} compatibility paths.`);
