import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {runFieldTest} from '../trainer/field-test/score-scan.js';
import {encodePly} from '../trainer/field-test/ply.js';

const invoke = promisify(execFile);
const entry = fileURLToPath(new URL('../cli/score-scan.mjs',import.meta.url));
const model = {
  format:'crop-trainer-weights-v1',featureSchema:'crop-peak-13-v1',crop:'lettuce',
  inputs:13,output:'sigmoid',threshold:.9,minimumHeight:.035,pinSeparation:.125,
  weights:Array(14).fill(0),activation:'tanh',hiddenLayers:[],
  scaling:{means:Array(13).fill(0),std:Array(13).fill(1)}
};
const xyz = [5200,2300,68,5800,2700,43];
const ply = 'ply\nformat ascii 1.0\nelement vertex 2\nproperty double x\nproperty double y\nproperty double z\nend_header\n5200 2300 68\n5800 2700 43\n';
const centers = 'x,y\n5200,2300\n5800,2700\n';
const alignment = {unit:'cm',origin:[5000,2000,18]};

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(),'crop-trainer-field-test-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  await Promise.all([
    writeFile(join(cwd,'weights.json'),JSON.stringify(model)),
    writeFile(join(cwd,'plot.ply'),ply),
    writeFile(join(cwd,'survey.csv'),centers)
  ]);
  const run = (out,...flags)=>invoke(process.execPath,[entry,'weights.json','plot.ply',out,
    '--unit','cm','--origin','5000,2000,18',...flags],{cwd});
  return {cwd,run};
}

test('CLI and browser core produce the same paired field evaluation and identify the exact inputs', async t=>{
  const {cwd,run} = await fixture(t);
  await run('report.json','--labels','survey.csv');
  const {format,files,...result} = JSON.parse(await readFile(join(cwd,'report.json'),'utf8'));
  assert.equal(format,'crop-trainer-field-test-v1');
  assert.deepEqual(result,runFieldTest({model,xyz,alignment,labels:{filename:'survey.csv',text:centers}}));
  assert.equal(result.proposalCount,2);
  assert.deepEqual(result.pins,[]);
  assert.equal(result.references.length,2);
  assert.equal(result.evaluation.scores[2].fn,2);
  assert.equal(result.baselineEvaluation.scores[2].tp,2);
  for (const [key,name] of [['model','weights.json'],['scan','plot.ply'],['labels','survey.csv']]) {
    const hash = createHash('sha256').update(await readFile(join(cwd,name))).digest('hex');
    assert.deepEqual(files[key],{name,sha256:hash});
  }
});

test('unlabeled scans preserve predictions, surveyed empty plots record false positives', async t=>{
  const {cwd,run} = await fixture(t);
  await run('blind.json');
  const blind = JSON.parse(await readFile(join(cwd,'blind.json')));
  assert.equal(blind.references,null);
  assert.equal(blind.files.labels,null);
  assert.equal(blind.evaluation,null);
  assert.equal(blind.baselineEvaluation,null);
  await writeFile(join(cwd,'empty.csv'),'x,y\n');
  await run('empty.json','--labels','empty.csv');
  const empty = JSON.parse(await readFile(join(cwd,'empty.json')));
  assert.deepEqual(empty.references,[]);
  assert.deepEqual(empty.pins,blind.pins);
  assert.deepEqual(empty.baselinePins,blind.baselinePins);
  assert.equal(empty.baselineEvaluation.scores[2].fp,2);
  assert.equal(empty.evaluation.scores[2].f1,null);
});

