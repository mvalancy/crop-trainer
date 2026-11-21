# Does training help find crop centers?

On these held-out synthetic fields, a trained detector placed better pins for lettuce and globe artichoke than a rule that kept the tallest peaks. Young tomato exposed a failure. When we trained on a grid and tested on rings, the default neural model discarded too many true plants. A separate experiment tested whether changing the cutoff could recover them.

## Comparing four detectors on the same fields

Every detector received the same peaks from the same XYZ scan. The **peak rule** kept peaks in height order, skipping any too close to an existing pin. **Height only** learned a logistic score from one feature, the smoothed height. **Logistic** used all 13 local features. **Neural** used the same 13 features and a hidden layer of four tanh units. All four used the same minimum pin spacing for a given crop.

| Crop | Test layout | Peak rule | Height only | Logistic | Neural | Fields where neural beat the peak rule |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Lettuce | Reference grid | .665 | .741 | **.799** | .785 | 23/24 |
| Lettuce | OS1-64 rings | .706 | .697 | **.793** | .777 | 21/24 |
| Globe artichoke | Reference grid | .523 | .711 | .754 | **.760** | 23/24 |
| Globe artichoke | OS1-64 rings | .555 | .663 | .729 | **.737** | 18/24 |
| Young tomato | Reference grid | .770 | .623 | .792 | .792 | 15/24 |
| Young tomato | OS1-64 rings | **.761** | .526 | .747 | .747 | 10/24 |

Scores are mean F1. We matched each predicted pin to at most one planted center, pooled the counts across scans at **7.5, 10 and 15 cm**, then averaged the three F1 scores. The field tally combines the soil-on and soil-off scans of each planting before comparing methods.

The lettuce results favor the 13-feature logistic model on both layouts. On artichoke rings the peak rule found 96.0% of plants at 15 cm, but only 52.0% of its pins matched a plant. The neural model raised precision to 97.3% while retaining 78.6% recall. Its mean absolute count error fell from 28.0 to 6.3 plants per scan.

On tomato rings the neural model improved mean absolute count error from 26.6 to 21.9 plants per scan while **losing** localization F1. A missed plant and an extra pin can cancel in the count. Checking both metrics matters if the next task needs individual plant locations.

## A fresh test of the tomato cutoff

At 15 cm, 94.6% of tomato centers on the first ring cohort had a match among the raw proposals. The default neural model reached only 75.1% after scoring and spacing. We tested a specific possibility on new fields. Could a lower score cutoff retain more of those proposals and still beat the peak rule?

We trained three new models on reference grids. For each fit, we chose a cutoff on four separate labeled ring plantings, maximizing mean F1 across the three distances. All three selected **0.30** from the nine cutoffs 0.10 through 0.90. We froze each choice, then scored the other eight ring plantings from that fit. The table pools those 24 test plantings.

| Detector on fresh tomato rings | F1 at 7.5 cm | F1 at 10 cm | F1 at 15 cm | Mean F1 | Precision at 15 cm | Recall at 15 cm | Count error per scan |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Peak rule | .648 | .766 | .827 | .747 | .739 | .939 | 28.2 |
| Neural at 0.50 | .656 | .757 | .803 | .739 | .868 | .746 | 16.5 |
| Neural at calibrated cutoff | **.678** | **.792** | **.849** | **.773** | .802 | .903 | 16.0 |

Calibration recovered recall at the cost of precision. This used labeled examples from the target layout. The result supports calibrating a crop and scan setup on separate fields before trusting its operating point.

## Reproduce the tests

From the repository root, run this command with Node.js 22 or later.

```sh
node benchmark/studies/paired-evidence.mjs > evidence.ndjson
```

Each output line is JSON. The six crop/layout rows and tomato follow-up include per-distance match counts, precision, recall, F1 and count error. The last line records elapsed generation, fitting and validation time on the local CPU, including the calibration sweep. In one replay on Node 24.22.1, these phases took 51.1 s, 1.6 s and 10.0 s respectively. Generation includes rebuilding the training inputs to verify that they are identical across layouts.

- Main experiment dataset seeds were `40217`, `41371` and `49727`. Each fit used eight training plantings and eight different test plantings, with both soil variants kept together. Each layout used the same planting seeds and reference labels. The script verifies identical training inputs and identical paired test labels.
- Follow-up dataset seeds were `70271`, `71549` and `73403`. Within each, eight training, four calibration and eight test plantings served distinct roles.
- Each scan requested 30,000 rays. The OS1-64 layout is a simulated ring pattern. Models used the crop’s default peak floor, full-batch CPU training for 40 epochs at learning rate 0.25 and a cutoff of 0.50 unless calibrated. The neural network used a fixed initialization seed of 12345.

These experiments measure how well a **known crop** can be located inside one procedural generator. A species-recognition task would require multiple crop classes and separate labels. Measuring accuracy on a farm requires independently labeled scans from the intended crop, growth stage and acquisition setup. [Field validation protocol](field-validation.md)
