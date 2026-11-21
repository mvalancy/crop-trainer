# How a crop detector learns

For a first introduction, [follow one lettuce from its scan to its final pin](first-steps/README.md).

The orchard, vineyard, bench lettuce and high-wire tomato profiles teach one XY planting position per plant. Their labels preserve the base when the canopy leans. See [growing-system targets and fixtures](scanners.md) and the [physical vineyard test](field-datasets.md#replay-the-vineyard-test).

![Plant labels teach a model to find crop centers in a new scan](../art/scan-learn-find.svg)

A LiDAR return is a 3D point. A cluster of tall returns might be lettuce, a weed or clutter. The generator knows where it planted each plant, so it can provide an answer key. Training adjusts numerical weights to give likely plant centers a higher score. One epoch is one pass over the balanced set of training candidates.

## Watch a run

Press **Generate, train & score**. As each new field arrives, the display shows a sample of its laser returns. When training starts, the camera stays on one held-out field. Gold rings show where the current model would place plant centers. Select **Close-up** to follow a few plants as the model learns. The loss trace underneath measures errors on its training examples.

Each pin update gives the epoch that produced it. The CPU or WebGPU trainer can finish several more epochs before the next picture. At validation the view switches overhead. Rings show the final predictions and pink crosses show reference plants missed at 15 cm. The final mean F1 combines all validation scans at three distances.

## Follow one plant through training

1. **Scan it.** The generator records a cloud of XYZ points and saves the planted centers separately. It divides the scan into 5 cm squares and looks for local height peaks.
2. **Teach from examples.** Each peak gets 13 measurements from the nearby points. During practice, peaks close to a planted center are positive examples and distant peaks are negatives. Getting an example wrong nudges the model’s weights.
3. **Try a fresh field.** The trained model scores peaks using only their measurements. Peaks above or at the cutoff can become pins. When two pins are too close, the higher-scoring one wins.
4. **Check its work.** The scorer compares the final pins with the hidden planting map. Each plant can match at most one pin. A misplaced pin can leave both an extra detection and a missed plant.

The starter learns all weights in a four-unit tanh hidden layer and a sigmoid output. A logistic baseline uses the same inputs and validation split. Precision measures how many pins match plants. Recall measures how many plants received a pin. Mean F1 combines both over three matching distances. Each run learns a detector for the selected crop and estimates how well it locates whole plants on new synthetic fields.

## Design a detector

Open **Design the model** in the training shed. The diagram reads left to right. Every candidate peak has 13 measurements. Each hidden layer combines the preceding layer’s values. The final sigmoid gives one score between 0 and 1. Large layers show a sample of their nodes, with their full widths underneath.

| Control | What changes |
| --- | --- |
| Model family | Logistic regression goes straight from the 13 inputs to the output. A dense neural network adds 1–4 hidden layers, each with 1–32 units. |
| Hidden activation | Tanh squashes values between −1 and 1. ReLU passes positive values and sets negative ones to zero. |
| Optimizer | Gradient descent follows the current gradient. Momentum carries a fraction of the previous update forward. |
| Update weights after | Full batch makes one update per epoch. Mini-batches of 32, 128 or 512 make several. Each epoch visits the whole seeded training set in the same order, including the final partial batch. |
| Learning rate and momentum | The rate scales the update. The momentum setting controls the fraction carried forward when that optimizer is active. |
| Seeds | The dataset seed selects the fields. The initialization seed selects the neural network’s starting weights. Logistic weights start at zero. |

For small batches with momentum, try a learning rate of 0.025 first. At 0.25 we observed CPU and WebGPU take different optimization paths after several epochs on a three-layer ReLU model.

Try changing the starter to two hidden layers of 8 and 4. Keep the field seed, crop and scan settings fixed. Compare the new model’s misses on the same validation planting.

### Does the fit use later fields?

Open **What went into this fit?** in the Training Shed results. Each bar counts the examples one planting contributed after class balancing. Expand the table to inspect its counts or open its scan. The preview holds the camera on the first validation field so that you can compare the pins between epochs.

For the seed-27 **Quick check** with the original canopy generator (v1), the six practice fields supplied **581, 402, 533, 440, 492 and 604** examples in field order. That is 3,052 rows of 13 local measurements. Forty epochs revisit those rows 122,080 times while fitting 61 adjustable numbers. The generator, feature extraction and labeling run once before fitting. The six validation scans come from three additional plantings.

We also ran that v1 lettuce generator with 128 practice fields and 64 validation fields at seed 27 for 5,000 epochs on the CPU. All 128 practice fields contributed, ranging from 114 to 571 examples apiece. The balanced pool reached its 48,000-row cap. The fit made **240,000,000 example visits**. On this host generation and feature preparation took 37.9 s, fitting took 156.6 s, and scoring took 0.8 s. On the 128 held-out scans the F1 scores were 0.7522 at 7.5 cm, 0.8310 at 10 cm and 0.8512 at 15 cm. These are synthetic detection scores. Run the same settings on your own device for a timing comparison.

In a mixed-layout v1 lettuce run (seed 20261121, 3.5 cm peak floor), the four training fields supplied **427, 379, 524 and 538** of the 1,868 balanced examples. To check the fourth field's influence, we carried the source field ID through the class shuffles and verified that the resulting inputs and labels exactly matched the normal run. We then flipped the labels of just those 538 examples, keeping every input and the other three fields' labels fixed.

After two epochs with batches of 32, learning rate 0.125 and initialization seed 178, the four-unit tanh model's training loss changed from **0.4723 to 0.6171**. Its largest absolute weight change was **0.4914**. Logistic regression's loss changed from **0.4554 to 0.6051**. CPU and Chromium's software WebGPU adapter (SwiftShader) agreed to within 1.2 × 10⁻⁷ on every fitted weight. This measures whether training responded to the labels. Accuracy on new fields needs a separate held-out score.

<details>
<summary>Check the final example on your own WebGPU adapter</summary>

Open the Training shed and paste this into the browser console. Of 1,057 rows, only the last has a nonzero input. Flipping its label from 0 to 1 changes the input weight by the learning rate divided by the number of rows in its update. With batches of 32, the final update contains one row. In full-batch mode, it contains all 1,057.

```js
const {trainNetworkGPU} = await import('./neural.js');
const x = new Float32Array(1057);
x[1056] = 1;
const labels = new Float32Array(x.length);
const flipped = labels.slice();
flipped[1056] = 1;
for (const batchSize of [32, 0]) {
  const options = {dims:1, hiddenLayers:[], epochs:1, lr:0.25, batchSize};
  const a = await trainNetworkGPU(x, labels, options);
  const b = await trainNetworkGPU(x, flipped, options);
  console.log(a.adapter, b.weights[0] - a.weights[0], batchSize ? 0.25 : 0.25 / x.length);
}
```

Each line prints the adapter, measured change and expected change. Run the CPU equivalent with `node --test test/fit-coverage.test.js`.

</details>

### Do more practice fields improve a score?

We compared 2, 6 and 24 practice fields on three fresh dataset seeds using the v1 canopy generator. Each column kept the same six validation plantings (12 scans), verified by tile ID. The smaller training sets shared their raw scans with the start of the larger sets. Every fit built its own balanced pool and scaling from its training fields.

| Practice fields | Seed 3193 mean F1 | Seed 3194 mean F1 | Seed 3195 mean F1 |
| ---: | ---: | ---: | ---: |
| 2 | 0.7632 | 0.6890 | 0.7429 |
| 6 | 0.7640 | 0.7235 | 0.7480 |
| 24 | 0.7631 | 0.7267 | 0.7218 |

Six fields scored higher than two on all three seeds. Moving from six to 24 helped on one. Increasing the number of practice fields changes the mix of scanner layouts, examples and normalization. The effect on fresh plantings varied with the seed.

To repeat a column, use v1 lettuce, mixed scanners, seeded ray budgets, a 3.5 cm minimum peak, the starter four-unit tanh network and CPU. Choose six validation fields and 40 full-batch epochs. Hold the dataset seed, learning rate (0.25), initialization (12345) and cutoff (0.50) fixed while changing **Training fields**. Compare the validation tile IDs in the three JSON exports before comparing mean F1.

## Why did training finish so quickly?

A training run can take milliseconds or hours. What matters is the number of examples, the work the model does per example, and how often it revisits them. Crop Trainer first converts millions of laser coordinates across a run into height peaks. It measures 13 features per candidate and fits a four-unit network with **61 trainable numbers**. Those features are computed once. Additional epochs revisit the same examples.

**Field practice**, the first run in the browser, grows 16 training plantings and eight held-out plantings. Each gets scans with and without soil. The device spends about **30 seconds fitting** after the fields are ready. **Quick check** trades that time budget for six training fields, three held-out fields and 40 epochs. The CLI also starts with this fixed schedule.

### What does another 30 seconds teach?

We grew seed-27 lettuce with each generator and trained the four-unit network twice. Within each pair, the exports had the same 48 scan IDs, initial weights, mixed scanner layouts and full-batch learning rate of 0.25. One fit ran for 40 epochs and the other for a 30-second budget. All measurements came from CPU fitting in Chromium on a Linux desktop. To time your own phone, choose **Time a trial**.

| Generator | Schedule | Epochs | Make fields | Fit | Score | Total | Mean F1 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original canopies (v1) | 40 epochs | 40 | 6.29 s | 0.30 s | 0.14 s | 6.73 s | 0.816 |
| Original canopies (v1) | 30 seconds | 4,965 | 4.43 s | 30.06 s | 0.15 s | 34.64 s | 0.836 |
| Structured plants (v2) | 40 epochs | 40 | 2.28 s | 0.28 s | 0.14 s | 2.70 s | 0.708 |
| Structured plants (v2) | 30 seconds | 4,588 | 2.02 s | 30.05 s | 0.14 s | 32.22 s | 0.801 |

On the v2 fields, the longer fit raised F1 from **0.670 to 0.758** at 7.5 cm, **0.722 to 0.816** at 10 cm and **0.734 to 0.830** at 15 cm. It revisited the same 7,842 labeled examples. The v1 pool had 7,904 examples and different scan geometry, so compare schedules *within* each generator. Each pair covers one synthetic seed. [Try v2 Field practice](https://mvalancy.github.io/crop-trainer/trainer/?plan=practice&plantArchitecture=2&engine=cpu&seed=27) · [Replay with v1 canopies](https://mvalancy.github.io/crop-trainer/trainer/?plan=practice&plantArchitecture=1&engine=cpu&seed=27)

Larger crop models can operate on whole clouds. Zhou and colleagues trained a PointNet++ variant to segment maize stems point by point. Using 50 training clouds with roughly 20 million labeled photogrammetry points, they reported **5–6 hours** for 32 epochs on one RTX 4070 Ti SUPER. The task, input representation and hardware all change how much work one epoch takes. [Zhou et al., §§2.3 and 4.4](https://doi.org/10.3389/fpls.2025.1724096) · [How agricultural teams train and test detectors](industry-practice.md)

For a comparison across devices or models, use fixed epochs, identical seeds and a common held-out set. A timed run exports its completed epoch count for replay. When deciding whether to train longer, check whether misses, extra pins and count errors improve on unseen fields. Training loss can keep falling after field results have leveled off.

## Plan a longer run

Choose **Time a trial** to generate the requested fields, fit for 16 epochs on the selected backend and score the validation set. The estimate uses the measured per-epoch time after the first four epochs and adds setup and scoring. Changing the model, data settings or backend calls for a fresh estimate. Machine load and browser scheduling can change the eventual time.

Under **Training schedule and optimizer**, choose a fixed epoch count or **Training time** (30 seconds to 24 hours). The time budget covers fitting. Your live estimate updates from completed epochs. The current epoch finishes before scoring starts. During training, **Finish & score now** keeps the learned weights and runs validation. **Cancel** discards the active fit. Keep the tab open and the device awake. Reloading the page ends the run. CPU fitting runs in a worker so you can still use the controls.

## Take your model with you

After validation, expand **Explore learned weights** and choose any layer and unit. The signed bars show the incoming weights and the bias for that unit.

**Download model weights** saves a small JSON file with the learned weights, hidden widths, activation, feature scaling, crop and detection thresholds. **Download run settings** reproduces the fit from scratch. **Download benchmark JSON** adds times, scores and loss history. Long fits keep a bounded history with its actual epoch numbers in `lossEpochs`.

For inference in a local checkout, `features` converts a generator tile into candidate positions and raw feature rows. The helper applies the saved scaling and returns one score per position.

```js
import {features} from './trainer/data.js';
import {scoreSavedWeights} from './trainer/network.js';

// model is the parsed weights JSON. tile is a field from the generator.
const {X, pos} = features(tile, model.minimumHeight);
const scores = scoreSavedWeights(X, model);
```

The detector keeps candidates at or above `model.threshold` and filters nearby pins using `model.pinSeparation` in metres. For a custom implementation, read layers from input to output. Each neuron stores all its incoming weights followed by its bias. The saved input means and standard deviations come from the training split.

## Test a plot of your own

Open the [Field test in the Training shed](https://mvalancy.github.io/crop-trainer/trainer/#field-test). For a first practice run, download the PLY and its matching **Labels JSON** from the same generator plot. Use the most recent completed fit or load saved weights for that crop, select the scan and labels, leave metres and zeros selected, and press **Find plants**. This uses the saved normalization, peak floor, score cutoff, and crop spacing. A practice run can verify that your workflow works end to end. To measure generalization, reserve independent plots.

For a surveyed plot, choose metres, centimetres or millimetres and enter its fixed lower-left X and Y and the ground Z in those units. The detector measures height above that level. For a uniformly sloped bed, expand **Surveyed sloping ground** and enter measured signed grades along X and Y. A value of 5 represents a 5 cm rise per metre. Ground Z is the elevation at the entered origin. This keeps the survey’s horizontal XY coordinates intact. Crop larger scans and correct irregular terrain or scanner tilt before import. Each input must fit one 10 × 10 m footprint with Z increasing upward, at most 1 million returns and 32 MiB per PLY. The peak finder omits the outermost 5 cm grid cells. Supply all surveyed plant centers in a two-column CSV with header `x,y`, in the same source coordinates as the scan. A header-only file means you surveyed the plot and found it empty. Leave the labels field blank to inspect unscored predictions.

Switch between the model and the height-only rule to compare where they put their pins. Both start from the same peaks and enforce the same minimum spacing. With labels, the map shows assignments at 15 cm. The table scores both methods at 7.5, 10 and 15 cm. The stage counts show how many surveyed centers had distinct matching peaks before scoring, after the saved cutoff, and after spacing. If the first stage already misses plants, changing the network alone cannot recover them. A dash marks a rate with a zero denominator. The signed count difference shows whether your detector overcounted or undercounted the plot. Record count error and missed plants separately.

**Download field test JSON** saves the pins in source XY and plot-local metres, file names and SHA-256 hashes, frame, and any reference centers and scores. Keep that report private if it contains farm coordinates. Inference and scoring use a local CPU worker. To reproduce a run from the same inputs outside the browser, use the [command-line runner](scan-cli.md). For decisions about field accuracy, follow the [field validation protocol](field-validation.md).

[Back to the field guide](README.md)
