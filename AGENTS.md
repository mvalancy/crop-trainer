# Crop Trainer agent guide

Help a team answer one LiDAR detection question at a time. Crop Trainer generates lettuce, globe-artichoke and young-tomato geometry, scanner returns, and center labels from seeds. All training and evaluation in the starter use synthetic data. Read README.md for the human walkthrough.

## Run your first test

From a fresh clone, use Node.js 22 or later. The app has zero package dependencies.

```sh
node --test
node run.mjs train harvest-27.json
node run.mjs serve
```

Open http://127.0.0.1:4173/ to inspect a field and its training run in the browser. The command-line trainer uses the CPU. Training shed can use WebGPU on a supported browser and adapter. Auto checks for an adapter and uses CPU if one is unavailable. Training examples, weights and farm progress stay on the device. A teammate who uses a chat-only agent can export and attach a benchmark JSON themselves.

To reproduce a completed browser experiment, choose **Download run settings**, then pass that JSON as the second filename, for example `node run.mjs train replay.json crop-settings-27.json`. A replay generates the same fields and trains fresh weights. CPU and WebGPU floating-point results can differ slightly.

## Run a paired experiment

Write settings into a local JSON file. This example uses the default settings. The optional validationSensorMode override is described below.

```json
{"crop":"lettuce","seed":27,"trainFields":6,"valFields":3,"epochs":40,"model":"neural","sensorMode":"mixed","minimumHeight":0.035,"threshold":0.5}
```

1. Save this as control.json. Run `node run.mjs train control-27.json control.json`.
2. Copy the settings to variant.json and change just minimumHeight to 0.065. Run `node run.mjs train variant-27.json variant.json`.
3. Repeat both configurations at a fresh seed. Use new output filenames. Compare meanF1, each scores entry, and the same seed and ground setting in tiles. For each tile, stages15cm shows losses before classification, after the selected score cutoff and after spacing.
4. Report the direction and size of the difference on each seed, wall time if measured, and which stage explains the change. The two ground variants share one field and belong in the same split.

Valid settings include 2–256 training fields, 1–128 validation fields, 1–5,000 epochs, unsigned 32-bit seeds, neural or linear, mixed sampling or any exact scanner key in trainer/sensors.js, and 0.035 or 0.065 metres for minimumHeight. The optional threshold accepts a number from 0 through 1 and defaults to 0.5, including when replaying older settings. It applies to validation after fitting. Crop keys are lettuce, artichoke and tomato. Omitting minimumHeight selects the crop default (0.035 m for lettuce and 0.065 m for artichoke and tomato). Large runs can take substantially longer. Browser report times include generation, optimization and validation. Use training-set normalization for every validation tile.

For a browser benchmark, open `/benchmark/`, select the crop, scanner and first seed, and run the comparison. Model, backend, epoch and cutoff comparisons share one dataset per seed. Training density builds a separate dataset for each training budget and pairs the held-out tiles. Expand **Scores at each matching distance** to see which pins matched, which were extra, and which plants were missed. Use **Link to these settings** after a run to open the same setup on another browser. The JSON includes this URL, timings and tile IDs. A localhost link uses the local server address. GPU rows include available adapter metadata. A software adapter exercises WebGPU kernels on the CPU. Record the device separately when reporting a physical GPU timing.

To isolate the score cutoff, select **Detection score cutoffs**. This fits one CPU neural network per seed and scores the same weights and fields three times. Group the JSON rows by seed and threshold. Each group of three shares the generation and training costs. For a follow-up, pass the desired threshold in CLI settings and check the precision and recall change on fresh fields.

For the cutoff, model and backend comparisons, **Epochs per fit** sets the training budget for every contender. Links without an epoch setting use 40. For example, open `/benchmark/?comparison=cutoffs&crop=artichoke&seed=621&epochs=100`. Under **What changes from the 0.50 cutoff?**, change the match distance to see the differences in matched plants and extra pins. Click a cutoff in Results to replay that CPU fit in the Training Shed. The replay preserves the cutoff, epoch count, crop, seed and scan layouts.

