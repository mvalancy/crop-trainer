# Will this detector work on my field?

Pick one job before collecting scans. **Counting** asks how many established plants occupy a plot. **Localization** asks where each plant is, within a distance that matters for your task. A missed plant and an extra pin can cancel in the count. Matching pins to individual plants reveals that error.

## Check the scan first

The detector expects one crop and an upright scan of a plot up to 10 × 10 m. The importer accepts metres, centimetres or millimetres and converts the plot to metres internally. It looks for height peaks on a 5 cm grid. For a physical scan, record the scanner, pose, units, plot bounds and ground elevation. Use surveyed ground or measured soil returns to establish the vertical reference. Using the lowest leaf as ground can erase a short plant. For a uniformly sloping bed, measure ground elevation at the plot origin and along both scan axes. Divide the elevation change by the horizontal distance and multiply by 100 to get grade percent. A 20 cm rise over 4 m gives a grade of +5%. Enter those measurements in the field test and keep them with the report. Uneven beds need a local terrain survey or smaller leveled plots. The importer relies on the plane you supply.

Raising the same synthetic lettuce returns by 15 cm changed both the detections and the count. Entering the measured elevation in **Ground Z** recovered every original pin and model score. The two seed groups below used independent training and validation fields.

| Lettuce scan frame | Mean F1 · seed 7819 | Count MAE · seed 7819 | Mean F1 · seed 18493 | Count MAE · seed 18493 |
| --- | ---: | ---: | ---: | ---: |
| Original elevation | 0.780 | 27.3 | 0.749 | 67.0 |
| All returns raised 15 cm | 0.331 | 712.8 | 0.311 | 814.7 |
| Same raised returns, Ground Z set to 0.15 m | 0.780 | 27.3 | 0.749 | 67.0 |
| Ground height rises 5 cm per metre along X | 0.412 | 233.0 | 0.369 | 260.7 |
| Same slope, measured ground plane entered | 0.780 | 27.3 | 0.749 | 67.0 |

Mean F1 averages the pooled scores at 7.5, 10 and 15 cm. Count MAE is mean absolute count error in plants per scan. Each seed trained one default four-unit network for 40 CPU epochs on six mixed-layout fields per crop. The five conditions reused its weights and the same three held-out fields with both soil variants. On the slope experiment the ground plane rose from −0.25 m at X = 0 to +0.25 m at X = 10. Entering −0.25 m for Ground Z and grades of +5% in X and 0% in Y restored every original pin and model score across all 36 synthetic scans. This test used the exact imposed plane. Unknown terrain still needs independent measurements.

Run `node benchmark/ground-reference.mjs` from the repository root to reproduce all rows for lettuce, globe artichoke and young tomato. It prints counts at each tolerance, field seeds, the number of scans with exact pin and score recovery, and times for generation, training and validation. Validation time includes regenerating the held-out XYZ scans. [Ground-reference experiment](../benchmark/ground-reference.mjs)

## Collect a test that can fail

1. **Reserve whole fields and dates.** Use some sites or sessions to develop the detector and separate ones for the final test. Keep repeat passes, adjacent tiles from the same plot and scans of the same plants together. For transfer to a new farm, hold out an entire farm. Record how many independent fields and collection dates each result covers.
2. **Make the answer key before viewing predictions.** Mark one XY target for each plant. The field lettuce, globe artichoke and young tomato generators use the midpoint of the plant’s horizontal bounding box. The apple orchard, trellised vineyard, bench lettuce and high-wire tomato generators use the planting position (`base_xy_m`). A lopsided canopy can put those targets in different places. For a trunk or stem survey, measure the base directly and record that definition. Decide how to handle border plants, touching canopies, weeds and hidden bases. Use a second view or survey plants on foot when the scan obscures them. Mark unverifiable areas and their extent separately. Have a second person review a subset and measure disagreement at the intended tolerance.
3. **Include hard and empty plots.** Sample variation in growth stage, slopes, clutter and return density that your operation actually encounters. Include crop-free plots with bare soil and weeds. Record false detections per square metre there. Inspect whether a missed plant produced any candidate peak within the required distance. A classifier can only retain or discard the peaks it receives.
4. **Freeze the recipe.** Save the source revision, model weights, crop, coordinate transform, peak floor, score cutoff and minimum pin spacing. Compare with a simple height-peak rule on the same scans, using the same spacing and matching rules. Pick all thresholds on development fields and open the final labels once.

## Decide whether to proceed

For **counts**, report absolute error per plot and signed error to show undercounting or overcounting. For **locations**, match one pin to at most one label in XY and report missed plants, extra pins, precision and recall at your working distance. Record sample area and show per-field results so a large or easy field cannot hide a failure. When estimating uncertainty, resample independent fields or acquisition groups together.

Set the acceptable error from the downstream job before evaluating. Proceed to a supervised pilot if the model meets that requirement on held-out fields, improves on the simple rule, and the most costly conditions have adequate coverage. If a small ground-height change erases the gain, fix registration or height features. If the labeled plants never produce peaks, work on acquisition or proposal generation.

Individual-plant lettuce reconstructions can test canopy scale and shape. Pheno4D can test changes across repeated tomato growth stages. Those datasets lack the row-scale negatives and plot-level center labels needed to establish field-count accuracy. The research guide records their terms and the limits of the available artichoke evidence. [Datasets and research](research.md)
