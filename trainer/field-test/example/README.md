![A saved crop detector places pins on a new plot for comparison with measured centers.](../../../art/field-deployment.svg)

# Try a saved detector in Field Test

## Download a lettuce example

Can a saved detector find the centers in a new lettuce plot? Download the scan and weights below, open **Field test**, and choose **Saved weights JSON**. Add either reference file to count matches, extra pins and missed plants. Use metres, zero for the three origin coordinates and zero grade. [Open Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

| File | What it contains |
| --- | --- |
| [Scan (.ply)](c0545a3786c57a89.ply) | 11,178 XYZ returns in binary little-endian PLY, including soil and clutter |
| [Model weights (.json)](weights.json) | A CPU-trained detector with 13 inputs, four tanh units and one output |
| [Reference centers (.csv)](centers.csv) | One row per planted lettuce, in the same coordinate system as the scan |
| [Generator labels (.json)](labels.json) | Bounding boxes for the same 217 plants, including their per-plant return counts |

Field test reads each lettuce center from the horizontal midpoint of its box. Both reference files give the same result. At 15 cm, the model places 188 pins and matches 137 of the 217 synthetic plants. The other 51 pins are extras and 80 plants are missed. [Inspect this planting in the generator](https://mvalancy.github.io/crop-trainer/?crop=lettuce&plantArchitecture=3&plantForm=mixed&plantCondition=healthy&seed=66696975&sensor=reference&ground=true&budget=12000&tile=c0545a3786c57a89#field)

## Reproduce the lettuce example

Run these commands from the repository root with Node.js 22 or later. The settings fix eight training plantings, three validation plantings and 160 CPU training epochs. Each epoch revisits 1,316 labeled training examples. The example scan is the first validation planting with soil included, generated from seed 66696975 with a reference grid and a budget of 12,000 rays. [Training settings](settings.json)

```sh
node cli/run.mjs train lettuce-run.json trainer/field-test/example/settings.json --weights lettuce-weights.json
node cli/score-scan.mjs lettuce-weights.json trainer/field-test/example/c0545a3786c57a89.ply lettuce-score.json --labels trainer/field-test/example/centers.csv
```

To replay the original export in a browser, open the planting link above, check that its tile ID is `c0545a3786c57a89`, then use the generator’s scan and label download buttons.

## Compare two tomato detectors

Choose **Run example** in Field Test to regrow the same 110 seedlings with soil and 60,000 simulated ring-scanner rays. The 40-epoch detector finds one seedling within 15 cm. The 640-epoch detector finds 53 and places 23 extra pins. Both fit the same 600 labeled examples from six synthetic training fields at dataset seed 987149. The example planting uses seed 40117063 and scan ID `56b872a50fcac3ab`. [Run the 40-epoch example](https://mvalancy.github.io/crop-trainer/trainer/?fieldExample=tomato-40#field-test) · [Run the 640-epoch example](https://mvalancy.github.io/crop-trainer/trainer/?fieldExample=tomato-640#field-test)

These two small JSON files are CPU exports from Crop Trainer. You can inspect them, try them on another plot or reproduce them with the Training Shed settings in the study. [40-epoch weights](tomato-40.json) · [640-epoch weights](tomato-640.json) · [Training settings and study](../../../docs/tomato-training-duration.md#recreate-the-files-yourself)

## Try two models on a weedy planting

On this soil-present plot, 60,000 simulated ring rays scan 114 young tomatoes growing among weeds. Both saved models practiced on the same 300 tomato examples and 300 background examples for 640 epochs. One drew its background examples randomly. The other reserved half of those places for examples a preliminary detector mistook for crops.

Choose **Run example**, then **Try the other fit**. Within 15 cm the random draw finds 44 tomatoes with 33 extra pins. The half-difficult draw finds 30 with 22 extras. Each model uses a cutoff of 0.65. Choose **Compare on the map** to see which seedlings changed. At 15 cm the half-difficult fit gains one seedling (box 77) and loses 15 that the random fit found. Tap its plus sign or select **Box 77** to see how far the pin landed from the planted center. Choose **Inspect Box 77 in 3D** to open that same planting with the seedling highlighted. Its model pin landed 11.2 cm from the plant, so it also drops out of the 10 cm matches. [Try the planting](https://mvalancy.github.io/crop-trainer/trainer/?fieldExample=tomato-weed-random#field-test) · [Download the random fit](tomato-weed-random.json) · [Download the half-difficult fit](tomato-weed-hard.json)

To reproduce both weights, use the study's fit phase and take the ordinary and half-hard `model` objects for training seed `2103181`. The reserved planting uses seed `51112017` and its scan ID is `3b07cf65952362c6`. [Study commands and results on all six plantings](../../../docs/tomato-hard-negatives.md)
