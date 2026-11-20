# Two detectors, one field

![Two copies of the same planting. One detector misses a plant and the other drops an extra pin.](../art/paired-field.svg)

Which detector would you trust to count a row? Open the benchmark, choose a crop and run the model comparison. Both models see the same seeded fields. In the results, pick one plant that only one model found and inspect its patch of dots. [Open the benchmark →](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=models)

| If you want to… | Start here |
| --- | --- |
| Understand timing, precision, recall and F1 | [How to read a benchmark](../docs/benchmarks.md) |
| Change a comparison in the browser | [Benchmark controls](index.html) · [Experiment runner](main.js) |
| Pair results from two different ray budgets | [Density comparisons](density.js) |
| Reproduce a synthetic experiment locally | [Paired CPU experiment](paired-evidence.mjs) · [Measured results](../docs/evidence.md) |
| Test synthetic weights on surveyed vines | [Vineyard replay and results](../docs/field-datasets.md#replay-the-vineyard-test) · [Scan preparation](prepare-vineyard.mjs) |

[Crop Trainer home](../README.md) · [Inside the training shed](../trainer/README.md)
