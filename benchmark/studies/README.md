# Repeat a field experiment

[![Two detectors place different pins on the same rows of plants.](../../art/paired-field.svg)](https://mvalancy.github.io/crop-trainer/benchmark/)

Does a denser scan see more seedlings? Can a detector still find an apple trunk after a limb breaks? Each study keeps the planting seeds fixed so the two versions can be compared. You can [try a comparison in the browser](https://mvalancy.github.io/crop-trainer/benchmark/) or run a study with Node.js 22 or later.

From the repository root, run this short check to see how often an overhead scan catches wood near a known tree base. It prints JSON with the counts and scan settings.

```sh
node benchmark/studies/orchard-visibility.mjs
```

| Question | Code | How to read the result |
| --- | --- | --- |
| Does training improve on simple height peaks? | [Paired detectors](paired-evidence.mjs) | [Detector comparisons](../../docs/evidence.md) |
| Which plants disappear as scan spacing or crop size changes? | [Seedling density](seedling-density.mjs) · [Canopy size](canopy-size.mjs) · [Plant forms](plant-forms.mjs) | [Sampling gaps](../../docs/seedling-density.md) |
| Where does the detector lose young tomatoes? | [Detection stages](seedling-stages.mjs) · [Peak rules](seedling-peaks.mjs) · [Trained peak rules](seedling-peak-fit.mjs) · [Training by growth stage](tomato-stage-training.mjs) | [Tomato results](../../docs/tomato-stage-training.md) |
| Can nearby heights distinguish a seedling from soil? | [Compare local and absolute heights](tomato-local-ground.mjs) · [Select a cutoff on separate fields](tomato-terrain-cutoffs.mjs) | [Seedling matches and branching-plant precision](../../docs/tomato-local-ground.md) |
| Can a second model pick up short seedlings when soil is visible? | [Training and scoring on lower peaks](tomato-peak-floor.mjs) · [Adding low peaks after the usual detector runs](tomato-low-fallback.mjs) | [Model settings and results](../../docs/tomato-stage-training.md#can-a-second-detector-fill-the-gaps-between-standard-pins) |
| How much can the orchard detector see? | [Trunk visibility](orchard-visibility.mjs) · [Base detection](orchard-bases.mjs) · [Broken scaffolds](orchard-damage.mjs) · [Near-base support](orchard-support.mjs) · [Spacing sweep](orchard-spacing.mjs) · [Low-return ranking and ray density](orchard-ranking.mjs) · [Clutter origins](orchard-ranking-clutter.mjs) · [Board placement and damage](orchard-board-placement.mjs) | [Tree-base results](../../docs/orchard-bases.md) · [Low-return field replays](../../docs/orchard-ranking.md) |
| Do the simulated branches vary enough within a tree? | [Branch measurements](orchard-branch-caliber.mjs) · [Version comparison](orchard-architecture.mjs) · [Shared measurement code](orchard-measurements.mjs) | [Apple dimensions and source measurements](../../trainer/plants/apple.md) |
| How does an incorrect ground height affect a detector? | [Ground-reference test](ground-reference.mjs) | [Field validation guide](../../docs/field-validation.md) |

For a physical scan, the [vineyard preparation script](prepare-vineyard.mjs) takes a separately downloaded survey and prepares a local test strip. The field dataset guide links to the source, license and measured results. [Replay the vineyard test](../../docs/field-datasets.md#replay-the-vineyard-test)
