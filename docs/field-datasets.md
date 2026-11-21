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
- **OrchardQuant-3D, England.** The authors positioned 1,104 apple trees using row-end centroids and row geometry, with interpolation at gaps. The v1.2 RTK archive contains four region-of-interest points in `roi_points.shp`. These can help locate a plot, but they cannot establish the position of each trunk. For the separate Nanjing pear orchard, the public `Data_pear.zip` contains a dormant scan and a flowering scan, both LAS, with no separate table of surveyed trunks. Its seasonal coverage could test whether the same pins reappear. The stated BSD license covers the code and algorithms. [Study methods](https://doi.org/10.1111/pbi.70229) · [Release and RTK archive](https://github.com/The-Zhou-Lab/OrchardQuant-3D/releases/tag/V1.2)
- **Tree-SLAM, Netherlands.** Researchers measured all 65 trees in one apple row with an RTK survey pole. They took a reading on each side of each trunk and averaged the opposite readings to locate its center. Their public CC BY 4.0 archive contains 8,917 images and 8,917 YOLO label files for apple and pear trunk segmentation. Replaying the apple location test would require the separate mapping recordings, the 65 surveyed coordinates and their shared frame. [Survey method and row counts, §2.2](https://arxiv.org/html/2507.12093v1#S2.SS2) · [Versioned data and license](https://doi.org/10.4121/5b453456-60ef-4fc7-a3af-d6609906d85c.v1)
- **SeeTree, Washington.** This map covers 16 rows of Jazz apples. The team located trees by combining RGB-D trunk detections with vehicle-mounted RTK and averaging repeated sightings. They removed obstructed views and placed a few hidden trees between their neighbors. Treat those coordinates as estimates when testing an occluded trunk. The 200 tagged trees identified which tree the robot had reached. [Map construction, §3.2](https://doi.org/10.1016/j.compag.2024.109454) · [Authors’ sample map and recordings](https://github.com/Jostan86/pf_orchard_localization#usage)
- **SEEmear, Brazil.** Embrapa released two stereo recordings from a palmette-trained Fuji orchard in Vacaria. The `.pos` file contains the moving rover’s time-stamped GNSS solution. Teams can reconstruct the trees from depth and compare trunk visibility from the two cameras. The five-file release has no separate survey of trunk centers. The dataset is CC BY 4.0. [Acquisition and files](https://zenodo.org/records/17750202) · [Rover position file](https://zenodo.org/records/17750202/files/gnss-ppk_solution-20250313140650.pos?download=1) · [License](https://api.datacite.org/dois/10.5281/zenodo.17750202)

For a new survey, record the center of each trunk where it enters the soil, including trunks hidden by foliage or guards. Save the plot boundary, coordinate frame and registration error alongside the coordinates. A count from the whole orchard cannot tell whether individual pins land within 15 cm. [Field validation protocol](field-validation.md) · [Synthetic apple locator results](orchard-bases.md)

**Another orchard reference for the low-trunk band.** TreeScope’s Merced County pistachio plot pairs aerial OS1-64 and ground-based OS0-128 scans with measurements from 70 trees. The field crew measured diameter at 30 cm above ground, inside the height range used by Crop Trainer’s experimental ranker. We inspected both `UCM-0523` measurement JSONs. Each has 70 tree IDs with a single `DBH` field. These measurements can check the width of visible stems. Scoring a pin’s horizontal error requires separate base coordinates. TreeScope specifies CC BY-NC-SA 4.0. [Measurements](https://tnl.treescope.org/Treescope/Treescope_v1.0_DIST/UCM-0523/ground_truth/measurements/) · [Field methods and Table II](https://arxiv.org/pdf/2310.02162) · [License and project](https://treescope.org/)

### How often does a low return actually hit wood?

Westling’s Queensland avocado dataset includes handheld scans with human labels for woody and leafy material. The 1,135 rows in `trunks.csv` look promising for scoring base locations. The field methods explain that a person selected a scanned point on one side of each real trunk. A tree 20–50 cm across can put that surface point roughly 10–25 cm from its center. Use the labels to study visibility. A 15 cm trunk-center accuracy test would need a separate survey. The scans use north–east–down coordinates and were aligned to earlier GPS-equipped mobile LiDAR scans. [Dataset and CC BY 4.0 license](https://doi.org/10.17632/h49fpprg6c.1) · [Annotation and matching methods, §§2.3 and 4.1](https://arxiv.org/pdf/2009.13727)

We checked all six focal trees in the September 7, 2017 folder and the same six trees on August 14. For each tree, we compared the Crop Trainer trial’s low height band with an equally deep slice just above it. Each fraction counts the hand-labeled **woody returns / all woody or leafy returns on the focal tree**. Trees with an empty slice stay in the coverage count.

| Collection | 15–48 cm above ground | 48–81 cm above ground | Trees with any focal returns in the lower band |
| --- | ---: | ---: | ---: |
| August 14 | 8,462 / 12,709 (66.6%) | 22,739 / 54,618 (41.6%) | 6 / 6 |
| September 7 | 6,108 / 9,957 (61.3%) | 23,532 / 53,906 (43.7%) | 5 / 6 |

The lower band contained a greater share of wood when returns were pooled. On tree `r60-t8w`, only 17.1% of lower returns were woody in August and 19.8% in September. Tree `r14-t35e` had no focal-tree return in that band in September. Thick foliage, labeling and scanner coverage all affect what enters this count. The data measure the material visible on six avocado trees. The synthetic apple trial ranks cells using return heights above the plot’s zero-height plane. The avocado files give height above the authors’ local ground estimate. [Apple locator study](orchard-bases.md)

To reproduce the table, download `r14-t35e.bin`, `r45-t24w.bin`, `r49-t10e.bin`, `r49-t65e.bin`, `r6-t12w.bin` and `r60-t8w.bin` from each dated folder. Keep the `20170814/` and `20170907/` directories under the same local parent and run the command below. Read 40-byte little-endian records. At byte offsets 24 and 28 read unsigned 32-bit matter and tree labels. At offset 32 read the 64-bit floating-point height above the authors’ estimated ground. Keep tree label `1` (focal tree), count matter `1` as wood and `0` as leaf, and include heights at each lower bound up to but excluding its upper bound. Sum counts across files before dividing. [Versioned file archive](https://data.mendeley.com/datasets/h49fpprg6c/1)

```sh
node cli/avocado-matter.mjs /path/to/extracted-avocado-dataset
```

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

### What changes when the scanner moves to the other side of the row?

We used the same 11 Fuji trees and the same 1.8 m scanner height for both passes, with the fan off. The east and west views see different parts of the same tree. We froze both ranking rules and their 1.05 m pin spacing before comparing the 22 original MAT files. The trial gives qualifying candidates more weight for returns 15–48 cm above the estimated ground. Any object in that band can contribute.

| Ranking | Trees with one pin on each side | Pins within 15 cm across sides | Median shift | Largest shift | Neighbor-group pins, east / west |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard support | 11 of 11 | 7 of 11 | 10.08 cm | 29.01 cm | 11 / 9 |
| Support plus low returns | 11 of 11 | 7 of 11 | 11.89 cm | 32.98 cm | 11 / 9 |

Both methods gave tree 08 the largest shift. On tree 09, emphasizing low returns increased the shift from 1.54 cm to 9.33 cm. The same four trees shifted more than 15 cm under both rankings. The count and threshold measure alone would hide those changes. The four neighboring groups use the same consecutive source crops as the airflow test. Their west scans yielded two pins for trees 04–06 and two for trees 07–09. The files supply tree identities and scanner positions. Without surveyed trunk XY, a missing group pin cannot be attributed to a particular tree from these counts.

We also changed which pass supplied the level-ground estimate. Holding the horizontal frame fixed, the west-side first percentile differed from the east-side value by −27.8 to +29.7 cm across individual crops. When both passes used the west height, the 15 cm repeatability count was 7/11 for standard support and 9/11 for low returns. Median shifts were 7.91 and 9.88 cm, respectively. Across the four groups, standard support still returned 11 east and 9 west pins. The low-return rule returned 10 east and 9 west. Its results depend on the assigned ground height. A field test should survey the ground elevation near each trunk together with its XY position.

To replay, use the same extracted directory and Node command with `--compare-sides`. Both passes share the east, fan-off XY origin. The second command changes only the height used for the ground estimate. Distance includes any registration error between passes. This experiment measures how consistently the two viewpoints place a pin. [Acquisition geometry](https://doi.org/10.1016/j.dib.2020.105248) · [Dataset and terms](https://hdl.handle.net/10459.1/68782) · [Replay source](https://github.com/mvalancy/crop-trainer/blob/main/cli/fuji-repeatability.mjs)

```sh
node cli/fuji-repeatability.mjs /path/to/AllTrees_pcloud --compare-sides
node cli/fuji-repeatability.mjs /path/to/AllTrees_pcloud --compare-sides --west-ground
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