To compare cutoffs at two training durations, run the same seed pair at 10 and 100 epochs. Check that both reports have the same tile IDs and field seeds. Within each report, all three cutoff rows for one seed share their fit and training time. Compare the change from 0.50 to 0.65 separately at each duration. Use a fresh seed pair to see whether the result repeats.

### Pair scanner layouts on identical plantings

Set `sensorMode` to the training layout and `validationSensorMode` to the layout to score. Omitting the second key uses the training selection for validation, including for older settings files. Both accept `mixed` or any key in `trainer/sensors.js`. For a scanner comparison:

1. Use seed 211, a mixed training layout and the reference validation grid. Copy the settings and change just `validationSensorMode` to `os1-64`.
2. Run both with the CLI. Check that training tile IDs, scaling parameters and CPU weights match. Pair validation tiles by field seed and ground setting. Each layout has its own tile ID. The manifest records each tile’s recipe and final return count.
3. Repeat at seed 212. Compare mean F1 and the matched-plant counts before the score cutoff and after spacing. For a detector-training comparison instead, keep validation scans fixed and change only the training layout.

The browser benchmark exports both layout selections when validation is overridden. Its replay link restores the selection. The training shed’s field audit opens each scored validation tile in the 3D viewer with the original crop, scanner, field seed and ground setting.

### Share or verify a generated scan

