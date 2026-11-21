# Can one detector find tomatoes at three growth stages?

![Three young tomatoes grow from a pair of seed leaves into a leafy transplant and then a plant with a branching side shoot.](../art/plants/young-tomato.svg)

In four fresh synthetic plantings, training on a mix of tomato stages cut false detections among branching plants and missed nearly every seedling. On the reference grid, one mixed-stage fit located **415 of 439 branching plants with 19 extra pins**. The seedling-only fit located 98 with 185 extra pins. On the same plantings rendered as seedlings, those models located **0 and 82**, respectively. A single score pooled across stages would hide that tradeoff. [Try the branching-plant comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=forms&crop=tomato&plantArchitecture=2&plantForm=seedling&validationPlantForm=branching&seed=82173&sensor=reference&trainingRayBudget=60000&validationRayBudget=60000)

## Which stage benefits?

Each row pools four confirmation plantings containing 439 labeled plants in total. F1 counts a pin as correct when it matches a plant within 15 cm. Each pair of scores shows the two training seeds, `82173` then `379331`. The height rule ranks the same peaks and uses the same spacing as the trained nets.

| Growth stage | Test scan | Seedling-only training | Mixed-stage training | Height alone |
| --- | --- | ---: | ---: | ---: |
| Seedling | Grid | .270 / .270 | .000 / .000 | .283 |
| Transplant | Grid | .478 / .488 | .731 / .822 | .833 |
| Branching | Grid | .271 / .317 | .951 / .955 | .873 |
| Seedling | Rings | .178 / .175 | .000 / .009 | .182 |
| Transplant | Rings | .557 / .560 | .641 / .710 | .870 |
| Branching | Rings | .352 / .367 | .894 / .907 | .889 |

The initial six plantings (629 plants per stage) showed the same direction for both fits and layouts. Of the 439 confirmation seedlings, only 86 on the grid and 44 on rings had a candidate peak within 15 cm. Both mixed-stage nets rejected nearly all of those peaks. On grid transplants, mixing stages helped relative to seedling-only training, yet height alone scored higher than either fit.

## What went into training?

Each model saw the same six planting seeds and both soil variants at 60,000 reference-grid rays per scan. Each used 13 XYZ features, a standard 6.5 cm peak gate, four tanh hidden units, full-batch SGD at learning rate 0.25, 40 epochs from initialization seed 12345, a 0.5 score cutoff and 22 cm pin spacing. Each training pair used matching recipes for clutter and scan noise. Labels supplied training targets. Each model fitted its feature scale on its own retained training rows.

The normal sampler balances plant and background examples. In the two seedling-only runs it retained 346 and 264 examples. On the mixed plantings it retained 1,974 and 1,878. Repeating each comparison with **exactly 128 positive and 128 negative examples** gave the same direction on all six confirmation conditions for both training seeds.

The mixed fields contained roughly one-third seedlings, but a small seedling seldom produced an eligible training peak. For seed `82173`, seedlings accounted for **197 of 598 plants and 58 of 987 eligible positive peaks**. For seed `379331` the counts were **200 of 631 plants and 51 of 1,042 peaks**. Plant counts use one soil-present scan per planting. Training peak counts include both soil variants and can include multiple peaks near one plant.

## Can equal representation among positive examples rescue seedlings?

We kept the same mixed training scans and fixed four more test fields before fitting again. The ordinary draw of 128 positive peaks contained only eight seedlings with the first training seed and three with the second. We changed that draw to **43 seedling, 43 transplant and 42 branching peaks**. Both fits kept the same 128 background peaks. We chose distinct candidate rows without replacement and fitted the normalization again. The unmodified draws reproduced the weight hashes of the earlier 256-example controls.

Four new plantings contained 408 plants at each stage. The table gives each stage-balanced model's 15 cm result, in training-seed order. A dash means a model emitted no pins.

| Stage and scan | True matches | Extra pins | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| Seedling, grid | 0 / 5 | 0 / 1 | — / 83.3% | 0.0% / 1.2% |
| Seedling, rings | 0 / 7 | 0 / 0 | — / 100% | 0.0% / 1.7% |
| Branching, grid | 388 / 402 | 4 / 15 | 99.0% / 96.4% | 95.1% / 98.5% |
| Branching, rings | 353 / 366 | 10 / 20 | 97.2% / 94.8% | 86.5% / 89.7% |

The ordinary fits found zero seedlings on either layout. Height alone found 83 on the grid and 43 on rings. Changing the positive mix recovered only a handful for one training seed. Its clearest benefit was on larger plants. Grid branching F1 rose from .954 / .956 to .970 / .975, ring branching F1 from .902 / .897 to .916 / .922. Transplant F1 also rose for both training seeds on both layouts. These findings use the existing fixed score cutoff and a small network. They leave open whether other learned representations can separate a faint seedling from the terrain.

## Does lowering the peak floor keep seedlings and branching plants?

