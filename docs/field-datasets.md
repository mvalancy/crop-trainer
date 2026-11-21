# Find a field dataset for your detector

Crop Trainer predicts one horizontal position per plant. To score a real plot, you need a metric scan and a reference position for **every plant in the plot**, both in the same coordinate frame. A labeled leaf, fruit or visible patch of canopy answers a different question. Start with the vineyard if you want a test you can replay today. Public data stays on your computer. [Local scoring guide](scan-cli.md)

| Growing system and source | What you can measure | Access and reuse |
| --- | --- | --- |
| **Vineyard · TLS-Grapevine2024** | Registered terrestrial laser scans of two rows in Portugal over nine growth stages. The archive contains 52 distinct trunk positions. Use these for base detection. The 38 vines with detailed agronomic observations are a separate subset. | CC BY 4.0. Credit Gomes and colleagues, cite the version, and describe preprocessing. [Archive](https://zenodo.org/records/18259014) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.18259014) |
| **Apple orchard · HOPS** | Tree instances, trunks and fruit across orchard point clouds. For a visibility test, estimate one base from the labeled near-ground points on each visible trunk. These positions come from the same scan and share its blind spots. Keep terrestrial laser scans and reconstructed scans in separate results. Crop large files before opening them in the app. | The authors provide downloads. Redistribution terms for the full collection still need confirmation. [Project and splits](https://www.ipb.uni-bonn.de/data/hops/index.html) · [Paper](https://arxiv.org/abs/2503.13188) |
| **Apple fruit · Fuji-SfM** | Image-based 3D reconstructions of 11 trees with 1,455 annotated apples. Use for fruit localization or canopy geometry. It supplies no equivalent set of trunk-base targets. HOPS also uses Fuji-SfM in its tests. | **Conflicting license statements.** The catalog lists CC BY 4.0 and the deposited license specifies CC BY-NC-SA 4.0. Seek clarification before redistributing or using commercially. [Deposit](https://zenodo.org/records/3712808) · [Catalog](https://api.datacite.org/dois/10.5281/zenodo.3712808) · [Deposited license](https://zenodo.org/records/3712808/files/LICENSE.txt?download=1) |
| **Open-field lettuce · AgRibotLeafyVeg** | 112 overhead RealSense RGB-D observations over four dates in Bari. Each mask selects one sampled plant. Neighbors may be marked as background, so whole-frame precision and plant counts would be misleading. Use the masks to check visibility or canopy shape. For metric locations, verify camera calibration and scan pose first. | CC0 1.0. One raw depth frame and its mask were checked for matching 1280 × 720 dimensions. [Authors’ data, label definitions and license](https://github.com/ispstiima/AgRibotLeafyVeg) |
| **Greenhouse lettuce · IoT4Lettuce** | Hydroponic growing trial with 45 plants, two cultivars and several sensors, including Livox and depth cameras. One corrected Flexx2 plant PLY loaded as 5,941 XYZ points in the app parser. For a whole-bench test, establish the frame and obtain all planting positions. | CC BY 4.0. The multi-sensor archive is roughly 39 GB. [Deposit](https://zenodo.org/records/20759414) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.20759414) |
| **High-wire tomato greenhouse** | RGB images of Tasty Tom trusses with fruit, stem and organ annotations. Inspect stem lean, overlap and occlusion when designing the simulator. These images alone cannot supply registered metric trunk locations. | Authors specify CC BY 4.0. [Dataset and annotation guide](https://github.com/akshaykburusa/tomato_greenhouse_dataset) |
| **Tomato plant geometry · TomatoPGT** | 42 reconstructed scans from three vegetative plants with part labels and graph structure. Group scans by original plant when comparing geometry. Mature greenhouse rows require separate validation. | CC BY 4.0. [Versioned deposit](https://data.mendeley.com/datasets/72md54c7n7/1) · [License metadata](https://api.datacite.org/dois/10.17632/72md54c7n7.1) |
| **Globe artichoke** | Aerial imagery studies can inform spacing and count experiments. A field-scale XYZ survey with complete metric plant centers and verified reuse terms remains an open gap. [Published artichoke center errors and missed plants](research-evidence.md#what-researchers-have-measured) | Dataset terms unconfirmed. [Field study](https://www.sciencedirect.com/science/article/pii/S0168169923005732) |

## Can we check the shape of the simulated apple branches?

Purdue’s dormant apple dataset pairs Kinect 2 depth images with numbered photographs of the primary branches on nine trees. Six trees were scanned outdoors and three indoors. Akbar and colleagues measured branch diameters about 6.35 cm from the trunk and the spacing between successive branch attachments. Compare those measurements with the same locations on the simulator’s dormant trees. The numbered photographs also let you check which branches a front or rear view misses. A test of broken scaffolds would still need labeled breaks or matching scans before and after a known removal. Purdue lists a public 19 GB archive. Its download page gives no explicit data reuse license. [Measurement method and examples, §§3–4](https://openaccess.thecvf.com/content_cvpr_2016_workshops/w9/papers/Akbar_A_Novel_Benchmark_CVPR_2016_paper.pdf) · [Purdue data archive](https://engineering.purdue.edu/RVL/CVPRW_Dataset/)

Cornell’s AppleQSM study measured 84 twelve-year-old trees in a tall-spindle orchard in Ithaca, New York. Its three rows give separate height ranges for the SnapDragon and RubyFrost cultivars. When comparing a generator, measure from the soil at the trunk to the highest point of the tree. For branch diameter, Cornell used a disc 5 cm from the trunk–branch junction on 106 branches from nine trees. The team measured trunk diameter relative to a protective cover, so reproducing that comparison requires the cover height. The paper publishes summary measurements and links the analysis code. The authors offer raw scans by request. [Field methods and Tables 1–2](https://pmc.ncbi.nlm.nih.gov/articles/PMC11077705/#T1) · [Apple generator and shape checks](../trainer/plants/apple.md)

## Can we score apple trunk locations on a surveyed orchard?

We could verify apple LiDAR scans and published trunk surveys. None of the releases checked supplied both a registered scan and an independent trunk-base coordinate for every tree in a stated plot.

- **Trzebnica, Poland.** Hadas and colleagues surveyed the bottoms of 50 selected apple stems with about 3 cm horizontal accuracy. The public deposit describes 476 trees and its two apple archives contain normalized ground and above-ground point clouds. A team could inspect how many low returns reach the stems today. To score pins, it would also need the original base coordinates and the boundary of a fully surveyed patch. The deposit is CC BY 4.0. [Field methods, §2.3](https://isprs-archives.copernicus.org/articles/XLII-2/407/2018/isprs-archives-XLII-2-407-2018.pdf) · [Data and file manifest](https://zenodo.org/records/15831891) · [License](https://api.datacite.org/dois/10.5281/zenodo.15831891)
- **OrchardQuant-3D, England.** The authors positioned 1,104 apple trees using row-end centroids and row geometry, with interpolation at gaps. The v1.2 RTK archive contains four region-of-interest points in `roi_points.shp`. These can help locate a plot, but they cannot establish the position of each trunk. The stated BSD license covers the code and algorithms. [Study methods](https://doi.org/10.1111/pbi.70229) · [Release and RTK archive](https://github.com/The-Zhou-Lab/OrchardQuant-3D/releases/tag/V1.2)
- **Tree-SLAM, Netherlands.** Researchers measured all 65 trees in one apple row with an RTK survey pole. They took a reading on each side of each trunk and averaged the opposite readings to locate its center. Their public CC BY 4.0 archive contains 8,917 images and 8,917 YOLO label files for apple and pear trunk segmentation. Replaying the apple location test would require the separate mapping recordings, the 65 surveyed coordinates and their shared frame. [Survey method and row counts, §2.2](https://arxiv.org/html/2507.12093v1#S2.SS2) · [Versioned data and license](https://doi.org/10.4121/5b453456-60ef-4fc7-a3af-d6609906d85c.v1)
- **SeeTree, Washington.** This map covers 16 rows of Jazz apples. The team located trees by combining RGB-D trunk detections with vehicle-mounted RTK and averaging repeated sightings. They removed obstructed views and placed a few hidden trees between their neighbors. Treat those coordinates as estimates when testing an occluded trunk. The 200 tagged trees identified which tree the robot had reached. [Map construction, §3.2](https://doi.org/10.1016/j.compag.2024.109454) · [Authors’ sample map and recordings](https://github.com/Jostan86/pf_orchard_localization#usage)

For a new survey, record the center of each trunk where it enters the soil, including trunks hidden by foliage or guards. Save the plot boundary, coordinate frame and registration error alongside the coordinates. A count from the whole orchard cannot tell whether individual pins land within 15 cm. [Field validation protocol](field-validation.md) · [Synthetic apple locator results](orchard-bases.md)

### Does a second view reveal a hidden trunk?

**BranchMatch** provides four terrestrial laser scans per tree for 10 dormant Aztec Fuji apple trees in Beijing. The authors cropped each tree and used spherical markers to register its views. The reported 0.59 mm mean error measures that alignment. Table 1 gives trunk diameters measured 25 cm above a fitted ground plane. The paper supplies no independent survey of where each trunk enters the soil. [Field methods and Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC12546229/)

For a local visibility test, reserve stations S2 and S3 to mark the center of that 25 cm trunk slice before looking at any predictions. In the same frame, compare pins from S1 alone with pins from S1 plus its opposite view, S4. Report horizontal offsets, missing pins and cases where the reference slice is too obscured to mark. This measures agreement with a visible trunk slice on individual trees. Whole-row base accuracy still requires a surveyed plot.

The authors link the scans and registration matrices through a contact form. The form cites CC BY-NC-SA 4.0 and also asks users to agree to non-profit research or academic use and no redistribution. [Dataset access](https://github.com/NingWang1999/BranchMatch#benchmark-dataset) · [Download terms](https://www.wjx.top/vm/QyYKf73.aspx)

### Do pins stay in the same place when the foliage moves?

Gené-Mola and colleagues scanned 11 consecutive Fuji apple trees with a sprayer fan off and on. We checked all 88 LFuji-air scan filenames against the experimental design. Each tree has both east and west passes at heights of 1.8 and 2.5 m in the same metric world frame. The eight GNSS tracks locate the scanner, and the 1,353 annotation files mark fruit. An independent survey of the trunk bases would still be needed for a 15 cm accuracy score. The authors specify CC BY-NC-SA 4.0 and research or educational use. [Dataset and terms](https://hdl.handle.net/10459.1/68782) · [Acquisition and coordinates](https://doi.org/10.1016/j.dib.2020.105248) · [Forced-air experiment](https://doi.org/10.1016/j.compag.2019.105121)

We ran the geometric orchard locator on the 22 east-side, 1.8 m scans. **In the individual tree crops, the default 1.05 m pin spacing produced one pin in both passes for all 11 trees.** The median distance between corresponding pins was 4.49 cm. On tree 08 the pin moved 27.28 cm even though the count stayed at one. The distance includes any pass-to-pass registration error. A pin can repeat in the same wrong place.

| Minimum pin spacing | Trees with one pin in each pass | Of those, pins within 15 cm of each other | Median shift for those pairs | Pins on reconstructed groups, fan off / on |
| --- | ---: | ---: | ---: | ---: |
| 0.75 m | 6 of 11 | 6 of 6 | 4.48 cm | 17 / 24 |
| 1.05 m | 11 of 11 | 10 of 11 | 4.49 cm | 11 / 12 |
| 1.35 m | 11 of 11 | 10 of 11 | 4.49 cm | 7 / 9 |

For the first three measurements, each input was the authors’ crop around one tree. We compared pins by tree ID only when each pass produced exactly one. For the last column we concatenated neighboring crops in four groups (01–03, 04–06, 07–09, 10–11), keeping fan-off and fan-on returns separate. We used the deposited coordinates without additional alignment or point deduplication. These groups contain the authors’ selected returns from 11 trees. An uncropped row could also contain background between trees. Both settings above 1 m produced the same isolated pins, yet the wider spacing suppressed more pins in the grouped scans.

**Replay locally.** Extract the source archive under its terms. From the Crop Trainer repository, run the command below with Node 22 or newer. For each tree or group the helper uses every XYZ return. It sets each lower-left horizontal coordinate to the floor of the fan-off minimum minus 3 m. The ground is level at the first percentile of fan-off elevations, linearly interpolated between sorted samples. Both passes share that 10 m square and ground estimate. The output lists counts by tree and group and reports the shift only for single-pin pairs. [Local replay source](https://github.com/mvalancy/crop-trainer/blob/main/cli/fuji-repeatability.mjs)

```sh
node cli/fuji-repeatability.mjs /path/to/AllTrees_pcloud
```

## Replay the vineyard test

**Question.** Can a detector trained on synthetic trellised vines place pins on surveyed trunks in an early-season laser scan? The model and threshold were fixed before scoring the physical strip. Both detectors used the same points, ground plane and 18 references.

| Matching distance | Learned matches / extra / missed | Learned F1 | Height-only matches / extra / missed | Height-only F1 |
| --- | --- | ---: | --- | ---: |
| 7.5 cm | 0 / 21 / 18 | 0.000 | 1 / 54 / 17 | 0.027 |
| 10 cm | 0 / 21 / 18 | 0.000 | 1 / 54 / 17 | 0.027 |
| 15 cm | 1 / 20 / 17 | 0.051 | 2 / 53 / 16 | 0.055 |

The learned count of 21 looks close to 18. The map shows why counts alone can hide failure. At 15 cm, 279 initial peaks covered eight trunks. Thresholding retained 74 candidates covering six. Final pin selection retained 21 covering one. Improving selection could recover some of those six. The other ten trunks had no nearby initial peak.

1. Download TLS-Grapevine2024 from the versioned archive in the table. Extract the April 9, 2024 processed LAS and the trunk shapefile with the original directories. Keep the data outside this repository. The script expects a directory containing both `Vectors/` and `1_Leaf_Development/`.
2. From the repository root, train the CPU reference fit with Node 22 or later. Use new output paths for each replay.

```sh
echo '{"seed":32137,"crop":"grapevine","trainFields":6,"valFields":3,"sensorMode":"mixed","minimumHeight":0.065,"threshold":0.5,"epochs":40}' > vine-settings.json
node cli/run.mjs train vine-training.json vine-settings.json --weights vine-weights.json
node benchmark/studies/prepare-vineyard.mjs /path/to/extracted-dataset vine-strip
node cli/score-scan.mjs vine-weights.json vine-strip/plot.ply vine-score.json --labels vine-strip/trunks.csv --origin 34453,180304,490.04084483709477 --grade-percent -1.491114864874099,6.625270270267329
```

3. To inspect the pins visually, open **Training shed → Field test**, select the weights, PLY and CSV, and enter the metre origin and grade percentages from `vine-strip/frame.json`. [Open Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

**How the strip was prepared.** The archive contains 33,512,063 returns in the processed LAS. A 10 × 10 m square centered on the trunk survey extent (snapped to whole metres) contained 12,058,322 returns. The adapter retained the highest measured point in each occupied 5 cm cell, giving 16,685 points. It estimated a ground plane from the low returns of 45 occupied square-metre patches. The reference CSV uses the deposited PointZ geometry in EPSG:3763. The height-only and learned detectors both see the same overhead representation. This preprocessing can discard trunk returns visible from the side.

**What the result supports.** This synthetic-only model failed to localize most trunks on one physical strip at one date. Its mean F1 across the three tolerances on its synthetic holdout was 0.150. The physical test gives us a place to inspect proposal coverage, canopy displacement and survey alignment. For future comparisons, reserve another row or site before tuning. The nine dates revisit the same vines and measure seasonal change on that planting. [Source archive and attribution](https://doi.org/10.5281/zenodo.18259014)
