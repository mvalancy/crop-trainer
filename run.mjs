import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {cropProfile} from './trainer/crops.js';
import {buildDataset,validateModel,checkScoreThreshold} from './trainer/data.js';
import {MAX_SANDBOX_EPOCHS, trainerId} from './trainer/network.js';
import {trainNetworkCPU,predictNetwork} from './trainer/neural.js';

const [command,output,configuration]=process.argv.slice(2);
if(command==='serve'){
 const allowed=new Set(['index.html','farm.js','farm.css','viewer.js','benchmark/index.html','benchmark/main.js','benchmark/density.js','art/title.svg','art/lettuce-study.webp','trainer/index.html','trainer/main.js','trainer/data.js','trainer/field.js','trainer/model.js','trainer/neural.js','trainer/network.js','trainer/fit-worker.js','trainer/sandbox.js','trainer/crops.js','trainer/sensors.js','README.md','AGENTS.md','LICENSE']);
 for(const page of ['README','training','scanners','field-inspection','benchmarks','research','local-setup']) allowed.add('docs/'+page+'.md');
 for(const figure of ['scan-learn-find','paired-field']) allowed.add('art/'+figure+'.svg');
 const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webp:'image/webp',md:'text/plain'};
 const port=Number(output||4173);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Choose a port from 1 to 65535.');
 const server=createServer(async(req,res)=>{
  try{
   let path=new URL(req.url,'http://localhost').pathname.slice(1);
   if(!path||path.endsWith('/'))path+='index.html';
   if(!allowed.has(path)){res.writeHead(404).end();return;}
   const data=await readFile(new URL('./'+path,import.meta.url));
   res.writeHead(200,{'Content-Type':(types[path.split('.').at(-1)]||'text/plain')+'; charset=utf-8'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 server.listen(port,'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+port+'/'));
}else if(command==='train'&&output){
 const defaults={crop:'lettuce',seed:27,trainFields:6,valFields:3,epochs:40,model:'neural',hiddenLayers:[4],activation:'tanh',optimizer:'sgd',batchSize:0,momentum:.9,learningRate:.25,initSeed:12345,sensorMode:'mixed',validationSensorMode:undefined,trainingRayBudget:0,validationRayBudget:0,minimumHeight:.035,threshold:.5};
 const config=configuration?JSON.parse(await readFile(configuration,'utf8')):{};
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Expected a JSON settings object.');
 for(const key of Object.keys(config))if(!Object.hasOwn(defaults,key))throw Error('Unknown setting '+key);
 const settings={...defaults,minimumHeight:cropProfile(config.crop).peakHeight,...config};
 if(settings.model==='linear')settings.hiddenLayers=[];
 const {model,epochs,threshold}=settings;
 checkScoreThreshold(threshold);
 if(!['neural','linear'].includes(model)||!Number.isInteger(epochs)||epochs<1||epochs>MAX_SANDBOX_EPOCHS || (model==='neural' && !settings.hiddenLayers?.length))throw Error('Choose a supported detector shape and epoch count.');
 const start=performance.now();
 const set=await buildDataset(settings);
 const generated=performance.now();
 const fit=await trainNetworkCPU(set.X,set.Y,{...settings,dims:set.dims,lr:settings.learningRate});
 const trained=performance.now();
 const validation=await validateModel(set,fit.weights,{threshold,predictScores:(x,w,d)=>predictNetwork(x,w,d,settings.hiddenLayers,settings.activation)});
 const finished=performance.now();
 const timings={generationMs:generated-start,trainingMs:trained-generated,validationMs:finished-trained,totalMs:finished-start};
 const report={schema:3,timings,settings,domain:'synthetic',backend:'CPU',trainer:trainerId(settings),...settings,stats:set.stats,recipeManifest:set.manifest,scaling:set.scaling,weights:[...fit.weights],loss:fit.loss,lossEpochs:fit.lossEpochs,meanF1:validation.meanF1,scores:validation.scores,countError:validation.countError,byGround:validation.byGround, byField:validation.byField, tiles:validation.tiles};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log('Synthetic mean F1 '+report.meanF1.toFixed(4)+' · '+set.stats.valTiles+' validation scans · '+output);
}else{
 console.log('node run.mjs serve [port]\nnode run.mjs train new-report.json [settings.json]');
 process.exitCode=command?1:0;
}
