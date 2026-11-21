# Local play and agent experiments

Use Node.js 22 or newer. You can also [download a ZIP of the app](https://github.com/mvalancy/crop-trainer/archive/refs/heads/main.zip) and unzip it before running the server from its folder. The browser app and CPU runner have no package dependencies.

```sh
git clone https://github.com/mvalancy/crop-trainer.git
cd crop-trainer
node run.mjs serve
```

Open **http://127.0.0.1:4173/**. For headless CPU experiments and tests, run:

```sh
node --test
node run.mjs train first-harvest.json
```

The CPU command defaults to the fixed 40-epoch Quick check. In the browser, the first run spends about 30 seconds fitting. A timed run exports the number of epochs actually completed.

Use **Download run settings** in the training shed to replay a browser experiment on another computer. For example, a completed seed 27 run exports its settings as `crop-settings-27.json`. Put that file beside `run.mjs` and run `node run.mjs train replay.json crop-settings-27.json`. The model trains from scratch on the same synthetic fields.

A browser run can use WebGPU on a supported adapter over HTTPS or localhost. Generation and validation use the CPU. The agent guide includes the full settings schema, a paired experiment, and a prompt for Gemini or another local coding agent. [AGENTS.md](../AGENTS.md)

## Data and license

Every field, label and point cloud in the app is generated procedurally on demand. All source code and the original SVG artwork are released under the [MIT License](../LICENSE).

[Back to the field guide](README.md)
