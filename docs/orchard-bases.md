# Can a scan locate the base of an apple tree?

![An overhead scan projected into profile shows abundant crown returns from two tree shapes at the same planting position. The low central search region contains zero woody returns for the central leader and two for the open vase.](../art/orchard-bases.svg)

Stand at the foot of a tree and its base is easy to define. The highest branch can be well off to one side. A detector that pins that branch can get the tree count right and miss the surveyed location. Crop Trainer’s apple target is the horizontal position where the tree was planted. A pin must fall close enough to that position to count as a match. [Apple generator and reference photographs](../trainer/plants/apple.md)

## How much of the low trunk did the scanner see?

The figure shows the third tree from synthetic plot `876019`, rendered with two healthy, leafy tree shapes and 60,000 overhead reference rays. Each panel projects crop returns within 90 cm horizontally of the same base onto a side view. The height reference is the bottom of that tree’s modeled bounding box. The shaded strip marks the height and horizontal extent of the search below. The calculation also limits distance along the depth axis that disappears in this projection.

We counted how many trees had **at least one woody return** within 10 cm horizontally of the labeled base and 10–55 cm above the box bottom. This diagnostic uses the simulator’s wood labels to check visibility. A scanner in a physical orchard would need its own way to distinguish a stem from a stake or a weed.

| Rays per 10 m × 10 m plot | Leafy central leader | Dormant central leader | Leafy open vase | Dormant open vase |
| --- | ---: | ---: | ---: | ---: |
| 12,000 | 3 / 38 | 7 / 38 | 9 / 38 | 9 / 38 |
| 60,000 | 10 / 38 | 15 / 38 | 26 / 38 | 26 / 38 |

The comparisons use the same 38 planting positions across three seeds, `876019`, `876137` and `876437`. Ground was present. Added weeds, sticks, boards and scan noise were disabled. At 60,000 rays the leafy open-vase plots had more direct evidence near the low trunk, but 12 bases still had none. A visible crown gives a detector another cue. A guess from the crown still needs an independent base label to establish its accuracy.

Run `node benchmark/orchard-visibility.mjs` from the repository root for the table totals and the number of nearby woody returns at each planting position. [Visibility experiment](../benchmark/orchard-visibility.mjs)

## How the detectors place a pin

The starter network scores local height peaks and filters nearby pins. For apples it was trained to recognize peaks close to known planting bases. Its inputs and candidate locations still depend on where the canopy has a local maximum. [How the network works](training.md)

The geometric challenger reads metric XYZ in a ground-referenced 10 m square. It marks occupied 5 cm cells in five height bands starting at 0.48, 0.78, 1.12, 1.55 and 2.04 m. A candidate gets support from several heights nearby and from canopy on multiple sides. Candidates with an index of at least 4 compete for a pin, at a nominal minimum spacing of 1.05 m before final position refinement. The score is a geometric index. Regions with too little support receive no pin. This method needs no stem classifications, tree count, planting grid or surveyed bases at prediction time. Its lowest band starts above most of the region in the visibility audit. [Locator implementation](../trainer/orchard.js)

## What changed on held-out synthetic trees?

On six new plots the geometric locator matched **1,113 of 2,112 tree appearances** within 15 cm, with 483 extra pins. That gives 69.7% precision and 52.7% recall. A four-unit network trained on both leafy and dormant examples matched 227. Even the geometric locator missed nearly half the appearances. [Reproducible benchmark](../benchmark/orchard-bases.mjs)

| Method | F1 at 7.5 cm | F1 at 10 cm | F1 at 15 cm | Mean absolute count error per scan |
| --- | ---: | ---: | ---: | ---: |
| Spaced height peaks | 0.056 | 0.072 | 0.097 | 19.69 trees |
| Starter network, leafy training | 0.008 | 0.011 | 0.026 | 20.11 trees |
| Same network, broader training | 0.031 | 0.039 | 0.056 | 19.99 trees |
| Geometric orchard locator | 0.349 | 0.464 | 0.600 | 2.84 trees |

F1 pools one-to-one matches over the 192 scans. Count error is the average absolute difference between predicted and planted totals. A misplaced pin can cancel a missed tree in the count while still failing to locate either base accurately.

Both networks used the same 13 inputs, four tanh units and 40 training epochs. The starter used six healthy, leafy fields with a grid scan. The second used 12 fresh fields with both canopy states, mixed damage and different layouts. Several training conditions changed together. The locator’s geometry and cutoff were chosen on three separate development seeds. Every method then received exactly the same XYZ from six new seeds. Those plots contained **66 distinct trees**. The 32 variants per planting crossed two forms, two canopy states, two damage states and four capture conditions.

The locator’s 15 cm F1 fell from **0.631 to 0.297** when the noisy, cluttered ring layout went from 30,000 to 12,000 rays. With the clean 30,000-ray reference grid it reached 0.735. These layouts sample the highest visible surface from overhead. A hardware-inspired ring pattern changes where those samples land. A scanner traveling beside a row sees the tree from a different angle.

In the generator, compare 12,000 and 60,000 rays on the leafy central-leader plot in the figure. Choose **Compare scans** and inspect plant 2. Switch between **At least one crop return** and **Orchard base pin · 15 cm** to see whether visible foliage led to an accurate base estimate. [Compare both ray budgets on the same orchard](https://mvalancy.github.io/crop-trainer/?crop=apple&sensor=reference&seed=876019&plantArchitecture=2&plantForm=central-leader&plantCondition=healthy&appleCanopy=leafy&noise=clean&weeds=off&sticks=off&boards=off&studyLow=12000&studyHigh=60000&studyMetric=orchard&studyBox=2#scan-study)

To try your own scan, choose apple weights in the Training shed’s **Field test**, load a ground-referenced PLY and run **Find plants**. Switch **Show pins from** to **Orchard base locator**. Add surveyed centers to compare all three methods available in the browser. [Open the Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

To replay all four benchmark methods, run the following command from the repository root. The JSON includes seeds, recipe settings, timings and per-scan counts at all three distances.

```sh
node benchmark/orchard-bases.mjs > orchard-bases.json
```

## What a field test would have to establish

AppleQSM used terrestrial laser scans and processed individual apple trees to extract trunk and branch characteristics. The study covered 84 trees from two cultivars. It motivates looking for woody structure when the application needs a trunk location. Its scan geometry, task and evaluation differ from locating all bases in a single overhead plot. [Qiu and colleagues, AppleQSM](https://pubmed.ncbi.nlm.nih.gov/38721548/)

For a physical trial, survey every base in held-out rows independently of predicted pins. Record ground reference, acquisition viewpoint, foliage state, training system and spacing. Test trellis posts, weeds and adjacent crowns as possible sources of extra or misplaced pins. Report precision, recall and F1 at the required distance alongside count error. A row-side scan can reveal wood behind the crown and can lose the far side of a trunk behind a post. Register it to the same survey before comparing it to an overhead scan. [Field validation protocol](field-validation.md) · [Orchard data and licensing](field-datasets.md)
