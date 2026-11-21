import {plantSettings} from '../generator/plant-version.js';
import {cropProfile} from '../generator/crops.js?v=systems1';
import {checkFeatureMode} from './terrain-features.js?v=terrain1';

// Each layer stores output neurons in order, with incoming weights followed by bias.
export const MAX_SANDBOX_EPOCHS = 100_000_000;
export function networkShape(dims, hiddenLayers = [4], activation = 'tanh') {
  if (!Number.isInteger(dims) || dims < 1 || dims > 64 ||
      !Array.isArray(hiddenLayers) || hiddenLayers.length > 4 ||
      hiddenLayers.some(n => !Number.isInteger(n) || n < 1 || n > 32) ||
      !['tanh', 'relu'].includes(activation)) throw Error('Use up to four hidden layers of 1–32 units and a supported activation.');
  let inputs = dims, count = 0, units = 0;
  const layers = [...hiddenLayers, 1].map(width => {
    const layer = {inputs, width, weight:count, node:units};
    count += width * (inputs + 1);
    units += width;
    inputs = width;
    return layer;
  });
  return {dims, layers, count, units, activation};
}

export function initializeFit(x, y, options) {
  const {dims, hiddenLayers, activation, epochs = 24, lr = .25, optimizer = 'sgd',
    momentum = .9, initSeed = 12345, timeLimitMs = 0, batchSize = 0} = options;
  const shape = networkShape(dims, hiddenLayers, activation);
  if (!(x instanceof Float32Array) || !(y instanceof Float32Array) || !y.length || x.length !== dims*y.length ||
      !Number.isInteger(epochs) || epochs < 1 || epochs > MAX_SANDBOX_EPOCHS ||
      ![0,32,128,512].includes(batchSize) || !Number.isFinite(timeLimitMs) || timeLimitMs < 0 || timeLimitMs > 86400000 ||
      !Number.isFinite(lr) || lr <= 0 || lr > 2 || !['sgd','momentum'].includes(optimizer) ||
      !Number.isFinite(momentum) || momentum < 0 || momentum >= 1 ||
      !Number.isInteger(initSeed) || initSeed < 0 || initSeed > 0xffffffff) throw Error('Invalid training data or fit settings.');
  const weights = new Float32Array(shape.count);
  let seed = initSeed;
  if (options.initialWeights !== undefined) {
    const supplied = options.initialWeights;
    if (!(supplied instanceof Float32Array) || supplied.length !== shape.count || !supplied.every(Number.isFinite)) {
      throw Error('Initial weights must be a finite Float32Array matching the network shape.');
    }
    weights.set(supplied);
  } else if (shape.layers.length > 1) {
    for (const layer of shape.layers) {
      const end = layer.weight + layer.width * (layer.inputs + 1);
      for (let k = layer.weight; k < Math.min(end, weights.length - 1); k++) {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
        // The original four-unit starter used input dimension scaling throughout.
        const fan = shape.layers.length === 2 && shape.layers[0].width === 4 ? dims : layer.inputs;
        weights[k] = (seed / 2**32 - .5) * 2 / Math.sqrt(fan);
      }
    }
  }
  return {shape, weights, lr, epochs, timeLimitMs, batchSize:Math.min(batchSize || y.length,y.length), decay:optimizer === 'momentum' ? momentum : 0};
}

export function forward(x, offset, weights, shape, values) {
  let logit = 0, previous = x, start = offset;
  for (const layer of shape.layers) {
    for (let j = 0; j < layer.width; j++) {
      const base = layer.weight + j*(layer.inputs + 1);
      logit = weights[base + layer.inputs];
      for (let k = 0; k < layer.inputs; k++) logit += weights[base+k]*previous[start+k];
      values[layer.node+j] = layer.node === shape.units-1 ? 1/(1+Math.exp(-logit))
        : shape.activation === 'relu' ? Math.max(0,logit) : Math.tanh(logit);
    }
    previous = values;
    start = layer.node;
  }
  return logit;
}

export function predictNetwork(x, weights, dims, hiddenLayers = [4], activation = 'tanh') {
  const shape = networkShape(dims,hiddenLayers,activation);
  if (weights.length !== shape.count || x.length % dims) throw Error('Weights or feature dimensions do not match this network.');
  const values = new Float64Array(shape.units);
  return Float32Array.from({length:x.length/dims}, (_,i) => {
    forward(x,i*dims,weights,shape,values);
    return values[shape.units-1];
  });
}

// Retain exact short histories and thin longer ones at evenly spaced epochs.
export function trackFit(plan, {onEpoch, shouldFinish}, backend) {
  let loss = [], lossEpochs = [], stride = 1;
  const start = performance.now();
  return {
    record(epoch, value) {
      if (!Number.isFinite(value)) throw Error('Loss became nonfinite. Try a smaller learning rate.');
      const elapsedMs = performance.now() - start;
      const done = (plan.timeLimitMs ? elapsedMs >= plan.timeLimitMs : epoch >= plan.epochs) || !!shouldFinish?.();
      if (loss.length >= 8192) {
        stride *= 2;
        loss = loss.filter((_,i) => (lossEpochs[i]-1) % stride === 0);
        lossEpochs = lossEpochs.filter(e => (e-1) % stride === 0);
      }
      if ((epoch-1) % stride === 0 || done) { loss.push(value); lossEpochs.push(epoch); }
      onEpoch?.({epoch,loss:value,elapsedMs,done,backend});
      return done;
    },
    result() { return {loss, lossEpochs, epochsCompleted:lossEpochs.at(-1)}; }
  };
}

