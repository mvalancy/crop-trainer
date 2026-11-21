// The local server and Pages build expose the same static app and reading material.
const entryFiles = new Set(['studio/index.html', 'index.html', 'README.md', 'AGENTS.md', 'LICENSE', '.nojekyll', 'art/crop-mark-32.png', 'art/crop-touch.png']);
// Only these generated tutorial files are included in public builds.
for (const name of ['c0545a3786c57a89.ply', 'weights.json', 'centers.csv', 'labels.json', 'settings.json', 'tomato-40.json', 'tomato-640.json', 'tomato-weed-random.json', 'tomato-weed-hard.json', 'README.md']) {
  entryFiles.add('trainer/field-test/example/' + name);
}
const publicDirectories = new Map([
  ['app', ['js', 'css', 'md']],
  ['art', ['svg', 'webp', 'md']], ['art/audio', ['mp3']], ['art/plants', ['svg', 'md']],
  ['benchmark', ['html', 'js', 'css', 'md']], ['benchmark/studies', ['mjs', 'md']],
  ['docs', ['md']], ['docs/first-steps', ['md']],
  ['trainer', ['html', 'js', 'md']], ['trainer/plants', ['js', 'css', 'md']],
  ['trainer/ui', ['js', 'css', 'md']],
  ...['generator', 'models', 'field-test', 'study'].map(name => ['trainer/' + name, ['js', 'md']])
]);

export const markdownDirectories = ['.', 'ci', 'cli', 'test', 'trainer/field-test/example', ...publicDirectories.keys()];

export function isPublicPath(path) {
  if (entryFiles.has(path) || ['ci/README.md','cli/README.md','test/README.md'].includes(path)) return true;
  const slash = path.lastIndexOf('/');
  const filename = path.slice(slash + 1);
  if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9]*$/i.test(filename)) return false;
  return publicDirectories.get(path.slice(0, slash))?.includes(filename.split('.').pop()) ?? false;
}

// Browsers can retain yesterday's HTML or worker imports during a rollout.
// Serve tiny forwarders at the old asset URLs without keeping source files there.
export const movedAssets = new Map();
function moved(directory, destination, filenames) {
  for (const filename of filenames.split(' ')) movedAssets.set(directory + filename, destination + '/' + filename);
}
moved('', 'app', 'farm.js farm.css viewer.js first-steps.js field-lesson.js');
moved('trainer/', 'trainer/generator', 'crops.js field.js generate-worker.js growing-systems.js plant-version.js scan-session.js sensors.js');
moved('trainer/', 'trainer/models', 'data.js fit-worker.js model.js network.js neural.js orchard.js');
moved('trainer/', 'trainer/field-test', 'field-test-ui.js field-test-worker.js inference.js ply.js references.js score-scan.js');
moved('trainer/', 'trainer/study', 'scan-study.js scan-study-map.js scan-study-ui.js scan-study-worker.js');
moved('trainer/', 'trainer/ui', 'live-scene.js sandbox.js');
moved('benchmark/', 'benchmark/studies', 'canopy-size.mjs ground-reference.mjs orchard-bases.mjs orchard-branch-caliber.mjs orchard-damage.mjs orchard-visibility.mjs paired-evidence.mjs plant-forms.mjs prepare-vineyard.mjs seedling-density.mjs seedling-peak-fit.mjs seedling-peaks.mjs seedling-stages.mjs');

export function forwardAsset(path) {
  const target = movedAssets.get(path);
  if (!target) return;
  const relative = './' + target.slice(path.lastIndexOf('/') + 1);
  return path.endsWith('.css') ? `@import url("${relative}");\n` : `export * from "${relative}";\n`;
}
