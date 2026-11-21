# Test saved weights on your own scan

With Node.js 22 or newer you can run the detector on a local point cloud from the repository directory. All inputs stay on the computer. Use **Download model weights** in the Training shed, or fit and export a model with the command below. Supply an ASCII or binary little-endian PLY scan with scalar vertex properties named `x`, `y` and `z`. A generator PLY and its matching labels export make a quick first test.

```sh
node cli/run.mjs train harvest.json --weights weights.json
node cli/score-scan.mjs weights.json plot.ply field-01.json
```

The first command trains the default lettuce detector on synthetic fields using the CPU. To replay a saved browser configuration, supply its settings file before `--weights`. The detailed training report and reusable weights each need a new filename.

The field-test output contains predicted center coordinates, their model scores, the height-only predictions and SHA-256 hashes of the inputs. Each report needs a new filename. An unlabeled scan can show whether the pins look plausible. Measuring detection accuracy takes independent reference centers.

For board setup, a practice run, and the steps from scanner to pins, see [Take a detector to the field](edge-deployment.md).

## Try another cutoff with the same weights

Use `--score-cutoff` with a value from 0 through 1 to change which scored candidates reach the spacing step. Run the comparison on the same weights, scan, centers and coordinate settings. A lower cutoff can recover plants and add extra pins.

```sh
node cli/score-scan.mjs weights.json plot.ply trial-055.json --labels centers.csv --score-cutoff 0.55
node cli/score-scan.mjs weights.json plot.ply trial-020.json --labels centers.csv --score-cutoff 0.20
```

Compare `evaluation.scores` at the same distance. Each trial reports its effective cutoff in `detector.threshold` and the original in `detector.savedThreshold`. The input hashes identify the files used by both runs. Omit `--score-cutoff` to use the value stored in the weights.

## Align a surveyed plot

Use one Z-up, 10 × 10 metre plot. Express its lower-left XY corner and the ground elevation at that corner in the original scan coordinates. The default is metres with origin `0,0,0`. This example uses centimetres, a lower-left corner at (5000, 2000) and ground at Z = 18.

```sh
node cli/score-scan.mjs weights.json plot-cm.ply field-02.json --unit cm --origin 5000,2000,18 --labels centers.csv
```

If the ground slopes across the plot, enter the measured rise along each positive horizontal axis. For example, `--grade-percent 5,-2` means the ground rises 5 cm per metre toward +X and falls 2 cm per metre toward +Y. The percentages work with any input units. The default `0,0` treats the ground as level.

```sh
node cli/score-scan.mjs weights.json plot-cm.ply slope.json --unit cm --origin 5000,2000,18 --grade-percent 5,-2 --labels centers.csv
```

The detector subtracts that ground plane from each Z coordinate before finding height peaks. Crop larger surveys and rotate tilted sensor coordinates into a Z-up frame before import. A single plane assumes a consistent grade across the plot.

Returned `x` and `y` use the scan’s coordinate system. The `localX` and `localY` fields are metres from the supplied origin. Each PLY may contain up to 1 million points and occupy up to 32 MiB.

## Compare with surveyed centers

For a physical plot, record **every plant center in the survey area** independently of the predictions. Give one XY location per line in the scan’s original units. These two surveyed centers fall inside the example plot.

```csv
x,y
5032,2017
5072,2020
```

A header-only CSV describes a surveyed empty plot. Omit `--labels` when you have no survey. For generator scans in metres with XY origin (0, 0), use the matching `.labels.json`. You can change ground Z because the scorer matches horizontal plant centers. Keep the exported tile filenames to let the runner catch mismatched IDs.

The learned detector and height-only baseline receive exactly the same scan, height peaks, crop spacing and reference centers. Each method matches centers one to one at 7.5, 10 and 15 cm. The report gives precision, recall, F1, missed plants, extra pins and signed count error for each method. Undefined rates are JSON `null`. A good result on one plot is evidence for that plot. Repeat on separately surveyed plots and retain the failures when summarizing performance.

[Back to the field guide](README.md)
