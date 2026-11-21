# Crop Trainer agent guide

Help a team answer one LiDAR detection question at a time. Crop Trainer generates seeded leafy crops, orchard trees, trellised vines and greenhouse rows with scan returns and one target per plant. To evaluate synthetic weights on an openly available physical scan, replay the [surveyed vineyard strip](docs/field-datasets.md#replay-the-vineyard-test). The starter trains and benchmarks on synthetic data. Users can evaluate a saved detector against their own local survey in Field test. Start with the [first harvest](README.md). Keep the front page focused on that first run. Put experimental results and technical walkthroughs in the [field guide](docs/README.md).

## Run your first test

From a fresh clone, use Node.js 22 or later. The app has zero package dependencies.

```sh
node --test
node cli/run.mjs train harvest-27.json
node cli/run.mjs serve
```

Open http://127.0.0.1:4173/ to inspect a field and its training run in the browser. The command-line trainer uses the CPU. Training shed can use WebGPU on a supported browser and adapter. Auto checks for an adapter and uses CPU if one is unavailable. Training examples, weights and farm progress stay on the device. A teammate who uses a chat-only agent can export and attach a benchmark JSON themselves.

To reproduce a completed browser experiment, choose **Download run settings**, then pass that JSON as the second filename, for example `node cli/run.mjs train replay.json crop-settings-27.json`. A replay generates the same fields and trains fresh weights. CPU and WebGPU floating-point results can differ slightly.

Browser settings exports include `hiddenLayers`, `activation`, `initSeed`, `optimizer`, `batchSize`, `learningRate` and `momentum`. Earlier settings files select the original four-unit tanh net or the logistic baseline. A time-limited run records its completed epoch count so the CLI can repeat the same number of updates. For the weight format and an inference example, see [the training guide](docs/training.md).

The initial browser schedule, **Field practice**, sets 16 training and eight validation plantings with about 30 seconds of fitting. The generator opens that schedule for a new crop/layout. `/trainer/?plan=quick` and the default Node command use the six/three/40-epoch recipe. For timing or precision comparisons, fix field seeds and completed epochs across machines. [Training time and replay](docs/training.md#why-did-training-finish-so-quickly) · [Industry evidence and research gaps](docs/industry-practice.md)

### Reproduce a crop form or an injury

Use `plantArchitecture: 3` for connected plants. For apple trees, v4 varies the thickness of scaffold branches while preserving the branch centerlines. Version 3 joins lettuce blades to their stems, grounds vegetative artichokes, seats artichoke bracts and meets greenhouse support heights. Keep the recorded architecture when replaying an export. Version 2 reproduces the first organ models and version 1 reproduces original canopies. Choose a named `plantForm` from the [catalog](trainer/plants/forms.js) or use `mixed`. Set `plantCondition` to `healthy`, `mixed` or `damaged`. All three settings travel with the recipe, training settings and benchmark replay. Keep the seed and scanner fixed when comparing conditions. Field export boxes report each resolved form and condition. Apple leaf-on and dormant form an additional paired inspection in the field generator. For the visual rule, photo references and limitations, open the [seven illustrated generator guides](trainer/plants/README.md).

### Check the actual training set

A completed Training Shed run includes **What went into this fit?** Expand the planting list to inspect the retained class counts or open a training field. For a programmatic audit, sum `usedPositive + usedNegative` across `stats.trainingExamplesByField` and compare with `stats.samples`. Both soil variants count toward the same field. The two global class totals should match. Multiply the retained total by the completed epochs to reproduce `samplePasses`. Older exports have aggregate counts only. During fitting, the animation uses the first validation field as a fixed visual reference. [Training coverage experiment](docs/training.md#does-the-fit-use-later-fields)

### Reproduce a live pin display

Open the Training shed with the run’s settings. During fitting, the gold rings use the first soil-present validation scan. To check a ring layout at a particular epoch, use the epoch shown **beside the predicted count**. Replay that many epochs from the same initialization, score the first validation tile at the same threshold and compare its selected XY centers. The loss readout can advance between pin updates. Browser previews sample up to 9,000 returns for drawing. Fitting and scoring use the full feature arrays.

For timing comparisons, run both contenders through the same Benchmark entry point with **Live view** off. The exported report records this setting and its replay URL includes `live=off`. The Training shed also samples model weights and draws a preview during the fit, so its elapsed time includes that work.

## Test a detector outside the generator

Use a model exported by the Training shed and a local plot scan. If the user supplies an independently surveyed center CSV, run `node cli/score-scan.mjs weights.json plot.ply new-result.json --labels centers.csv`. With no survey, omit `--labels` and describe the resulting pins as predictions. Use the same frame, scan and one-to-one matching for the trained detector and its height-only baseline. The output includes SHA-256 hashes and both source and local coordinates. See the [file and frame contract](docs/scan-cli.md) and [field validation protocol](docs/field-validation.md).

To check a fresh field computer offline after setup, run `node cli/run.mjs preflight`. The CPU runner round-trips exported weights and held-out synthetic PLY files. Record the revision, Node version, OS and board when reporting results. See [board setup and field capture](docs/edge-deployment.md) and the [published research behind these experiments](docs/research-evidence.md).

To reproduce the four-detector comparison on separate synthetic plantings, run `node benchmark/studies/paired-evidence.mjs`. It also calibrates tomato on separate fields and evaluates the frozen cutoff on fresh plantings. [Study design and results](docs/evidence.md)

## Run a paired experiment

Write settings into a local JSON file. This example uses the default settings. The optional validationSensorMode override is described below.

```json
{"crop":"lettuce","seed":27,"trainFields":6,"valFields":3,"epochs":40,"model":"neural","sensorMode":"mixed","minimumHeight":0.035,"threshold":0.5}
```

1. Save this as control.json. Run `node cli/run.mjs train control-27.json control.json`.
2. Copy the settings to variant.json and change just minimumHeight to 0.065. Run `node cli/run.mjs train variant-27.json variant.json`.
3. Repeat both configurations at a fresh seed. Use new output filenames. Compare meanF1, each scores entry, and the same seed and ground setting in tiles. For each tile, stages15cm shows losses before classification, after the selected score cutoff and after spacing.
4. Report the direction and size of the difference on each seed, wall time if measured, and which stage explains the change. The two ground variants share one field and belong in the same split.

Valid settings include 2–256 training fields, 1–128 validation fields, 1–100,000,000 epochs in Training shed and the CPU runner, unsigned 32-bit seeds, neural or linear, mixed sampling or any exact scanner key in trainer/generator/sensors.js, and 0.035 or 0.065 metres for minimumHeight. The optional threshold accepts a number from 0 through 1 and defaults to 0.5, including when replaying older settings. It applies to validation after fitting. Crop keys are lettuce, artichoke, tomato, apple, grapevine, bench-lettuce and high-wire-tomato. Omitting minimumHeight selects the crop default (0.035 m for lettuce and 0.065 m for artichoke and tomato). Large runs can take substantially longer. Browser report times include generation, optimization and validation. Use training-set normalization for every validation tile.

For a browser benchmark, open `/benchmark/`, select the crop, scanner and first seed, and run the comparison. Model, backend, epoch and cutoff comparisons share one dataset per seed. Training density builds a separate dataset for each training budget and pairs the held-out tiles. Expand **Scores at each matching distance** to see which pins matched, which were extra, and which plants were missed. Use **Link to these settings** after a run to open the same setup on another browser. The JSON includes this URL, timings and tile IDs. A localhost link uses the local server address. GPU rows include available adapter metadata. A software adapter exercises WebGPU kernels on the CPU. Record the device separately when reporting a physical GPU timing.

To isolate the score cutoff, select **Detection score cutoffs**. This fits one CPU neural network per seed and scores the same weights and fields three times. Group the JSON rows by seed and threshold. Each group of three shares the generation and training costs. For a follow-up, pass the desired threshold in CLI settings and check the precision and recall change on fresh fields.

For the cutoff, model and backend comparisons, **Epochs per fit** sets the training budget for every contender. Links without an epoch setting use 40. For example, open `/benchmark/?comparison=cutoffs&crop=artichoke&seed=621&epochs=100`. Under **What changes from the 0.50 cutoff?**, change the match distance to see the differences in matched plants and extra pins. Click a cutoff in Results to replay that CPU fit in the Training Shed. The replay preserves the cutoff, epoch count, crop, seed and scan layouts.

To compare plant coverage, use `cutoffDistance=7.5`, `10` or `15` on the cutoff benchmark URL. The return-count table pools both dataset seeds, using one soil-present scan per validation planting. For a local replay, group the exported rows by threshold, flatten their soil-present tiles, and call `coverageAtDistance(tiles, cm)` from `trainer/models/data.js`. Each group reports its labeled and matched plant counts. The helper also returns the number of extra pins across the selected scans. Tile order can differ between runs. Check the tile ID sets across cutoffs, divide matched by labeled plants for recall, and leave an empty group’s rate undefined. Earlier reports without `missedByCoverage` require a replay for this table.

To compare cutoffs at two training durations, run the same seed pair at 10 and 100 epochs. Check that both reports have the same tile IDs and field seeds. Within each report, all three cutoff rows for one seed share their fit and training time. Compare the change from 0.50 to 0.65 separately at each duration. Use a fresh seed pair to see whether the result repeats.

### Compare peak heights on identical raw scans

Open `/benchmark/?comparison=heights&crop=tomato&seed=2021&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000`. Run both heights, download the JSON and repeat with first seed 2051 for another pair. The Peak scout question uses the first seed’s soil-present extra-pin counts at 15 cm.

1. Pair rows by seed and read each row’s `minimumHeight` in metres. Compare the tile IDs in `datasets[row.datasetIndex].recipeManifest` for **both** splits. Each height rebuilds the training examples, fits its own scaling parameters and trains its own neural weights.
2. For each soil-present tile, inspect the proposals entry in `stages15cm`. Its count is the number of candidate peaks and its matched count is the maximum possible one-to-one matches before classification. Compare with the final true positives and false positives. Use the scores table for all three matching distances across both soil settings.
3. Select a height in Results to repeat that fit in the Training Shed. Set `minimumHeight=0.035` or `minimumHeight=0.065` in a model or backend benchmark URL to hold the height fixed for that comparison.

To audit plants gained and lost, open **Which plants changed match when the peak height dropped?** or call `compareMatchedBoxes(tallTile, shortTile, cm)`. Pair rows by seed and minimum height, then pair tiles by exact ID. `firstOnly` contains the zero-based box IDs lost at the shorter height and `secondOnly` contains the IDs gained. For each tile, check that gains minus losses equals the shorter fit’s TP minus the taller fit’s TP. Count extra pins separately using `secondFP - firstFP`. Sum soil-present tiles once per planting to reproduce the cross-field summary. Use **Link to this inspection** to share the benchmark URL with its dataset seed (`pairSeed`), exact tile ID (`pairTile`), distance in centimetres (`pairDistance`) and optional changed box index (`pairBox`). After the benchmark runs, the panel opens if the tile exists and selects the box if it differs between the fits at that distance. [Replay the lettuce comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=heights&crop=lettuce&seed=2121&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000)

To repeat the test at two validation densities, open **Try an experiment → Test shorter peaks on sparse tomatoes** in Benchmark. Complete the first run, follow the other validation-budget link in the same tab, and run again. The second report includes `pairedValidation.rayBudgets` and `pairedValidation.rows` when the run at the other budget matches. Each row records the dataset seed, peak height in metres, mean F1 at 12,000 rays (`sparse`), mean F1 at 60,000 rays (`dense`) and their minimum (`lower`). Mean F1 includes both soil variants and all three distances. Keep both full reports for per-distance scores and timings. When comparing files on another machine, use `densitySnapshot` and `pairDensityScores` from `benchmark/density.js` to check compatibility. Raw validation tile IDs can change with the ray budget. Training tile IDs and validation recipes apart from their ray counts must agree.

### Pair scanner layouts on identical plantings

Set `sensorMode` to the training layout and `validationSensorMode` to the layout to score. Omitting the second key uses the training selection for validation, including for older settings files. Both accept `mixed` or any key in `trainer/generator/sensors.js`. For a scanner comparison:

1. Use seed 211, a mixed training layout and the reference validation grid. Copy the settings and change just `validationSensorMode` to `os1-64`.
2. Run both with the CLI. Check that training tile IDs, scaling parameters and CPU weights match. Pair validation tiles by field seed and ground setting. Each layout has its own tile ID. The manifest records each tile’s recipe and final return count.
3. Repeat at seed 212. Compare mean F1 and the matched-plant counts before the score cutoff and after spacing. For a detector-training comparison instead, keep validation scans fixed and change only the training layout.

The browser benchmark exports both layout selections when validation is overridden. Its replay link restores the selection. The training shed’s field audit opens each scored validation tile in the 3D viewer with the original crop, scanner, field seed and ground setting.

### Share or verify a generated scan

From the 3D viewer, copy the scan link after generating. For a validation tile, follow its viewer link from the field audit or benchmark. A generator URL takes the field seed under `seed`, scanner key under `sensor`, and ray count under `budget` (0 selects the seed's budget). Use `ground=true` or `false`, `noise=seeded|clean|rough`, and `weeds`, `sticks`, `boards` each set to `seeded|on|off`. The optional `tile` value is the expected 16-digit hexadecimal tile ID. For a shareable field, use the GitHub Pages base URL. The page rebuilds the scan locally.

To verify reproducibility, open the link in a fresh browser, compare the tile ID and download the PLY and labels. Compare files from the same generator revision byte for byte. To reproduce a model score, use the benchmark URL or training settings as well as the field link. The training run's dataset seed selects multiple field seeds.

### Change held-out ray density

Use `validationRayBudget` in CLI settings or browser trainer and benchmark URLs. Omit it or set it to 0 for the original seeded budget. Fixed values are 12000, 30000, 60000, 100000, 262144, 500000 and 1000000. A fresh Field generator opens at 262144 rays. Use Reference to sample all one million rays on a 10 m plot. Hardware-inspired layouts stop at their own channel × column capacity. Training recipes use seeded budgets by default. To change training density independently, set `trainingRayBudget` to the same numeric values or to the string `"alternating"`. Alternating starts at 12000 for even dataset seeds and 60000 for odd seeds and switches budget with each training planting. Both soil variants share the planting’s numeric `recipe.points`. Both settings travel in trainer and benchmark links and JSON exports. In the Training shed, expand **Scanner and ray budgets**. To test density matching, fix the training and validation layouts to `os1-64`, keep validation at 12000 rays, and compare 12000 with 60000 training rays on seeds 1221 and 1222. Verify identical held-out tile IDs and report training sample counts in each arm. To repeat the density experiment, choose mixed training, `validationSensorMode: "os1-64"`, seed 721 and compare validation budgets 12000 and 60000. Repeat at seed 722.

Check training tile IDs, CPU weights and scaling before comparing the runs. Match held-out tiles by field seed and ground flag. The manifest's `recipe.points` is the request, `sampledRays` is the number sampled before scan noise, and `returnCount` is the final XYZ count. Stray returns can increase the final count. Capped layouts can produce identical scans and tile IDs for two requests above capacity. The OS1-32 preset caps a 100000-ray request at 16384 samples. Use the per-tolerance scores and stage audit to tell a missing peak from a rejected candidate.

### Replay the paired training-density benchmark

Open `/benchmark/?comparison=density&crop=artichoke&seed=1321&sensor=os1-64&validationRayBudget=60000`. Each seed gets two CPU neural fits. The first seed trains at 12000 and 60000 rays and the second reverses that order. Use the repeat link below the sample counts to change validation density while keeping the fits reproducible.

Add `includeMixed=1` to include a third CPU fit alternating 12000 and 60000 rays across the same six plantings. The second seed reverses all three fits. To assess performance across densities, run with `validationRayBudget=12000`, then follow the 60000 repeat link and rerun in the same tab. The table pairs the current result with the last fixed 12k or 60k density result in session storage when the fit settings, training tiles and held-out planting recipes agree. It shows both scores and their minimum for each seed and training budget. Each run exports independently even with browser storage disabled.

In the JSON, read each budget from `row.trainingRayBudget` and join the row to `datasets[row.datasetIndex]`. For one seed, compare validation entries of all contenders’ recipe manifests by tile ID. Read the balanced example count from `stats.samples` and the sampled rays per scan from each training manifest entry. A capped scanner can return the same count for two requested budgets. When replaying on the CLI, use the shared crop, layout and validation settings plus the individual row’s seed, epochs, training budget and cutoff. Earlier report formats with one dataset per seed can be joined by seed.

### Audit missing crop returns

In each validation tile, `coverage.zero`, `coverage.oneToFour` and `coverage.fiveOrMore` count plants by their surviving crop returns. The values sum to the number of labeled plants. For per-plant detail, open the exact tile in the generator and download Labels. Entry `crop_returns_per_box[i]` counts returns from `boxes[i]`. Earlier label files omit this array. Regenerate their recipe to compute coverage.

For a paired run, start with tomato seed 921, mixed training and OS1-64 validation. Compare budgets 12000 and 60000 and repeat at seed 922. Group by field seed, using soil-present tiles to count each planting once. Soil removal drops only soil and leaves these counts intact. At 15 cm, `max(0, fn - coverage.zero)` is a lower bound on misses that had crop returns. This bound also works on older reports that only have aggregate coverage. Coverage comes exclusively from generator bookkeeping and is excluded from all 13 detector inputs.

### Find the exact missed plants

In the Training Shed, run the detector, choose **Missed plants** in the field map, and select a matching distance. **Highlight a missed plant** lists the zero-based box index, center coordinates in metres and crop return count. Filter **Crop returns per plant** to show the missed count and total labeled plants in a coverage group. To replay this view, append `missBand=zero`, `oneToFour`, `fiveOrMore` or `all` to the trainer query. Select a box, follow the 3D link, and choose **Focus plant** or press **F** with the canvas focused to orbit the highlighted center. **R** resets the camera.

In a CLI report or browser benchmark row, find the tile by `tile_id`, then select `missesByTolerance` by `cm`. Each `boxIndices` entry indexes `boxes` and `crop_returns_per_box` in that tile’s generator label download. Its length equals the corresponding false-negative count. `withCropReturns` counts the missed boxes that have one or more returns. For each return group, divide `missedByCoverage[group]` by the same tile’s `coverage[group]` to get its miss rate. An empty group has no rate. Pool numerator and denominator separately across soil-present tiles to count each planting once. For reports with box indices but no group counts, regenerate the tile and group the missed indices by `crop_returns_per_box`. Reports predating box indices require rescoring for an exact breakdown.

For an individual miss, select the box in the field map and read the close-up. To reproduce it from JavaScript, call `nearbyPeaks(validation.previews.get(tileId), boxIndex, cm)` from `trainer/models/data.js` after `validateModel`. The arrays `proposals`, `accepted` and `selected` contain XY coordinates in metres inside the inclusive matching distance. `bestScore` is the highest unrounded score among those proposals, or `null` if none exist. The previews live in memory. Rebuild a saved run from its settings to inspect one. To check whether a lower cutoff recovered a box, compare its membership in the two missed-index lists.

To compare cutoffs, check the weights and tile IDs, then take the set difference between the two missed-index lists for the same tile and distance. This gives the boxes that gained or lost a match under the scorer’s assignment. A pin can be close to two labels. The scorer chooses a deterministic maximum-cardinality assignment and can reassign a pin to fit another match.

### Compare the same field with and without soil

Each completed Training Shed or CLI report includes `byGround`. Each benchmark row includes it too. Select the group by its boolean `ground` flag and the score by its `cm` value. The scorer pools matched plants, extra pins and misses across that group's tiles before computing precision, recall and F1. Earlier reports contain the underlying counts in `tiles[].byTolerance`.

For an example, train artichoke on seed 308 with the defaults. Subtract ground-present recall from ground-removed recall at 15 cm and multiply by 100 for percentage points. Check the false positives at the same distance. To investigate a specific field, pair tiles by seed and switch soil settings in the field audit. Each pair shares one planting, its labels, scan layout and fitted weights. Report the number of distinct validation fields. Synthetic soil removal uses generator class labels.

To compare counts, open the Training Shed with `soilMetric=meanAbsolute` or `meanSigned`. An explicit selection opens the soil table after training. Choose a planting seed to open its soil-present scan. **View without soil** generates the paired tile from the applied recipe, keeps the camera and box selection, and updates the download and sharing controls. Pending edits to other generator settings take effect with **Grow and scan**. Toggle back to verify the original tile ID.

In reports, compare `byGround[].countError.meanAbsolute` for the two ground flags. A negative change (removed minus present) means more accurate counts. For a planting, pair the two tiles by field seed and compute `abs(fp - fn)` per tile at any tolerance. Use signed error to distinguish an undercount from an overcount. Keep model and dataset seed in the grouping key when comparing exported runs. [Replay lettuce seed 1652](https://mvalancy.github.io/crop-trainer/trainer/?crop=lettuce&seed=1652&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000&engine=cpu&soilMetric=meanAbsolute)

### Check whether a model gain holds across plantings

Open the CPU model benchmark, choose a crop and seed, then expand **Compare contenders on each planting**. For automation, each benchmark row includes `byField`. Match rows by dataset seed and model name, then match their field groups by field seed. Contender execution order reverses on the second dataset seed. Check that the two sets of tile IDs are identical before comparing models.

For each planting, the scorer adds TP, FP and FN from both soil variants at each distance, computes F1, then averages the three F1 values for `meanF1`. The overall score pools counts across all validation scans first. Count field-level wins, losses and ties using the exported precision, and report the pooled score separately. The CLI and Training Shed also export `byField`; older reports can be reconstructed from `tiles`.

### Measure plant-count error

For a paired counting experiment, open `/benchmark/?comparison=models&crop=artichoke&seed=1551&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000&fieldMetric=meanAbsolute`. Under **Compare contenders on each planting**, choose absolute or signed error. The table shows the average for each planting’s two scans and the average for each dataset seed. The settings link remembers the displayed metric.

Read `countError.meanAbsolute` and `countError.meanSigned` in each benchmark row, CLI or Training shed result. The same object appears in each `byField` and `byGround` group. Units are plants per scan. For older reports, reconstruct each scan's signed difference as `fp - fn` from any entry in `tiles[].byTolerance`. Average the absolute differences for mean absolute error. Taking the absolute value after averaging lets overcounts and undercounts cancel. Compare scorers on identical tile IDs and include per-distance F1 to assess localization.

### Trace a model disagreement to a plant

Run `/benchmark/?comparison=models&crop=lettuce&seed=1121&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000`. Open **Which plants did each model find?** The scan picker includes both soil variants for each dataset seed. Choose a distance and one of the boxes exclusive to either model. Follow the 3D link to inspect the highlighted center.

For a local agent, import `compareMatchedBoxes` from `trainer/models/data.js`. Pair the logistic and neural rows by dataset seed, and their tiles by `tile_id`. Call `compareMatchedBoxes(logisticTile, neuralTile, 15)` on reports containing `missesByTolerance`. The result includes counts `both` and `neither`, zero-based box index arrays `firstOnly` and `secondOnly`, and extra pin counts `firstFP` and `secondFP`. Row order reverses on the second seed. The helper takes distances in centimetres. Sum both shared counts and the two array lengths to recover the label count. For earlier reports, reproduce the run to obtain the assigned box indices.

A generator URL can include `box=0` or another zero-based box index. Include the matching `tile` value when building links from a report. This prevents a stale tile link highlighting an unrelated plant. Box highlighting affects only the camera overlay and shared URL.

### Compare two scans on one planting

In the field generator, expand **Compare two scans of this field**. Choose **Ray budget** to vary density on the displayed layout, or **Scan layout** to scan the same planting with 60,000 reference-grid rays and 60,000 simulated OS1-64 rays. Select a marked plant to open it in either 3D scan. The downloaded JSON records each full recipe, tile ID, actual sampled rays, per-plant returns, matched proposals and scored pins. The map can show up to 9,000 example points per scan. All acquired points enter scoring. The apple option includes a geometric base locator. Replay the multi-field studies with `node benchmark/studies/seedling-density.mjs` and `node benchmark/studies/orchard-bases.mjs`. [Seedling results](docs/seedling-density.md) · [Orchard results](docs/orchard-bases.md)

Choose **Height pin · sampled cells only** on the maps to inspect another height detector. Its kernel omits empty cells and still counts a measured zero-height return. Compare extra pins as well as matches. The soil-only check can be replayed with `node benchmark/studies/seedling-peaks.mjs`. [Measured peak and soil examples](docs/seedling-peaks.md)

### Replay a model trained with a different peak rule

Open `/benchmark/?comparison=averaging` to refit on the same scans using both rules. Each fit gets its own candidate examples, normalization and weights. In Training Shed, the advanced peak-averaging control applies to training, validation and downloaded weights. Preserve `peakAveraging: "occupied"` in custom settings when replaying the sampled-cell rule. The standard weight schema is `crop-peak-13-v1`. Sampled-cell weights use `crop-peak-13-occupied-v1`. The Field Test import reads the schema before extracting peaks. [Seedling classifier results and soil controls](docs/seedling-peaks.md#can-training-reject-the-extra-soil-peaks)

### Compare training duration

Open `/benchmark/?comparison=epochs&crop=artichoke&seed=551`. Each seed generates one dataset. Three neural fits start from the same initial weights with the same examples, scaling, learning rate (0.25) and score cutoff (0.50). Each fit runs from scratch so its training time covers its entire duration. The second seed runs the budgets in reverse order.

Group exported rows by `seed` and `epochs`. Read the duration from the row. The report's shared settings omit a single epoch value for this comparison. `trainingLoss` is the loss on the final pass before its update, while `scores` use the updated weights. For a CLI replay, copy the crop, layouts, field counts and peak height from `settings`, then set the specific row's seed and epochs in your settings JSON. Check the tile IDs and per-tolerance counts. In the browser, clicking the epoch count opens the matching Training Shed setup on CPU.

### Train on one growth stage and score on another

Set `plantForm` to the training form and `validationPlantForm` to the held-out form. Omitting the latter uses the training form on both splits. The browser benchmark’s **Does mixing plant forms during training help?** comparison trains one detector on a named form and one on a seeded mix. Both score the same held-out tile IDs. For the fixed clean tomato study, run `node benchmark/studies/tomato-stage-training.mjs`. [Measurements and replay](docs/tomato-stage-training.md)

## Where to change the app

| File | Role |
| --- | --- |
| trainer/generator/crops.js and trainer/generator/sensors.js | Crop shapes, default peak heights and duplicate spacing, plus shared scanner layouts. |
| [app/viewer.js](app/viewer.js) | Interactive XYZ orbit camera, pan, zoom, touch and keyboard controls. |
| benchmark/main.js | Two-seed paired CPU/WebGPU and model comparisons with timing and scoring export. |
| trainer/generator/field.js | Generates original plant surfaces, synthetic XYZ returns and plant boxes. Coordinates use metres. |
| trainer/models/data.js | Assigns split-specific field seeds, finds height peaks, extracts 13 features, balances examples, standardizes inputs, filters duplicate pins and scores matches. |
| trainer/models/model.js | Linear logistic baseline, including CPU and WebGPU implementations. |
| trainer/models/neural.js and trainer/models/network.js | Dense network layouts, seeded weights, CPU backpropagation, shape-specific WebGPU kernels and exported-weight inference. |
| trainer/ui/sandbox.js and trainer/models/fit-worker.js | Visual network editor and background CPU fitting. |
| trainer/main.js | Training form, backend selection, progress, per-field maps and JSON export. |
| [app/farm.css](app/farm.css) | Shared navigation, forms, responsive layouts, viewer, and score tables for all three app pages. |
| [app/farm.js](app/farm.js) | Seeded farm preview, scan and label downloads, and local mission stamps. |
| cli/run.mjs | Dependency-free local server and CPU experiment entry point. |

A training candidate within 9.5 cm of a label is positive. A candidate beyond 15 cm is negative. The trainer skips intermediate distances. Labels enter training and scoring. Candidate features come solely from XYZ. Evaluation uses one-to-one horizontal matching at 7.5, 10 and 15 cm, pools counts across tiles and averages the three F1 scores equally. Keep validation comparisons separate from claims about physical farms.

## Example request for Gemini or another agent

“Read AGENTS.md. Run the neural model at both supported peak heights on seeds 27 and 28 with the other defaults fixed. Show mean F1, precision and recall at 15 cm, and the field with the most lost matches. Explain which setting you would test next.”

## Sharing changes

Use synthetic fixtures for examples and tests. Keep raw scans, third-party labels, private weights, credentials and generated run reports out of commits. Check the affected browser flow, run the Node tests, and preserve the MIT notice with redistributed source. The README title illustration is in art/title.svg.