A peak has to clear a height floor before the network can score it. Lowering that floor from 6.5 to 3.5 cm during both training and detection found a few more seedlings. It also cost branching-plant precision. At a 15 cm matching distance, branching precision fell from **92.9% to 81.8% on grids** and from **93.0% to 79.1% on rings**. Seedling recall at the lower floor reached **3.7%** on each layout. Soil made a large difference. On scans with soil present, the lower-floor model found only four of 615 seedlings on grids and three on rings. It found 41 and 43 respectively in their soil-removed twins.

| Test plants | Peak floor | Network F1 at 7.5 / 10 / 15 cm | Height-only F1 at 7.5 / 10 / 15 cm | Network matched / extra at 15 cm |
| --- | ---: | --- | --- | ---: |
| Seedlings, grid | 6.5 cm | .005 / .005 / .006 | .133 / .142 / .164 | 4 / 58 |
| Seedlings, grid | 3.5 cm | .052 / .053 / .063 | .265 / .286 / .314 | 45 / 160 |
| Seedlings, rings | 6.5 cm | .000 / .000 / .000 | .138 / .148 / .161 | 0 / 42 |
| Seedlings, rings | 3.5 cm | .052 / .058 / .065 | .279 / .316 / .346 | 46 / 146 |
| Branching, grid | 6.5 cm | .779 / .893 / .931 | .685 / .785 / .823 | 1,146 / 87 |
| Branching, grid | 3.5 cm | .748 / .857 / .894 | .484 / .554 / .582 | 1,213 / 270 |
| Branching, rings | 6.5 cm | .690 / .798 / .860 | .628 / .752 / .821 | 984 / 74 |
| Branching, rings | 3.5 cm | .664 / .792 / .863 | .480 / .575 / .629 | 1,169 / 309 |

**Where did the extra seedling matches come from?** The lower floor put a candidate within 15 cm of 595 seedling appearances on grids and 541 on rings, up from 153 and 133. Holding the original weights and their feature scaling fixed, we scored those extra candidates. The original fits rejected every new peak at the 0.50 cutoff. All 48 scans retained exactly the same accepted candidates and final pins. In the reverse check, the lower-floor fits scored the original, smaller candidate lists. These fits already matched 30 seedlings on grids and 31 on rings. Allowing them to see the shorter peaks brought the totals to 45 and 46. The difference came from both the examples used for fitting and the points admitted at detection time.

**Repeat it in the browser.** The height comparison runs both floors on the same synthetic scans. Choose **Run benchmark**, then open **Scores at each matching distance**. The four links restore the exact settings. [Seedlings on grids](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=heights&crop=tomato&plantArchitecture=2&plantForm=mixed&plantCondition=healthy&seed=19871317&sensor=reference&validationPlantForm=seedling&validationSensor=reference&trainingRayBudget=60000&validationRayBudget=60000&epochs=40&live=off) · [Seedlings on rings](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=heights&crop=tomato&plantArchitecture=2&plantForm=mixed&plantCondition=healthy&seed=19871317&sensor=reference&validationPlantForm=seedling&validationSensor=os1-64&trainingRayBudget=60000&validationRayBudget=60000&epochs=40&live=off) · [Branching on grids](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=heights&crop=tomato&plantArchitecture=2&plantForm=mixed&plantCondition=healthy&seed=19871317&sensor=reference&validationPlantForm=branching&validationSensor=reference&trainingRayBudget=60000&validationRayBudget=60000&epochs=40&live=off) · [Branching on rings](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=heights&crop=tomato&plantArchitecture=2&plantForm=mixed&plantCondition=healthy&seed=19871317&sensor=reference&validationPlantForm=branching&validationSensor=os1-64&trainingRayBudget=60000&validationRayBudget=60000&epochs=40&live=off)

<details>
<summary>Field counts, training settings and timing</summary>

We fixed the two heights and fresh dataset seeds `19871317` and `19871318` before scoring. Each fit saw six mixed-stage reference-grid plantings and held out three other plantings. The six independent held-out plantings contained 615 tomatoes. Both soil variants gave 1,230 center appearances per stage and layout. Each v2 scan requested 60,000 rays with seeded clutter and noise. Changing plant stage preserved counts, but changed the modeled bounding-box midpoint by a median 2.24 cm. Each comparison between heights used identical scans and labels within stage.

Run `node benchmark/studies/tomato-peak-floor.mjs > tomato-peak-floor.json` from the repository root to repeat the four combinations of training and detection floor. The report includes IDs for all 48 scans, the height control, per-tolerance scores and a count of scans where the standard fit changed its accepted candidates or pins. [Crossed-floor study](../benchmark/studies/tomato-peak-floor.mjs)

Both neural nets used 13 inputs, four tanh hidden units, initialization seed 12345 and full-batch SGD for 40 epochs at learning rate 0.25. The 6.5 cm fits retained 1,960 and 2,252 class-balanced examples. At 3.5 cm they retained 2,286 and 2,594. The height-only control ranked the same candidate peaks by smoothed height. Both methods spaced final pins by 22 cm.

