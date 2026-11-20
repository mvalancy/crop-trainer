import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {cropProfile} from './trainer/crops.js';
import {buildDataset,validateModel,checkScoreThreshold} from './trainer/data.js';
import {trainCPU} from './trainer/model.js';
import {trainNetworkCPU,predictNetwork} from './trainer/neural.js';

const [command,output,configuration]=process.argv.slice(2);
if(command==='serve'){
 const allowed=new Set(['index.html','farm.js','farm.css','viewer.js','benchmark/index.html','benchmark/main.js','art/title.svg','trainer/index.html','trainer/main.js','trainer/data.js','trainer/field.js','trainer/model.js','trainer/neural.js','trainer/crops.js','trainer/sensors.js','README.md','AGENTS.md','LICENSE']);
 const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',md:'text/plain'};
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
 const defaults={crop:'lettuce',seed:27,trainFields:6,valFields:3,epochs:40,model:'neural',sensorMode:'mixed',validationSensorMode:undefined,minimumHeight:.035,threshold:.5};
 const config=configuration?JSON.parse(await readFile(configuration,'utf8')):{};
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Expected a JSON settings object.');
 for(const key of Object.keys(config))if(!Object.hasOwn(defaults,key))throw Error('Unknown setting '+key);
 const settings={...defaults,minimumHeight:cropProfile(config.crop).peakHeight,...config};
 const {model,epochs,threshold}=settings;
 checkScoreThreshold(threshold);
 if(!['neural','linear'].includes(model)||!Number.isInteger(epochs)||epochs<1||epochs>5000)throw Error('Use neural or linear with 1–5000 epochs.');
 const start=performance.now();
 const set=await buildDataset(settings);
 const generated=performance.now();
 const neural=model==='neural';
 const fit=await (neural?trainNetworkCPU:trainCPU)(set.X,set.Y,{dims:set.dims,epochs,lr:.25});
 const trained=performance.now();
 const validation=await validateModel(set,fit.weights,{threshold,predictScores:neural?predictNetwork:undefined});
 const finished=performance.now();
 const timings={generationMs:generated-start,trainingMs:trained-generated,validationMs:finished-trained,totalMs:finished-start};
 const report={schema:3,timings,settings,domain:'synthetic',backend:'CPU',trainer:neural?'crop-mlp-v1':'crop-peak-logistic-v1',...settings,learningRate:.25,stats:set.stats,recipeManifest:set.manifest,scaling:set.scaling,weights:[...fit.weights],loss:fit.loss,meanF1:validation.meanF1,scores:validation.scores,byGround:validation.byGround, tiles:validation.tiles};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log('Synthetic mean F1 '+report.meanF1.toFixed(4)+' · '+set.stats.valTiles+' validation scans · '+output);
}else{
 console.log('node run.mjs serve [port]\nnode run.mjs train new-report.json [settings.json]');
 process.exitCode=command?1:0;
}
