![A planted field is scanned twice to repeat an experiment.](../art/seed-replay.svg)

# Run Crop Trainer from a terminal

From the project root, start the browser app with `npm start` or `node cli/run.mjs serve`. The CPU tools work with Node.js 22 or newer and require no installation step.

| To… | Run from the project root |
| --- | --- |
| Train a first detector and export its weights | `node cli/run.mjs train harvest.json --weights weights.json` |
| Repeat a browser run from downloaded settings | `node cli/run.mjs train replay.json settings.json` |
| Find plants in a local scan | `node cli/score-scan.mjs weights.json plot.ply predictions.json` |
| Check that exports, scans and scores replay end to end | `node cli/run.mjs preflight` |

Give each output a fresh filename. The scoring command accepts surveyed locations via `--labels centers.csv`. [Local setup](../docs/local-setup.md) · [Field-scoring options](../docs/scan-cli.md)

To test weights trained with height above nearby low returns and the spread of surrounding heights, run `node cli/run.mjs preflight --feature-mode local-ground`. Add `--peak-averaging occupied` to average over measured cells when locating peaks. Preflight fits a model, exports the weights and checks that scoring each held-out PLY reproduces its training-report matches.

Compare how far an orchard pin moves between two physical scans of the same apple tree using your own copy of LFuji-air. [Compare airflow](../docs/field-datasets.md#do-pins-stay-in-the-same-place-when-the-foliage-moves) · [Compare scanner sides and detector rankings](../docs/field-datasets.md#what-changes-when-the-scanner-moves-to-the-other-side-of-the-row)

With local avocado scans, count hand-labeled wood and leaf returns in two height bands using `node cli/avocado-matter.mjs /path/to/extracted-avocado-dataset`. [Scans, labels and replay instructions](../docs/field-datasets.md#how-often-does-a-low-return-actually-hit-wood)

With your own copy of Crops3D, run `node cli/maize-ground.mjs /path/to/Crops3D_IS/IS` to compare a local surface estimate with visible ground on five maize test plots. [Methods, coordinate assumptions and license](../docs/field-datasets.md#can-a-ring-of-returns-estimate-the-soil-height-near-a-seedling)

Measure missing depth inside the plant masks in a local copy of AgRibotLeafyVeg with `node cli/lettuce-depth.mjs /path/to/AgRibotLeafyVeg`. This command uses ImageMagick to read the masks. [Lettuce depth study and data source](../docs/field-datasets.md#how-much-of-a-lettuce-plant-has-measured-depth)

To repeat a limited training draw locally, download the settings from Training Shed and use them with `node cli/run.mjs train`. The settings can include `"sampleLimit": 600` and `"positiveSampling": "form-soil"`. The run report records how many positive examples came from each form and ground condition. [Paired training experiment](../docs/tomato-soil-sampling.md)
