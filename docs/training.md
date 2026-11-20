# How a crop detector learns

![Plant labels teach a model to find crop centers in a new scan](../art/scan-learn-find.svg)

A LiDAR return is a 3D point. A cluster of tall returns might be lettuce, a weed or clutter. The generator knows where it planted each plant, so it can provide an answer key. Training adjusts numerical weights to give likely plant centers a higher score. One epoch is one pass over the balanced set of training candidates.

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

## Plan a longer run

Choose **Time a trial** to generate the requested fields, fit for 16 epochs on the selected backend and score the validation set. The estimate uses the measured per-epoch time after the first four epochs and adds setup and scoring. Changing the model, data settings or backend calls for a fresh estimate. Machine load and browser scheduling can change the eventual time.

Under **Training schedule and optimizer**, choose a fixed epoch count or **Training time** (1 minute to 24 hours). The time budget covers fitting. Your live estimate updates from completed epochs. The current epoch finishes before scoring starts. During training, **Finish & score now** keeps the learned weights and runs validation. **Cancel** discards the active fit. Keep the tab open and the device awake. Reloading the page ends the run. CPU fitting runs in a worker so you can still use the controls.

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
