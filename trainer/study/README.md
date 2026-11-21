# Compare two scans of one planting

![Two sets of predicted pins are matched to the same reference centers.](../../art/paired-field.svg)

Grow a field, expand **Compare two scans**, then choose what to vary. You can adjust ray budgets, change the scan layout, or compare intact and damaged apple scaffolds. The scaffold-width comparison uses v3 and v4 of the same apple planting. These comparisons give each scan its own ID and link to the 3D viewer. [Open the comparison](https://mvalancy.github.io/crop-trainer/#scan-study)

Choose **Tree-base pin spacing** on an apple scan to compare two detector settings on exactly the same points. Pick a tree and zoom both maps to see the 15 cm match circle and its nearest pin. The inspector shows how many nearby cells qualified and how many survived spacing. The results download includes those counts, each match and the time spent generating and scoring each arm. [Try two measured examples](../../docs/orchard-bases.md#does-shorter-pin-spacing-recover-the-missed-bases)

**Tree-base ranking** tries two ways of ordering possible tree bases on one point cloud. Cyan squares mark low returns. Pick a tree to see which squares earned a bonus and how far the nearest pin moved. [Replay a recovered tree and a tree beside a board](../../docs/orchard-ranking.md#try-it-on-one-tree)

| To change | Open |
| --- | --- |
| The paired recipes, candidate peaks, returned points and detector scores | [Study analysis](scan-study.js) |
| Generation and scoring updates for each arm | [Study worker](scan-study-worker.js) |
| Selectors, result tables, export and shareable links | [Study controls](scan-study-ui.js) |
| Point-cloud drawing and plant selection | [Study map](scan-study-map.js) |

The simulator records the plant each return hit. A detector sees XYZ and must infer where to place a pin. Compare **At least one crop return** with a pin overlay on a plant that was missed. [Seedling experiment](../../docs/seedling-peaks.md) · [Orchard experiment](../../docs/orchard-bases.md)
