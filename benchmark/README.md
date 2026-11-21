# Two detectors, one field

![Two copies of the same planting. One detector misses a plant and the other drops an extra pin.](../art/paired-field.svg)

Open the benchmark, pick a crop and select **Run benchmark**. The first question compares two models on your CPU. They see the same training examples and test scans. [Run the first comparison →](https://mvalancy.github.io/crop-trainer/benchmark/)

Read the result at 15 cm. How many planted centers did each detector find, and how many extra pins did it place? A higher average F1 can come with more extra pins. Expand **Which plants did each model find?** to inspect one difference in 3D. To repeat the test on new plantings, change **First seed** under **Seeds, training and scan settings**.

| If you want to… | Start here |
| --- | --- |
| Understand timing, precision, recall and F1 | [How to read a benchmark](../docs/benchmarks.md) |
| Change a comparison in the browser | [Benchmark controls](index.html) · [Experiment runner](main.js) |
| Pair results from two different ray budgets | [Density comparisons](density.js) |
| Reproduce a synthetic experiment locally | [Paired CPU experiment](paired-evidence.mjs) · [Measured results](../docs/evidence.md) |
| Find out when a seedling becomes detectable | [30k vs 1M rays on one planting](https://mvalancy.github.io/crop-trainer/?crop=tomato&plantArchitecture=2&plantForm=seedling&sensor=reference&seed=216917&noise=clean&weeds=off&sticks=off&boards=off&studyLow=30000&studyHigh=1000000#scan-study) · [CPU benchmark](seedling-density.mjs) · [Six-plot results](../docs/seedling-density.md) |
| Compare a canopy peak with a tree-base estimate | [Apple study](../docs/orchard-bases.md) · [Detector benchmark](orchard-bases.mjs) · [Trunk visibility check](orchard-visibility.mjs) |
| Compare crop forms and plant damage | [Run the CPU comparison](plant-forms.mjs) · [Seven-crop results](../docs/crop-form-benchmark.md) |
| Test synthetic weights on surveyed vines | [Vineyard replay and results](../docs/field-datasets.md#replay-the-vineyard-test) · [Scan preparation](prepare-vineyard.mjs) |

[Crop Trainer home](../README.md) · [Inside the training shed](../trainer/README.md)
