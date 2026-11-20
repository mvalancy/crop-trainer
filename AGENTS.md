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

For a browser benchmark, open `/benchmark/`, select the crop, scanner and first seed, and run the comparison. Each seed uses one dataset shared by both contenders. Expand **Scores at each matching distance** to see which pins matched, which were extra, and which plants were missed. Use **Link to these settings** after a run to open the same setup on another browser. The JSON includes this URL, timings and tile IDs. A localhost link uses the local server address. GPU rows include available adapter metadata. A software adapter exercises WebGPU kernels on the CPU. Record the device separately when reporting a physical GPU timing.

To isolate the score cutoff, select **Detection score cutoffs**. This fits one CPU neural network per seed and scores the same weights and fields three times. Group the JSON rows by seed and threshold. Each group of three shares the generation and training costs. For a follow-up, pass the desired threshold in CLI settings and check the precision and recall change on fresh fields.

### Pair scanner layouts on identical plantings

Set `sensorMode` to the training layout and `validationSensorMode` to the layout to score. Omitting the second key uses the training selection for validation, including for older settings files. Both accept `mixed` or any key in `trainer/sensors.js`. For a scanner comparison:

1. Use seed 211, a mixed training layout and the reference validation grid. Copy the settings and change just `validationSensorMode` to `os1-64`.
2. Run both with the CLI. Check that training tile IDs, scaling parameters and CPU weights match. Pair validation tiles by field seed and ground setting. Each layout has its own tile ID. The manifest records each tile’s recipe and final return count.
3. Repeat at seed 212. Compare mean F1 and the matched-plant counts before the score cutoff and after spacing. For a detector-training comparison instead, keep validation scans fixed and change only the training layout.

The browser benchmark exports both layout selections when validation is overridden. Its replay link restores the selection. The training shed’s field audit opens each scored validation tile in the 3D viewer with the original crop, scanner, field seed and ground setting.

### Compare the same field with and without soil

Each completed Training Shed or CLI report includes `byGround`. Each benchmark row includes it too. Select the group by its boolean `ground` flag and the score by its `cm` value. The scorer pools matched plants, extra pins and misses across that group's tiles before computing precision, recall and F1. Earlier reports contain the underlying counts in `tiles[].byTolerance`.

For an example, train artichoke on seed 308 with the defaults. Subtract ground-present recall from ground-removed recall at 15 cm and multiply by 100 for percentage points. Check the false positives at the same distance. To investigate a specific field, pair tiles by seed and switch soil settings in the field audit. Each pair shares one planting, its labels, scan layout and fitted weights. Report the number of distinct validation fields. Synthetic soil removal uses generator class labels.

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
| farm.js | Seeded farm preview, scan and label downloads, and local mission stamps. |
| run.mjs | Dependency-free local server and CPU experiment entry point. |

A training candidate within 9.5 cm of a label is positive. A candidate beyond 15 cm is negative. The trainer skips intermediate distances. Labels enter training and scoring. Candidate features come solely from XYZ. Evaluation uses one-to-one horizontal matching at 7.5, 10 and 15 cm, pools counts across tiles and averages the three F1 scores equally. Keep validation comparisons separate from claims about physical farms.

## Example request for Gemini or another agent

“Read AGENTS.md. Run the neural model at both supported peak heights on seeds 27 and 28 with the other defaults fixed. Show mean F1, precision and recall at 15 cm, and the field with the most lost matches. Explain which setting you would test next.”

## Sharing changes

Use synthetic fixtures for examples and tests. Keep raw scans, third-party labels, private weights, credentials and generated run reports out of commits. Check the affected browser flow, run the Node tests, and preserve the MIT notice with redistributed source. The README title illustration is in art/title.svg.
