import {getSensor} from '../../trainer/generator/sensors.js';
import {makeRecipe} from '../../trainer/models/data.js';

export const tomatoTerrainTraining = {
  crop:'tomato', plantArchitecture:2, plantForm:'mixed', plantCondition:'healthy',
  trainFields:6, valFields:1, sensorMode:'reference', trainingRayBudget:60000, validationRayBudget:60000,
  minimumHeight:.035, peakAveraging:'zero-filled', threshold:.5, hiddenLayers:[4], activation:'tanh',
  epochs:40, batchSize:0, optimizer:'sgd', lr:.25, initSeed:12345
};

export function tomatoTestRecipe(seed, layout, plantForm, ground, points=60000) {
  return {...makeRecipe(seed,ground,getSensor(layout),'tomato',2,plantForm,'healthy'),
    points,weeds:false,sticks:false,boards:false,scanNoise:null};
}
