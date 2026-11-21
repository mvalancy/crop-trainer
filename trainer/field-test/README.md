# Test a saved detector on a plot

![A surveyed plot becomes a point cloud and its predicted pins are compared with surveyed centers.](../../art/field-deployment.svg)

Load a saved Crop Trainer weights file and a Z-up PLY covering one plot up to 10 m on each side. Set the file units, plot origin and ground elevation. Add surveyed plant centers to measure accuracy. With only the scan, you can inspect predicted locations. [Open Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

For a first try, download the examples next to the file pickers. Select the weights, the PLY and either reference file. Keep metres and zero origin, then choose **Find plants**. On this synthetic lettuce plot the detector puts down 188 pins. At 15 cm, 137 match a planted center, 51 are extra and 80 plants are missed. Switch to **Height only** to compare a simple rule on the same plot. [Practice files and how to reproduce them](example/README.md)

| To inspect | Open |
| --- | --- |
| PLY decoding and input limits | [Point-cloud reader](ply.js) |
| Coordinate conversion, saved detector and baseline predictions | [Inference](inference.js) |
| Optional survey loading and one-to-one matches | [Reference centers](references.js) |
| The shared browser and command-line scoring pipeline | [Score a scan](score-scan.js) |
| File inputs, map overlays and the processing worker | [Field test controls](field-test-ui.js) · [Worker](field-test-worker.js) |

The weights file records how to extract the detector’s inputs. The trained-model readout identifies fits that measure height above nearby low returns and the spread of surrounding heights, or average over sampled cells. Field test applies those settings automatically. The height-only baseline uses the same candidate locations and ranks them by smoothed height.

For a physical plot, measure reference centers independently of the detector. To reproduce a score outside the browser, use the same inputs and coordinate frame. [Field-test CLI](../../docs/scan-cli.md)
