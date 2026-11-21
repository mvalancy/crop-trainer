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