test('CLI cutoff trials preserve input hashes and reproduce browser scoring',async t=>{
  const {cwd,run}=await fixture(t);
  await run('saved.json','--labels','survey.csv');
  const saved=JSON.parse(await readFile(join(cwd,'saved.json')));
  const {stdout}=await run('trial.json','--labels','survey.csv','--score-cutoff','0.20');
  assert.match(stdout,/Trial score cutoff 0.2 · saved 0.9/);
  const {format,files,...trial}=JSON.parse(await readFile(join(cwd,'trial.json')));
  assert.equal(format,saved.format);
  assert.deepEqual(files,saved.files);
  assert.deepEqual(trial,runFieldTest({model,xyz,alignment,labels:{filename:'survey.csv',text:centers},thresholdOverride:.2}));
  assert.equal(trial.evaluation.scores.at(-1).tp,2);
  assert.equal(saved.evaluation.scores.at(-1).tp,0);
  assert.ok(!Object.hasOwn(saved.detector,'savedThreshold'));
  for(const invalid of ['1.1','x',' ']) await assert.rejects(run('bad.json','--score-cutoff',invalid),/cutoff/);
  await assert.rejects(run('bad.json','--score-cutoff','.2','--score-cutoff','.5'),/repeated/);
  assert.ok(!(await readdir(cwd)).includes('bad.json'));
});

