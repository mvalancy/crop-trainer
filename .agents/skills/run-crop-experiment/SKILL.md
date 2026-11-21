---
name: run-crop-experiment
description: Run or replay Crop Trainer CPU experiments and interpret paired crop detector results.
---

![One seed packet yields the same two rows when the experiment is replayed.](../../../art/seed-replay.svg)

# Run crop experiment

1. Read `AGENTS.md` and the study linked from `docs/README.md`. From the repository root with Node 22+, run `node cli/run.mjs train /tmp/harvest.json` using a fresh output path. Supply a saved settings JSON as the next argument to replay a recipe.
2. State one question. Change one setting, hold the other factors fixed, and rerun on fresh seeds. Check planting identities, soil variants and which split selected the cutoff.
3. Compare matched plants, extra pins and misses at the same distance. Report the seed, sensor, units and scoring distance. Distinguish generated plantings from physical surveys. Trace surprising differences to a tile and include a replay recipe.
4. Use synthetic fixtures in commits. Keep raw field scans, private weights and run reports local.