With live preview off in Chromium, the 16 CPU Benchmark fits took 0.84–2.73 s each for data preparation, 0.076–0.190 s for fitting and 0.030–0.155 s for validation. For the first seed at the lower floor on held-out seedling rings, Training shed reproduced every per-tile score on CPU and software WebGPU. Fitting took 0.184 s and 11.016 s respectively. The WebGPU adapter was Google SwiftShader. Physical GPU speed and field performance on real tomatoes remain unmeasured.

</details>

## Can a second detector fill the gaps between standard pins?

This test kept every pin from the standard mixed-stage fit. A second model, trained with the 3.5 cm floor, could add pins only at peaks from 3.5 cm up to 6.5 cm. We took its candidates in descending score order at the same 0.50 cutoff. Each addition had to be at least 22 cm from every pin already placed. We fixed the rule and six fresh test plantings before scoring.

**It gained seedling matches only on scans with the soil removed.** Across both fitted model pairs, the fallback added 26 matches on grids and 22 on rings at 15 cm. On their soil-present twins, seven additional grid pins and 12 additional ring pins yielded zero new matches. One fitted pair accounted for 42 of the 48 gains. For branching plants, precision slipped from 88.8% to 88.0% on grids and from 86.8% to 85.2% on rings. Every previously matched plant on these scans still had a match at 15 cm.

| Test plants | Standard F1 | Low-floor F1 | Fallback F1 | Fallback matched / extra at 15 cm |
| --- | --- | --- | --- | ---: |
| Seedlings, grid | .020 / .032 / .052 | .046 / .056 / .095 | .033 / .046 / .069 | 101 / 227 |
| Seedlings, rings | .015 / .029 / .044 | .035 / .053 / .084 | .026 / .043 / .058 | 86 / 258 |
| Branching, grid | .705 / .821 / .888 | .641 / .754 / .825 | .700 / .817 / .886 | 2,330 / 319 |
| Branching, rings | .599 / .703 / .800 | .579 / .699 / .796 | .595 / .700 / .801 | 1,974 / 342 |

Each F1 triplet uses 7.5, 10 and 15 cm in that order. Each row pools two fits on the same 653 plants with two soil variants, giving 2,612 decisions. At 15 cm the plain height rule on the lower peak list scored .292 / .286 for seedlings on grids / rings, and .541 / .580 for branching plants. This rule can place many extra pins. On seedling grids it matched 603 of 1,306 appearances and added 2,227 extra pins on its single pass through the scans.

To repeat the test, run `node benchmark/studies/tomato-low-fallback.mjs > fallback.json`. It rebuilds the previous four fits, generates 48 held-out scans once each and scores every contender on the same returns. A CPU run took 4.67 s to prepare the fit datasets, 0.46 s to fit, 3.58 s to generate the held-out scans and 1.10 s for inference and scoring. The output includes the six reserved field seeds, each tile’s counts at all three distances and the gains and losses relative to the standard pins. [Fallback study](../benchmark/studies/tomato-low-fallback.mjs)

## Reproduce the measurements

```sh
node benchmark/studies/tomato-stage-training.mjs > tomato-stage-training.json
node benchmark/studies/tomato-stage-training.mjs --balance > tomato-stage-balance.json
```

All models were frozen before either evaluation. The initial field seeds were `4831799, 4942921, 5054027, 5165173, 5276299, 5387437`. The independent confirmation used `5498591, 5609719, 5720839, 5831963`. The separate stage-balanced follow-up used `5943079, 6054211, 6165361, 6276481`. Each field was rendered at all three stages using the reference grid and the OS1-64-inspired ring layout, both with exactly 60,000 rays. Test plots included soil and omitted added clutter and sensor noise. The script checks identical XY samples across stages within a layout and identical boxes across layouts within a stage. Each stage uses the midpoint of its own modeled canopy as the target. The browser demonstration uses the benchmark’s own validation recipes and seeds.

The JSON includes per-field counts and pooled F1 at 7.5, 10 and 15 cm, soil and no-soil training tile IDs, hashes of the frozen weight exports, proposal coverage and wall time. One Node.js 24.22.1 AMD EPYC 7763 CPU run spent 3.78 s preparing training data, 0.16 s auditing training examples, 0.25 s fitting, 1.69 s generating the held-out scans and 2.63 s validating. The follow-up took 2.62 s to prepare the training sets, 0.11 s for the audit, 0.07 s to fit, 0.71 s for the held-out scans and 0.53 s to validate. All evaluation uses the same code as Field Test. This experiment measures synthetic overhead scans. An independent field survey is needed to measure physical performance. [Experiment source](../benchmark/studies/tomato-stage-training.mjs) · [Earlier growth-stage transfer tests](seedling-density.md)

The follow-up fits both models on the same candidates and changes how they measure height above nearby soil. [See what happened on grid and ring scans](tomato-local-ground.md)