test('simultaneous runs keep exactly one complete report, and invalid inputs never produce reports', async t=>{
  const {cwd,run} = await fixture(t);
  const attempts = await Promise.allSettled([run('race.json'),run('race.json')]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
  assert.match(attempts.find(a=>a.status==='rejected').reason.stderr,/already exists/);
  assert.equal(JSON.parse(await readFile(join(cwd,'race.json'))).pointCount,2);
  await writeFile(join(cwd,'invalid.csv'),'x,y\n5,6');
  await assert.rejects(run('bad.json','--labels','invalid.csv'),/outside the 10 m plot/);
  await assert.rejects(run('bad.json','--unit','m'),/repeated option/);
  await assert.rejects(run('bad.json','--typo','yes'),/option/);
  assert.deepEqual((await readdir(cwd)).sort(),['invalid.csv','plot.ply','race.json','survey.csv','weights.json']);
});

test('CLI trains and saves a portable model that reproduces its held-out validation counts', async t=>{
  const {field} = await import('../trainer/generator/field.js');
  const train = fileURLToPath(new URL('../cli/run.mjs',import.meta.url));
  const cwd = await mkdtemp(join(tmpdir(),'crop-trainer-weights-test-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const run = (...args)=>invoke(process.execPath,[train,'train',...args],{cwd});
  const settings = {crop:'tomato',seed:97,epochs:2,trainFields:2,valFields:1,
    hiddenLayers:[5,3],activation:'relu',sensorMode:'reference'};
  await writeFile(join(cwd,'settings.json'),JSON.stringify(settings));
  await run('harvest.json','settings.json','--weights','weights.json');
  const report = JSON.parse(await readFile(join(cwd,'harvest.json')));
  const weights = JSON.parse(await readFile(join(cwd,'weights.json')));
  assert.equal(weights.format,'crop-trainer-weights-v1');
  assert.equal(weights.epochs,2);
  assert.equal(report.samplePasses,2*report.stats.samples);
  assert.deepEqual(weights.scaling,report.scaling);
  assert.deepEqual(weights.weights,report.weights);
  assert.equal(weights.crop,'tomato');
  assert.equal(weights.pinSeparation,.22);
  const tile = report.recipeManifest.find(t=>t.split==='validation');
  const scan = field(tile.recipe);
  const id = scan.labels.tile_id;
  await writeFile(join(cwd,id+'.ply'),encodePly(scan.xyz));
  await writeFile(join(cwd,id+'.labels.json'),JSON.stringify(scan.labels));
  await invoke(process.execPath,[entry,'weights.json',id+'.ply','field.json','--labels',id+'.labels.json'],{cwd});
  const replay = JSON.parse(await readFile(join(cwd,'field.json')));
  const expected = report.tiles.find(t=>t.tile_id===id).byTolerance;
  assert.deepEqual(replay.evaluation.scores.map(({cm,tp,fp,fn})=>({cm,tp,fp,fn})),expected);

  await assert.rejects(run('untouched.json','--weights','weights.json'),/already exists/);
  await assert.rejects(run('harvest.json','--weights','untouched.json'),/already exists/);
  await assert.rejects(run('same.json','--weights','same.json'),/different filenames/);
  await assert.rejects(run('untouched.json','--weights'),/run.mjs train/);
  assert(!(await readdir(cwd)).some(name=>['untouched.json','same.json'].includes(name)));
});

test('a known two-axis grade recovers the level control in metres and centimetres', async t=>{
  const {cwd,run} = await fixture(t);
  await writeFile(join(cwd,'weights.json'),JSON.stringify({...model,threshold:.45}));
  await run('level.json','--labels','survey.csv');
  const level = JSON.parse(await readFile(join(cwd,'level.json')));
  assert.equal(level.pins.length,2);

  // At local (2,3) the ground drops 4 cm; at (8,7) it drops 26 cm.
  const sloped = ply.replace('5200 2300 68','5200 2300 64').replace('5800 2700 43','5800 2700 17');
  await writeFile(join(cwd,'plot.ply'),sloped);
  await run('uncorrected.json');
  assert.equal(JSON.parse(await readFile(join(cwd,'uncorrected.json'))).proposalCount,1);
  await run('graded.json','--labels','survey.csv','--grade-percent','-5,2');
  const graded = JSON.parse(await readFile(join(cwd,'graded.json')));
  assert.deepEqual(graded.frame.gradePercent,[-5,2]);
  for (const key of ['pins','baselinePins','evaluation','baselineEvaluation']) assert.deepEqual(graded[key],level[key]);

  await writeFile(join(cwd,'metres.ply'),sloped.replace('5200 2300 64','52 23 0.64').replace('5800 2700 17','58 27 0.17'));
  await invoke(process.execPath,[entry,'weights.json','metres.ply','metres.json','--unit','m','--origin','50,20,0.18',
    '--grade-percent','-5,2'],{cwd});
  const metres = JSON.parse(await readFile(join(cwd,'metres.json')));
  assert.deepEqual(metres.frame.gradePercent,graded.frame.gradePercent);
  const local = pins=>pins.map(({x,y,...pin})=>pin);
  assert.deepEqual(local(metres.pins),local(graded.pins));
  assert.deepEqual(local(metres.baselinePins),local(graded.baselinePins));
  for (const value of ['5','5,','5,NaN','1,2,3']) {
    await assert.rejects(run('invalid.json','--grade-percent',value),/finite numbers for --grade-percent/);
  }
});

test('preflight replays both soil variants with exported weights and leaves the caller’s directory empty', async t=>{
  const cwd = await mkdtemp(join(tmpdir(),'crop-trainer-preflight-test-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const cli = fileURLToPath(new URL('../cli/run.mjs',import.meta.url));
  const {stdout} = await invoke(process.execPath,[cli,'preflight'],{cwd});
  const result = JSON.parse(stdout);
  assert.equal(result.passed,true);
  assert.equal(result.backend,'CPU');
  assert.equal(result.platform,process.platform);
  assert.equal(result.architecture,process.arch);
  assert.equal(result.tiles.length,6);
  assert.equal(new Set(result.tiles.map(tile=>tile.tile)).size,6);
  const plantings = Map.groupBy(result.tiles,tile=>tile.seed);
  assert.equal(plantings.size,3);
  for (const pair of plantings.values()) {
    assert.deepEqual(pair.map(tile=>tile.ground).sort(),[false,true]);
  }
  for (const tile of result.tiles) {
    assert.deepEqual(tile.scores.map(s=>s.cm),[7.5,10,15]);
    for (const score of tile.scores) assert.equal(score.tp+score.fn,tile.plants);
    for (const score of tile.baselineScores) assert.equal(score.tp+score.fp,tile.baselinePins);
  }
  await assert.rejects(invoke(process.execPath,[cli,'preflight','unexpected.json'],{cwd}),/no arguments/);
  assert.deepEqual(await readdir(cwd),[]);
});
