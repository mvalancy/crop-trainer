import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {basename} from 'node:path';
import {checkOutputPaths,writeNewJson} from './cli-output.mjs';
import {parsePly,MAX_PLY_BYTES} from './trainer/ply.js';
import {MAX_REFERENCE_BYTES} from './trainer/references.js';
import {runFieldTest} from './trainer/score-scan.js';

const usage = 'node score-scan.mjs model.json scan.ply new-report.json [--labels centers.csv] [--unit m|cm|mm] [--origin X,Y,GROUND_Z] [--grade-percent X,Y]';
const MAX_MODEL_BYTES = 1024*1024;

function options(args) {
  if (args.length < 3 || args.slice(0,3).some(path=>path.startsWith('--'))) throw Error(usage);
  const [model,scan,out,...rest] = args;
  const flags = new Map();
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i], value = rest[i+1];
    if (!['--labels','--unit','--origin','--grade-percent'].includes(name) || !value || value.startsWith('--') || flags.has(name))
      throw Error('Invalid or repeated option '+name+'\n'+usage);
    flags.set(name,value);
  }
  const unit=flags.get('--unit') ?? 'm';
  if (!['m','cm','mm'].includes(unit)) throw Error('Choose m, cm or mm for the scan units.');
  const origin = numericList(flags.get('--origin') ?? '0,0,0',3,'--origin X,Y,GROUND_Z');
  const alignment = {unit,origin};
  if (flags.has('--grade-percent')) alignment.gradePercent = numericList(flags.get('--grade-percent'),2,'--grade-percent X,Y');
  return {model,scan,out,labels:flags.get('--labels'),alignment};
}

function numericList(value,size,option) {
  const parts = value.split(',');
  if (parts.length !== size || parts.some(v=>!v.trim() || !Number.isFinite(Number(v)))) {
    throw Error('Supply '+size+' finite numbers for '+option+'.');
  }
  return parts.map(Number);
}

async function input(path,maxBytes) {
  const handle=await open(path,'r');
  try {
    const stat=await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw Error(basename(path)+' must be a regular file of at most '+(maxBytes/1024/1024)+' MiB.');
    const data=await handle.readFile();
    if (data.byteLength > maxBytes) throw Error('Input grew beyond the file size limit.');
    return {data,name:basename(path),sha256:createHash('sha256').update(data).digest('hex')};
  } finally {await handle.close();}
}

async function main(args) {
  if (args.length===1 && ['--help','-h'].includes(args[0])) {console.log(usage);return;}
  const opts=options(args);
  await checkOutputPaths([opts.out]);
  const [modelFile,scanFile,labelFile]=await Promise.all([
    input(opts.model,MAX_MODEL_BYTES), input(opts.scan,MAX_PLY_BYTES),
    opts.labels ? input(opts.labels,MAX_REFERENCE_BYTES) : null
  ]);
  let model;
  try {model=JSON.parse(modelFile.data.toString('utf8'));} catch {throw Error('The model must be a JSON file from Download model weights.');}
  const xyz=parsePly(scanFile.data);
  const labels=labelFile ? {text:labelFile.data.toString('utf8'),filename:labelFile.name} : null;
  const tileId=/^([0-9a-f]{16})\.ply$/i.exec(scanFile.name)?.[1].toLowerCase();
  const result=runFieldTest({model,xyz,alignment:opts.alignment,labels,tileId});
  const identity=file=>file ? {name:file.name,sha256:file.sha256} : null;
  const files={model:identity(modelFile),scan:identity(scanFile),labels:identity(labelFile)};
  await writeNewJson([[opts.out,{format:'crop-trainer-field-test-v1',files,...result}]]);
  console.log(result.pointCount+' scan points · '+result.pins.length+' model pins · '+result.baselinePins.length+' height-only pins'+(result.orchard?' · '+result.orchard.pins.length+' orchard-base pins':''));
  if (result.evaluation) {
    const show=score=>score.f1===null?'undefined':score.f1.toFixed(4);
    for (const [i,score] of result.evaluation.scores.entries()) {
      console.log(score.cm+' cm F1 · model '+show(score)+' · height only '+show(result.baselineEvaluation.scores[i])+(result.orchardEvaluation?' · orchard base '+show(result.orchardEvaluation.scores[i]):''));
    }
  } else console.log('Add surveyed centers with --labels to measure accuracy.');
  console.log('Wrote '+opts.out);
}

main(process.argv.slice(2)).catch(err=>{console.error(err.message);process.exitCode=1;});
