import {readFile} from 'node:fs/promises';
import {checkOutputPaths,writeNewJson} from './output.mjs';
import {forwardAsset,isPublicPath} from './site-files.mjs';
import {createServer} from 'node:http';
import {plantSettings} from '../trainer/generator/plant-version.js';
import {cropProfile} from '../trainer/generator/crops.js';
import {buildDataset,validateModel,checkScoreThreshold,validationFormSettings} from '../trainer/models/data.js';
import {MAX_SANDBOX_EPOCHS, trainerId, weightArtifact} from '../trainer/models/network.js';
import {trainNetworkCPU,predictNetwork} from '../trainer/models/neural.js';

const [command,output,...args]=process.argv.slice(2);
const trainUsage = 'node cli/run.mjs train new-report.json [settings.json] [--weights new-weights.json]';
const cliUsage = 'node cli/run.mjs serve [port]\n'+trainUsage+
  '\nnode cli/run.mjs preflight [--peak-averaging occupied|zero-filled]\n  Train on CPU and replay the held-out synthetic scans through the field CLI. Prints JSON.';
if(command==='serve'){
 const types={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',svg:'image/svg+xml',webp:'image/webp',md:'text/plain'};
 const port=Number(output||4173);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Choose a port from 1 to 65535.');
 const server=createServer(async(req,res)=>{
  try{
   let path=new URL(req.url,'http://localhost').pathname.slice(1);
   if(!path||path.endsWith('/'))path+='index.html';
   const forwarded=forwardAsset(path);
   if(!forwarded && !isPublicPath(path)){res.writeHead(404).end();return;}
   const data=forwarded ?? await readFile(new URL('../'+path,import.meta.url));
   res.writeHead(200,{'Content-Type':(types[path.split('.').at(-1)]||'text/plain')+'; charset=utf-8'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 server.listen(port,'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+port+'/'));
}else if(command==='preflight'){
 if(output !== undefined && (output!=='--peak-averaging' || args.length!==1 || !['occupied','zero-filled'].includes(args[0]))) {
  throw Error('Use node cli/run.mjs preflight with no arguments or with --peak-averaging occupied|zero-filled.');
 }
 const {preflight} = await import('./preflight.mjs');
 console.log(JSON.stringify(await preflight(args[0]),null,2));
}else if(command==='train'&&output){
 const configuration = args[0] && !args[0].startsWith('--') ? args.shift() : null;
 if (output.startsWith('--') || (args.length && (args.length !== 2 || args[0] !== '--weights' || !args[1] || args[1].startsWith('--')))) throw Error(trainUsage);
 const weightsPath = args[1];
 await checkOutputPaths(weightsPath ? [output,weightsPath] : [output]);
 const defaults={crop:'lettuce',plantArchitecture:1,plantForm:undefined,plantCondition:undefined,seed:27,trainFields:6,valFields:3,epochs:40,model:'neural',hiddenLayers:[4],activation:'tanh',optimizer:'sgd',batchSize:0,momentum:.9,learningRate:.25,initSeed:12345,sensorMode:'mixed',validationSensorMode:undefined,trainingRayBudget:0,validationRayBudget:0,minimumHeight:.035,threshold:.5,peakAveraging:undefined,validationPlantForm:undefined};
 const config=configuration?JSON.parse(await readFile(configuration,'utf8')):{};
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Expected a JSON settings object.');
 for(const key of Object.keys(config))if(!Object.hasOwn(defaults,key))throw Error('Unknown setting '+key);
 const settings={...defaults,minimumHeight:cropProfile(config.crop).peakHeight,...config};
 Object.assign(settings, plantSettings(settings));
 settings.validationPlantForm=validationFormSettings(settings).validationPlantForm;
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
 const report={schema:3,timings,samplePasses:fit.epochsCompleted*set.stats.samples,settings,domain:'synthetic',backend:'CPU',trainer:trainerId(settings),...settings,stats:set.stats,recipeManifest:set.manifest,scaling:set.scaling,weights:[...fit.weights],loss:fit.loss,lossEpochs:fit.lossEpochs,meanF1:validation.meanF1,scores:validation.scores,countError:validation.countError,byGround:validation.byGround, byField:validation.byField, tiles:validation.tiles};
 const files = [[output,report]];
 if (weightsPath) files.push([weightsPath,weightArtifact(report)]);
 await writeNewJson(files);
 if (weightsPath) console.log('Saved model weights to '+weightsPath);
 console.log('Synthetic mean F1 '+report.meanF1.toFixed(4)+' · '+set.stats.valTiles+' validation scans · '+output);
}else{
 console.log(cliUsage);
 process.exitCode=command && !['--help','-h'].includes(command)?1:0;
}
