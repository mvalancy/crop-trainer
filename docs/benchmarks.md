# Running paired benchmarks

![Illustrated example. On the same six plants, detector A misses one and detector B places an extra pin.](../art/paired-field.svg)

Open **Benchmark** to compare CPU and WebGPU on the same neural model, or compare logistic and neural models on CPU. Both comparisons use two seeds and reverse contender order for the second seed. Other modes compare score cutoffs on one fit, training duration, training ray density or minimum peak height. The results include generation, training and scoring time, F1, and precision and recall. Download JSON for per-tolerance counts and per-field stages. Expand the distance table to see exact matches, extra pins and missed plants. Each WebGPU row in the JSON includes the adapter information exposed by the browser. To repeat the benchmark on another device, use the same app revision, crop, scanner and first seed. [Open Benchmark](https://mvalancy.github.io/crop-trainer/benchmark/)

With **Live view** checked, watch the sampled fields, the training loss and the final pins on each validation scan. The score grid fills one cell per contender and dataset seed. Select a finished score to inspect its first soil-present validation field. Switch contenders in the same column to compare their pins on the same plants. Pink crosses mark plants missed at 15 cm. Each percentage averages F1 across all validation scans at three matching distances.

For a timing comparison, turn **Live view** off before starting. This skips preview sampling and drawing and uses the original in-page generator. The JSON records the setting as `livePreview`, and the replay link restores it.

On two fresh mixed-scan artichoke seeds, the neural model beat logistic on seed 81 (0.757 vs 0.734 mean F1), and logistic edged ahead on seed 82 (0.708 vs 0.701). On tomato, CPU and Chromium’s SwiftShader software WebGPU adapter matched at all three tolerances on both seeds. These runs check numerical agreement. Physical GPU speed requires a run on that device. [Repeat the artichoke model comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=models&crop=artichoke&sensor=mixed&seed=81) · [Repeat the tomato backend comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=backend&crop=tomato&sensor=mixed&seed=81)

The crop-specific spacing filter was tested on seeds 61 and 62, with six training fields, three validation fields, mixed sampling, 40 neural epochs and 6.5 cm peaks. Increasing artichoke spacing from 12.5 to 40 cm raised mean F1 from 0.536 to 0.600 and from 0.673 to 0.779. On seed 61, 15 cm recall slipped from 85.4% to 84.3%. For young tomato, 22 cm spacing raised mean F1 from 0.730 to 0.757 and from 0.781 to 0.799. These are whole-plant center scores on procedural fields.

On the v3 branched-bud artichoke test (seed 817221, mixed plant condition), Chromium's CPU and software WebGPU backends used the same 632 training examples and identical tile IDs. After 40 epochs both scored **0.364 / 0.487 / 0.610** at 7.5 / 10 / 15 cm. CPU generation, fitting and validation took 4.39, 0.32 and 0.08 seconds. SwiftShader took 2.57, 23.80 and 0.02 seconds. Field generation runs separately from the optimizer. These single runs on shared compute measure this software configuration. [Run the v3 fit](https://mvalancy.github.io/crop-trainer/trainer/?plan=quick&seed=817221&crop=artichoke&plantForm=branched-buds&plantCondition=mixed&plantArchitecture=3&epochs=40&engine=cpu)

## Does a detector recognize other stages of growth?

Choose **Does mixing plant forms during training help?** Pick one training form, then choose what grows in the validation fields. The named-form and mixed-form detectors get the same held-out scans. Read the number of centers found, extra pins and training examples for each fit. The 3D inspection opens the actual held-out plant shape. [Try seedlings versus mixed training on branching tomatoes](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=forms&crop=tomato&plantArchitecture=2&plantForm=seedling&validationPlantForm=branching&seed=82173&sensor=reference&trainingRayBudget=60000&validationRayBudget=60000) · [Compare the three growth stages](tomato-stage-training.md)

## Does a different scanner miss the same plants?

Choose the grid and OS1-64 layout comparison. The browser trains one detector per seed, then scans each held-out planting twice at the same ray count. Both scans use that seed’s fitted weights. Inspect the extra pins and misses at 15 cm. To see how a plant can fall between two rings, open the illustrated example from the generator. [Run the seedling benchmark](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=layouts&crop=tomato&plantArchitecture=2&plantForm=seedling&plantCondition=healthy&sensor=reference&trainingRayBudget=1000000&validationRayBudget=60000&seed=82173) · [See the rays around one seedling](scanners.md#why-can-the-same-ray-budget-miss-a-seedling)

## Can the model learn which extra peaks are plants?

Choose **Does ignoring gaps help a trained detector?** Both networks see scans of the same plants. Their peak rules propose different sets of locations, so each network trains on its own examples and scales its own inputs. Read the number of extra pins alongside the number of plants found. Click a contender name in Results to open that fit’s settings in the Training Shed. [Compare the two fits on simulated ring scans](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=averaging&crop=tomato&plantArchitecture=2&plantForm=seedling&plantCondition=healthy&sensor=os1-64&trainingRayBudget=60000&validationRayBudget=60000&seed=82173) · [Check the soil-only experiment](seedling-peaks.md)

## Which plants did only one model find?

Run **Logistic vs neural · CPU**, then expand **Which plants did each model find?** Choose a scan and a matching distance. The table counts every labeled plant once. Select a box found by just one model to open its center in the 3D viewer and earn the **Model scout** stamp. A cyan ring tracks the highlighted plant as you orbit or zoom. **Copy scan link** preserves the box selection. In the Training Shed, you can also open a highlighted missed plant in 3D.

In this experiment we used 40 CPU epochs, mixed training layouts and 12,000 rays on the simulated OS1-64 validation layout. Each model used identical examples and normalization. The table pools the three soil-present scans for each dataset seed at 15 cm. Each cell lists plants found **only by logistic / only by neural**.

| Dataset seed | Lettuce | Globe artichoke | Young tomato |
| ---: | ---: | ---: | ---: |
| 1121 | 60 / 8 | 0 / 2 | 16 / 0 |
| 1122 | 0 / 45 | 0 / 13 | 2 / 13 |

On lettuce seed 1121, both models found another 260 plants, and both missed 329. Logistic produced 32 extra pins and neural produced 30. In the first soil-present field, logistic alone matched box 6 and neural alone matched box 112. A match indicates a pin within the chosen horizontal distance. Plant identity follows the scorer’s one-to-one assignment when neighboring labels compete. Plants from one field share a layout and noise, so these counts describe the six synthetic plantings. [Replay the comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=models&crop=lettuce&seed=1121&sensor=mixed&validationSensor=os1-64&validationRayBudget=12000) · [Inspect box 6](https://mvalancy.github.io/crop-trainer/?crop=lettuce&sensor=os1-64&budget=12000&seed=1510546355&ground=true&tile=09a268cecce4eadb&box=6#field) · [Inspect box 112](https://mvalancy.github.io/crop-trainer/?crop=lettuce&sensor=os1-64&budget=12000&seed=1510546355&ground=true&tile=09a268cecce4eadb&box=112#field)

Across both soil settings for lettuce seed 1121, Node CPU logistic F1 was 0.5772 / 0.6630 / 0.6989 at 7.5 / 10 / 15 cm. Neural F1 was 0.5205 / 0.5916 / 0.6106. Generation, training and validation took 2,563 / 32 / 41 ms for logistic and 2,335 / 130 / 42 ms for neural in separate CLI runs. The browser benchmark shares generation across both fits. For background on comparing models on paired examples and accounting for training-set variation, see [Dietterich, 1998](https://doi.org/10.1162/089976698300017197).

## Does the same model win on every planting?

Run **Logistic vs neural · CPU**, then open **Compare contenders on each planting**. Each row pools the two scans of one field. Choose a match distance to inspect localization accuracy, or select a field seed to open its soil-present scan in 3D. The overall score pools counts across all fields, so a small lead can come from one planting.

Across dataset seeds 421, 422, 451 and 452, the neural model beat logistic on 9 of 12 lettuce plantings, 6 of 12 artichoke plantings (one tie), and 7 of 12 tomato plantings by field mean F1. All contenders used the same synthetic inputs, crop defaults and 40 epochs.

On artichoke seed 421 the neural model led overall, while logistic led on two of the three fields. Both used the same 1,424 ms field generation pass. These timings are from one Chromium CPU run and include browser overhead. [Replay this model comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=models&crop=artichoke&sensor=mixed&seed=421)

| CPU model | Training | Scoring | F1 at 7.5 cm | F1 at 10 cm | F1 at 15 cm | Mean F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Logistic | 34 ms | 38 ms | 0.6580 | 0.8721 | 0.9661 | 0.8320 |
| Neural | 97 ms | 28 ms | 0.6528 | 0.8808 | 0.9741 | 0.8359 |

## How long should I train?

An epoch is one pass over the training examples. In the training-duration comparison, enter a short and a long fit, or choose the original 10, 40 and 100 epochs. For each seed the CPU fits use identical starting weights, training examples and held-out scans. Open a result to repeat that fit in the Training Shed.

For a first experiment, compare 40 and 640 epochs on young tomatoes. Under **Scores at each matching distance**, choose **With ground** and **15 cm**. Count how many more seedlings the long fit finds and how many extra pins it places. In the scan settings, switch the validation form to branching and run the same comparison again. [Open the seedling comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=epochs&shortEpochs=40&longEpochs=640&scoreGround=present&scoreDistance=15&sampleLimit=600&crop=tomato&plantArchitecture=2&plantForm=mixed&validationPlantForm=seedling&plantCondition=healthy&seed=987149&sensor=reference&validationSensor=os1-64&trainingRayBudget=60000&validationRayBudget=60000&featureMode=local-ground&minimumHeight=0.035) · [What happened on a separately reserved set of fields](tomato-training-duration.md)

On mixed-layout seeds 521, 522, 551 and 552, training loss fell for every crop as training length increased. From 10 to 100 epochs, held-out mean F1 rose on all four lettuce seeds and all four tomato seeds. It fell on three of four artichoke seeds. Each seed used six training fields and three held-out plantings with both soil variants. [Replay the lettuce comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=epochs&crop=lettuce&seed=521) · [Replay the tomato comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=epochs&crop=tomato&seed=521)

On artichoke seed 552, the longer fit found three more plants within 15 cm while adding 50 false positives. The table shows one Chromium CPU run. Dataset generation took 1,143 ms once for all three fits. Times vary by device and browser load. [Replay the artichoke comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=epochs&crop=artichoke&seed=551)

| Epochs | Training | Validation | F1 at 7.5 cm | F1 at 10 cm | F1 at 15 cm | Extra pins at 15 cm |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 15 ms | 35 ms | 0.4700 | 0.7386 | 0.9640 | 4 |
| 40 | 176 ms | 38 ms | 0.4342 | 0.6798 | 0.8947 | 40 |
| 100 | 211 ms | 38 ms | 0.4383 | 0.6511 | 0.8681 | 54 |

## How many candidate pins should pass?

The cutoff is the minimum model score a candidate needs before the spacing filter. The training shed starts at 0.50. Choose **What changes with the cutoff?** and enter a trial value to compare it with 0.50. The same weights score the same held-out fields at both cutoffs. You can also select the original 0.35, 0.50 and 0.65 comparison. Generation and training times repeat across those rows because each happens once per seed. Compare each cutoff’s precision and recall at the distance your task requires.

On mixed scans at seeds 103, 104, 137 and 138, moving from 0.50 to 0.65 increased artichoke mean F1 on all four seeds. Tomato lost mean F1 on all four. On tomato seed 137, lowering the cutoff from 0.50 to 0.35 recovered more plants. At 15 cm, recall rose from 75.1% to 83.2%, while precision fell from 89.6% to 82.4%. Lettuce changed direction across seeds. These synthetic comparisons use six training fields, three held-out fields and 40 epochs per seed. [Repeat the tomato comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=cutoffs&crop=tomato&sensor=mixed&seed=137) · [Repeat the artichoke comparison](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=cutoffs&crop=artichoke&sensor=mixed&seed=103)

### Does the same cutoff work after a longer fit?

To see why a cutoff chosen on one planting can disappoint on another, try the [four-field tomato experiment](tomato-calibration.md).

Set **Epochs per fit** in the cutoff benchmark and open **What changes from the 0.50 cutoff?** after the run. Positive matched-plant counts mean the detector found more plants. Positive extra-pin counts mean it produced more false positives. Select a cutoff in the main table to inspect the fitted detector's stages in the Training Shed.

On artichoke seed 622, raising the cutoff from 0.50 to 0.65 at 10 epochs reduced the number of 15 cm matches from 160 to 132. At 100 epochs, it preserved all 162 matches and reduced extra pins from 38 to 28. Here are all three distances for that 100-epoch CPU fit. Generation took 1,030 ms and training took 162 ms once. [Repeat at 10 epochs](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=cutoffs&crop=artichoke&seed=621&epochs=10) · [Repeat at 100 epochs](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=cutoffs&crop=artichoke&seed=621&epochs=100)

| Cutoff | F1 at 7.5 cm | F1 at 10 cm | F1 at 15 cm | Validation time |
| ---: | ---: | ---: | ---: | ---: |
| 0.35 | 0.5362 | 0.6715 | 0.7826 | 28 ms |
| 0.50 | 0.5550 | 0.6950 | 0.8100 | 30 ms |
| 0.65 | 0.5692 | 0.7128 | 0.8308 | 27 ms |

Across fresh synthetic seeds 621, 622, 651 and 652 at 100 epochs, the higher cutoff increased mean F1 on two of four artichoke seeds and three of four lettuce seeds. Tomato mean F1 decreased on all four. Each comparison used the same held-out scans at every cutoff.

[Back to the field guide](README.md)
