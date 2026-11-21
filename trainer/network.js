import {plantSettings} from './plant-version.js';
import {cropProfile} from './crops.js?v=systems1';

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
  if (shape.layers.length > 1) {
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

// Both training entry points export the same inference metadata for a completed fit.
export function weightArtifact({settings,scaling,weights,trainer,epochs}) {
  return {
    format:'crop-trainer-weights-v1', trainer, featureSchema:'crop-peak-13-v1',
    inputs:featureNames.length, featureNames, hiddenLayers:settings.hiddenLayers,
    activation:settings.activation, output:'sigmoid', layout:'layer-major, neuron-major, incoming weights then bias',
    crop:settings.crop, ...plantSettings(settings), minimumHeight:settings.minimumHeight, threshold:settings.threshold,
    pinSeparation:cropProfile(settings.crop).pinSeparation, scaling, weights:Array.from(weights), epochs
  };
}

// Score raw candidate rows from features(tile, minimumHeight) using a saved fit.
export function scoreSavedWeights(rawFeatures, model) {
  if (model?.format !== 'crop-trainer-weights-v1' || model.featureSchema !== 'crop-peak-13-v1' || model.inputs !== 13 ||
      model.scaling?.means?.length !== 13 || model.scaling?.std?.length !== 13 ||
      !model.scaling.means.every(Number.isFinite) || !model.scaling.std.every(v => Number.isFinite(v) && v > 0) ||
      !Array.isArray(model.weights) || !model.weights.every(Number.isFinite)) throw Error('Expected an exported Crop Trainer weight file.');
  const normalized = Float32Array.from(rawFeatures,(v,i)=>(v-model.scaling.means[i%13])/model.scaling.std[i%13]);
  return predictNetwork(normalized,model.weights,13,model.hiddenLayers,model.activation);
}