export function trainerId({hiddenLayers,activation}) {
  if (!hiddenLayers.length) return 'crop-peak-logistic-v1';
  return hiddenLayers.length === 1 && hiddenLayers[0] === 4 && activation === 'tanh' ? 'crop-mlp-v1' : 'crop-dense-v1';
}

export const featureNames = ['Smoothed peak height','Center cell height','Mean inner height','Mean middle height',
  'Mean outer height','Peak above outer mean','High cells in middle ring','High cells in outer ring',
  'Occupied inner cells','Occupied outer cells','Log return count','Shape asymmetry','Peak above background'];

const groundFeatureNames = [...featureNames];
groundFeatureNames[1] = 'Peak above local ground';
groundFeatureNames[12] = 'Surrounding height spread';

export function featureNamesFor(featureMode) {
  return checkFeatureMode(featureMode) === 'local-ground' ? groundFeatureNames : featureNames;
}

// Each ID fixes both the candidate rule and the meaning of all 13 columns.
const peakSchemas = {
  'crop-peak-13-v1': {peakAveraging:'zero-filled', featureMode:'absolute'},
  'crop-peak-13-occupied-v1': {peakAveraging:'occupied', featureMode:'absolute'},
  'crop-peak-13-local-ground-v1': {peakAveraging:'zero-filled', featureMode:'local-ground'},
  'crop-peak-13-occupied-local-ground-v1': {peakAveraging:'occupied', featureMode:'local-ground'}
};

export function savedFeatureSettings(model) {
  const id=model?.featureSchema;
  if (typeof id !== 'string' || !Object.hasOwn(peakSchemas,id)) {
    throw Error('Unsupported saved peak feature schema. Use weights exported by a compatible Crop Trainer.');
  }
  const {peakAveraging,featureMode}=peakSchemas[id];
  if (model.peakAveraging !== undefined && model.peakAveraging !== peakAveraging) {
    throw Error('The saved peak averaging rule disagrees with its feature schema.');
  }
  if (model.featureMode !== undefined && model.featureMode !== featureMode) {
    throw Error('The saved feature mode disagrees with its feature schema.');
  }
  return {peakAveraging,featureMode};
}

export function savedPeakAveraging(model) {
  return savedFeatureSettings(model).peakAveraging;
}

// Both training entry points export the same inference metadata for a completed fit.
export function weightArtifact({settings,scaling,weights,trainer,epochs,stats}) {
  const {peakAveraging='zero-filled'} = settings;
  const featureMode=checkFeatureMode(settings.featureMode);
  const featureSchema=Object.keys(peakSchemas).find(id=>
    peakSchemas[id].peakAveraging===peakAveraging && peakSchemas[id].featureMode===featureMode);
  if (!featureSchema) {
    throw Error('Unsupported peak averaging rule for weight export.');
  }
  if (stats && peakAveraging !== (stats.peakAveraging === undefined ? 'zero-filled' : stats.peakAveraging)) {
    throw Error('The requested peak averaging rule differs from the fitted dataset.');
  }
  if (stats && featureMode !== checkFeatureMode(stats.featureMode)) {
    throw Error('The requested feature mode differs from the fitted dataset.');
  }
  return {
    format:'crop-trainer-weights-v1', trainer, featureSchema,
    ...(peakAveraging === 'occupied' ? {peakAveraging} : {}),
    ...(featureMode === 'local-ground' ? {featureMode} : {}),
    inputs:featureNames.length, featureNames:featureNamesFor(featureMode), hiddenLayers:settings.hiddenLayers,
    activation:settings.activation, output:'sigmoid', layout:'layer-major, neuron-major, incoming weights then bias',
    crop:settings.crop, ...plantSettings(settings), minimumHeight:settings.minimumHeight, threshold:settings.threshold,
    pinSeparation:cropProfile(settings.crop).pinSeparation, scaling, weights:Array.from(weights), epochs
  };
}

// The original two-argument call declares absolute, zero-filled feature rows.
export function scoreSavedWeights(rawFeatures, model, peakAveraging='zero-filled', featureMode='absolute', inspectInputs) {
  const saved=savedFeatureSettings(model);
  if (saved.peakAveraging !== peakAveraging) throw Error('Extract the candidate rows with the saved peak averaging rule.');
  if (saved.featureMode !== featureMode) throw Error('Extract the candidate rows with the saved feature mode.');
  if (model?.format !== 'crop-trainer-weights-v1' || model.inputs !== 13 ||
      model.scaling?.means?.length !== 13 || model.scaling?.std?.length !== 13 ||
      !model.scaling.means.every(Number.isFinite) || !model.scaling.std.every(v => Number.isFinite(v) && v > 0) ||
      !Array.isArray(model.weights) || !model.weights.every(Number.isFinite)) throw Error('Expected an exported Crop Trainer weight file.');
  const normalized = Float32Array.from(rawFeatures,(v,i)=>(v-model.scaling.means[i%13])/model.scaling.std[i%13]);
  const scores = predictNetwork(normalized,model.weights,13,model.hiddenLayers,model.activation);
  inspectInputs?.(normalized,scores);
  return scores;
}
