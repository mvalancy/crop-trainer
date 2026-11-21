import {makeRecipe} from '../models/data.js?v=board-placement1';
import {getSensor} from '../generator/sensors.js?v=option-fit1';
import {scanSession} from '../generator/scan-session.js?v=board-placement1';
import {encodePly} from './ply.js?v=export1';

// Each pair uses the first reserved planting from its study. The stored tile ID
// checks that recipe replay still regenerates exactly the advertised scan.
const durationPlot = {seed:40117063, weeds:false, tileId:'56b872a50fcac3ab'};
const weedPlot = {seed:51112017, weeds:true, tileId:'3b07cf65952362c6'};
const plots = new Map([
  ['tomato-40',durationPlot], ['tomato-640',durationPlot],
  ['tomato-weed-random',weedPlot], ['tomato-weed-hard',weedPlot]
]);
export async function tomatoExampleFiles(fit, signal) {
  const plot = plots.get(fit);
  if (!plot) throw Error('Choose a saved tomato fit.');
  const response = await fetch(new URL('./example/'+fit+'.json', import.meta.url), {signal});
  if (!response.ok) throw Error('Could not load the saved tomato weights. Try again.');
  const model = new File([await response.blob()], fit+'.json', {type:'application/json'});
  const recipe = makeRecipe(plot.seed,true,getSensor('os1-64'),'tomato',2,'seedling','healthy');
  Object.assign(recipe,{points:60000,weeds:plot.weeds,sticks:false,boards:false});
  if (plot === durationPlot) {
    for (const key of ['xy','z','density','gaps','stray','cluster']) recipe.scanNoise[key] = 0;
  } else {
    recipe.scanNoise = null;
  }
  signal.throwIfAborted();
  const session = scanSession(signal);
  try {
    const scan = await session.generate(recipe);
    const id = scan.labels.tile_id;
    if (id !== plot.tileId) throw Error('This planting no longer matches the saved example.');
    const ply = new File([encodePly(scan.xyz)],id+'.ply',{type:'application/octet-stream'});
    const labels = new File([JSON.stringify({...scan.labels,crop_returns_per_box:scan.plantReturns},null,2)],
      id+'.labels.json',{type:'application/json'});
    return {model,ply,labels};
  } finally {
    session.close();
  }
}

export function selectFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}
