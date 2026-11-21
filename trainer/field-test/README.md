# Test a saved detector on a plot

![A surveyed plot becomes a point cloud and its predicted pins are compared with surveyed centers.](../../art/field-deployment.svg)

Load a saved Crop Trainer weights file and a Z-up PLY covering one plot up to 10 m on each side. Set the file units, plot origin and ground elevation. Add surveyed plant centers to measure accuracy. With only the scan, you can inspect predicted locations. [Open Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

For a first try, download the examples next to the file pickers. Select the weights, the PLY and either reference file. Keep metres and zero origin, then choose **Find plants**. On this synthetic lettuce plot the detector puts down 188 pins. At 15 cm, 137 match a planted center, 51 are extra and 80 plants are missed. Switch to **Height only** to compare a simple rule on the same plot. Change **Match distance** to inspect which centers matched within 7.5, 10 or 15 cm. Each distance pairs pins and centers one to one. [Practice files and how to reproduce them](example/README.md)

With **Trained model** selected, the three bars follow the map’s match distance. In the practice plot, tightening it from 15 to 7.5 cm reduces the number of plants within reach of a peak from 185 to 125. After the cutoff and spacing, the corresponding counts are 137 and 88. The same 188 final pins were scored at both distances.

To test a new cutoff, start with a saved tomato fit, run the example, then choose **Try 0.70 on this planting**. At 15 cm the 640-epoch fit goes from 53 matches and 23 extra pins to 26 matches and five extras. In **Map view**, compare the saved cutoff with the trial and inspect which plants changed. On your own plot, enter a trial value in the cutoff control and run **Find plants**. A trial scores both cutoffs on the same returns with the same weights and spacing. [Try the two-click example](https://mvalancy.github.io/crop-trainer/trainer/?fieldExample=tomato-640#field-test)

Choose **Inspect extra pins** to see which predictions were left without a match. Tap a rust-colored square, use the arrows, or enter its position in the list. The outlined pin gets a distance to the nearest surveyed center and, for learned detectors, a model score. Two predictions close to the same plant can leave one extra. An empty survey counts every pin as extra. A plot without a reference file has no extra-pin score.

Open **How are scan measurements scaled?** after a run to inspect a peak from the actual scan. A diamond on the trained-model map marks the candidate nearest the middle of the plot. Pick any of its 13 measurements to see the raw value, the mean and divisor saved with the weights, and the number the network received. In the two weedy tomato fits, the same 0.09497 m peak enters the random fit at −0.4406 and the half-difficult fit at −0.7627. Both numbers fall below their fit’s training mean. Try both fits on the same scan to see why the ruler changes. [Open the weedy tomato example](https://mvalancy.github.io/crop-trainer/trainer/?fieldExample=tomato-weed-random#field-test)

Open **Survey alignment** below the map to check how sensitive a count is to the coordinate frame. Select a pin method and match distance above the map, choose a **10 cm** or **25 cm** shift, then click **Check survey alignment**. The first row uses the recorded XY coordinates. Four more rows move all survey centers along positive and negative local X and Y while keeping every pin fixed. Each row uses the same one-to-one matcher as the field score. A jump in matches is a reason to check independent survey control points. The original coordinates supply the exported result. If the survey covers only some plants, unmatched pins alone cannot tell which are false alarms.

The export stores the map assignments in `evaluation.pinByReferenceAtCm` and the stage counts in `stagesAtCm`, keyed by centimeters. The 15 cm results are also available under the older `evaluation.pinByReference15` and `stages15cm` keys.

| To inspect | Open |
| --- | --- |
| PLY decoding and input limits | [Point-cloud reader](ply.js) |
| Coordinate conversion, saved detector and baseline predictions | [Inference](inference.js) |
| Trace a measured peak through its saved scale | [Peak selection](feature-probe.js) · [Scaling inspector](feature-scale.js) |
| Optional survey loading and one-to-one matches | [Reference centers](references.js) |
| Compare the scores at 7.5, 10 and 15 cm in the wide table or the phone tables grouped by detector | [Score tables](score-tables.js) |
| Measure sensitivity to four fixed horizontal shifts | [Survey alignment](survey-alignment.js) |
| The shared browser and command-line scoring pipeline | [Score a scan](score-scan.js) |
| File inputs, map overlays and the processing worker | [Field test controls](field-test-ui.js) · [Extra pin inspector](extra-pins.js) · [Worker](field-test-worker.js) |

The weights file records how to extract the detector’s inputs. The trained-model readout identifies fits that measure height above nearby low returns and the spread of surrounding heights, or average over sampled cells. Field test applies those settings automatically. The height-only baseline uses the same candidate locations and ranks them by smoothed height.

For a physical plot, measure reference centers independently of the detector. To reproduce a score outside the browser, use the same inputs and coordinate frame. [Field-test CLI](../../docs/scan-cli.md)