From the 3D viewer, copy the scan link after generating. For a validation tile, follow its viewer link from the field audit or benchmark. A generator URL takes the field seed under `seed`, scanner key under `sensor`, and ray count under `budget` (0 selects the seed's budget). Use `ground=true` or `false`, `noise=seeded|clean|rough`, and `weeds`, `sticks`, `boards` each set to `seeded|on|off`. The optional `tile` value is the expected 16-digit hexadecimal tile ID. For a shareable field, use the GitHub Pages base URL. The page rebuilds the scan locally.

To verify reproducibility, open the link in a fresh browser, compare the tile ID and download the PLY and labels. Compare files from the same generator revision byte for byte. To reproduce a model score, use the benchmark URL or training settings as well as the field link. The training run's dataset seed selects multiple field seeds.

### Change held-out ray density

Use `validationRayBudget` in CLI settings or browser trainer and benchmark URLs. Omit it or set it to 0 for the original seeded budget. Fixed values are 12000, 30000, 60000 and 100000. Training recipes use seeded budgets by default. To change training density independently, set `trainingRayBudget` to the same supported values. Both settings travel in trainer and benchmark links and JSON exports. In the Training shed, expand **Scanner and ray budgets**. To test density matching, fix the training and validation layouts to `os1-64`, keep validation at 12000 rays, and compare 12000 with 60000 training rays on seeds 1221 and 1222. Verify identical held-out tile IDs and report training sample counts in each arm. To repeat the density experiment, choose mixed training, `validationSensorMode: "os1-64"`, seed 721 and compare validation budgets 12000 and 60000. Repeat at seed 722.

Check training tile IDs, CPU weights and scaling before comparing the runs. Match held-out tiles by field seed and ground flag. The manifest's `recipe.points` is the request, `sampledRays` is the number sampled before scan noise, and `returnCount` is the final XYZ count. Stray returns can increase the final count. Capped layouts can produce identical scans and tile IDs for two requests above capacity. The OS1-32 preset caps a 100000-ray request at 16384 samples. Use the per-tolerance scores and stage audit to tell a missing peak from a rejected candidate.

### Replay the paired training-density benchmark

Open `/benchmark/?comparison=density&crop=artichoke&seed=1321&sensor=os1-64&validationRayBudget=60000`. Each seed gets two CPU neural fits. The first seed trains at 12000 and 60000 rays and the second reverses that order. Use the repeat link below the sample counts to change validation density while keeping the fits reproducible.

In the JSON, read each budget from `row.trainingRayBudget` and join the row to `datasets[row.datasetIndex]`. For one seed, compare validation entries of the two recipe manifests by tile ID. Read the balanced example count from `stats.samples` and the sampled rays per scan from each training manifest entry. A capped scanner can return the same count for two requested budgets. When replaying on the CLI, use the shared crop, layout and validation settings plus the individual row’s seed, epochs, training budget and cutoff. Earlier report formats with one dataset per seed can be joined by seed.

### Audit missing crop returns

In each validation tile, `coverage.zero`, `coverage.oneToFour` and `coverage.fiveOrMore` count plants by their surviving crop returns. The values sum to the number of labeled plants. For per-plant detail, open the exact tile in the generator and download Labels. Entry `crop_returns_per_box[i]` counts returns from `boxes[i]`. Earlier label files omit this array. Regenerate their recipe to compute coverage.

For a paired run, start with tomato seed 921, mixed training and OS1-64 validation. Compare budgets 12000 and 60000 and repeat at seed 922. Group by field seed, using soil-present tiles to count each planting once. Soil removal drops only soil and leaves these counts intact. At 15 cm, `max(0, fn - coverage.zero)` is a lower bound on misses that had crop returns. This bound also works on older reports that only have aggregate coverage. Coverage comes exclusively from generator bookkeeping and is excluded from all 13 detector inputs.

### Find the exact missed plants

In the Training Shed, run the detector, choose **Missed plants** in the field map, and select a matching distance. **Highlight a missed plant** lists the zero-based box index, center coordinates in metres and crop return count. A second ring highlights the selected box.

In a CLI report or browser benchmark row, find the tile by `tile_id`, then select `missesByTolerance` by `cm`. Each `boxIndices` entry indexes `boxes` and `crop_returns_per_box` in that tile’s generator label download. Its length equals the corresponding false-negative count. `withCropReturns` counts the missed boxes that have one or more returns. In earlier reports this section is absent.

To compare cutoffs, check the weights and tile IDs, then take the set difference between the two missed-index lists for the same tile and distance. This gives the boxes that gained or lost a match under the scorer’s assignment. A pin can be close to two labels. The scorer chooses a deterministic maximum-cardinality assignment and can reassign a pin to fit another match.

### Compare the same field with and without soil

Each completed Training Shed or CLI report includes `byGround`. Each benchmark row includes it too. Select the group by its boolean `ground` flag and the score by its `cm` value. The scorer pools matched plants, extra pins and misses across that group's tiles before computing precision, recall and F1. Earlier reports contain the underlying counts in `tiles[].byTolerance`.

For an example, train artichoke on seed 308 with the defaults. Subtract ground-present recall from ground-removed recall at 15 cm and multiply by 100 for percentage points. Check the false positives at the same distance. To investigate a specific field, pair tiles by seed and switch soil settings in the field audit. Each pair shares one planting, its labels, scan layout and fitted weights. Report the number of distinct validation fields. Synthetic soil removal uses generator class labels.

### Check whether a model gain holds across plantings

Open the CPU model benchmark, choose a crop and seed, then expand **Compare contenders on each planting**. For automation, each benchmark row includes `byField`. Match rows by dataset seed and model name, then match their field groups by field seed. Contender execution order reverses on the second dataset seed. Check that the two sets of tile IDs are identical before comparing models.

For each planting, the scorer adds TP, FP and FN from both soil variants at each distance, computes F1, then averages the three F1 values for `meanF1`. The overall score pools counts across all validation scans first. Count field-level wins, losses and ties using the exported precision, and report the pooled score separately. The CLI and Training Shed also export `byField`; older reports can be reconstructed from `tiles`.

### Trace a model disagreement to a plant

Run `/benchmark/?comparison=models&crop=lettuce&seed=1121&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000`. Open **Which plants did each model find?** The scan picker includes both soil variants for each dataset seed. Choose a distance and one of the boxes exclusive to either model. Follow the 3D link to inspect the highlighted center.

For a local agent, import `compareMatchedBoxes` from `trainer/data.js`. Pair the logistic and neural rows by dataset seed, and their tiles by `tile_id`. Call `compareMatchedBoxes(logisticTile, neuralTile, 15)` on reports containing `missesByTolerance`. The result includes counts `both` and `neither`, zero-based box index arrays `firstOnly` and `secondOnly`, and extra pin counts `firstFP` and `secondFP`. Row order reverses on the second seed. The helper takes distances in centimetres. Sum both shared counts and the two array lengths to recover the label count. For earlier reports, reproduce the run to obtain the assigned box indices.

A generator URL can include `box=0` or another zero-based box index. Include the matching `tile` value when building links from a report. This prevents a stale tile link highlighting an unrelated plant. Box highlighting affects only the camera overlay and shared URL.

### Compare training duration

Open `/benchmark/?comparison=epochs&crop=artichoke&seed=551`. Each seed generates one dataset. Three neural fits start from the same initial weights with the same examples, scaling, learning rate (0.25) and score cutoff (0.50). Each fit runs from scratch so its training time covers its entire duration. The second seed runs the budgets in reverse order.

Group exported rows by `seed` and `epochs`. Read the duration from the row. The report's shared settings omit a single epoch value for this comparison. `trainingLoss` is the loss on the final pass before its update, while `scores` use the updated weights. For a CLI replay, copy the crop, layouts, field counts and peak height from `settings`, then set the specific row's seed and epochs in your settings JSON. Check the tile IDs and per-tolerance counts. In the browser, clicking the epoch count opens the matching Training Shed setup on CPU.

## Where to change the app

| File | Role |
| --- | --- |
| trainer/crops.js and trainer/sensors.js | Crop shapes, default peak heights and duplicate spacing, plus shared scanner layouts. |
| viewer.js | Interactive XYZ orbit camera, pan, zoom, touch and keyboard controls. |
| benchmark/main.js | Two-seed paired CPU/WebGPU and model comparisons with timing and scoring export. |
| trainer/field.js | Generates original plant surfaces, synthetic XYZ returns and plant boxes. Coordinates use metres. |
| trainer/data.js | Assigns split-specific field seeds, finds height peaks, extracts 13 features, balances examples, standardizes inputs, filters duplicate pins and scores matches. |
| trainer/model.js | Linear logistic baseline, including CPU and WebGPU implementations. |
| trainer/neural.js | Fully trained 13 → 4 tanh → 1 sigmoid network, CPU gradients and WebGPU compute kernels. |
| trainer/main.js | Training form, backend selection, progress, per-field maps and JSON export. |
| farm.css | Shared navigation, forms, responsive layouts, viewer, and score tables for all three app pages. |
| farm.js | Seeded farm preview, scan and label downloads, and local mission stamps. |
| run.mjs | Dependency-free local server and CPU experiment entry point. |

A training candidate within 9.5 cm of a label is positive. A candidate beyond 15 cm is negative. The trainer skips intermediate distances. Labels enter training and scoring. Candidate features come solely from XYZ. Evaluation uses one-to-one horizontal matching at 7.5, 10 and 15 cm, pools counts across tiles and averages the three F1 scores equally. Keep validation comparisons separate from claims about physical farms.

## Example request for Gemini or another agent

“Read AGENTS.md. Run the neural model at both supported peak heights on seeds 27 and 28 with the other defaults fixed. Show mean F1, precision and recall at 15 cm, and the field with the most lost matches. Explain which setting you would test next.”

## Sharing changes

Use synthetic fixtures for examples and tests. Keep raw scans, third-party labels, private weights, credentials and generated run reports out of commits. Check the affected browser flow, run the Node tests, and preserve the MIT notice with redistributed source. The README title illustration is in art/title.svg.
