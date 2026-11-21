# Find a field dataset for your detector

Crop Trainer predicts one horizontal position per plant. To score a real plot, you need a metric scan and a reference position for **every plant in the plot**, both in the same coordinate frame. A labeled leaf, fruit or visible patch of canopy answers a different question. Start with the vineyard if you want a test you can replay today. Public data stays on your computer. [Local scoring guide](scan-cli.md)

| Growing system and source | What you can measure | Access and reuse |
| --- | --- | --- |
| **Vineyard · TLS-Grapevine2024** | Registered terrestrial laser scans of two rows in Portugal over nine growth stages. The archive contains 52 distinct trunk positions. Use these for base detection. The 38 vines with detailed agronomic observations are a separate subset. | CC BY 4.0. Credit Gomes and colleagues, cite the version, and describe preprocessing. [Archive](https://zenodo.org/records/18259014) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.18259014) |
| **Vineyard · EscaYard and VineLiDAR** | Independent RTK trunk positions at a second site in Spain, a multispectral photo reconstruction and a DJI drone laser scan. [Compare the same detector across both captures](#can-the-same-rule-find-trunks-at-a-second-vineyard). | Both versioned deposits specify CC BY 4.0. [EscaYard](https://doi.org/10.5281/zenodo.10362568) · [VineLiDAR](https://doi.org/10.5281/zenodo.8113105) |
| **Apple orchard · HOPS** | Tree instances, trunks and fruit across orchard point clouds. For a visibility test, estimate one base from the labeled near-ground points on each visible trunk. These positions come from the same scan and share its blind spots. Keep terrestrial laser scans and reconstructed scans in separate results. Crop large files before opening them in the app. | The authors provide downloads. Redistribution terms for the full collection still need confirmation. [Project and splits](https://www.ipb.uni-bonn.de/data/hops/index.html) · [Paper](https://arxiv.org/abs/2503.13188) |
| **Apple fruit · Fuji-SfM** | Image-based 3D reconstructions of 11 trees with 1,455 annotated apples. Use for fruit localization or canopy geometry. It supplies no equivalent set of trunk-base targets. HOPS also uses Fuji-SfM in its tests. | **Conflicting license statements.** The catalog lists CC BY 4.0 and the deposited license specifies CC BY-NC-SA 4.0. Seek clarification before redistributing or using commercially. [Deposit](https://zenodo.org/records/3712808) · [Catalog](https://api.datacite.org/dois/10.5281/zenodo.3712808) · [Deposited license](https://zenodo.org/records/3712808/files/LICENSE.txt?download=1) |
| **Open-field lettuce · AgRibotLeafyVeg** | 112 overhead RealSense RGB-D frames and 128 focal plant masks over four dates in Bari. Each mask selects one harvested plant. [Measure how much of the canopy has depth](#how-much-of-a-lettuce-plant-has-measured-depth). | CC0 1.0. [Authors’ data and label definitions](https://github.com/ispstiima/AgRibotLeafyVeg/tree/6a1b5e79ffef06bd7d9444280d2e4243d62d1500) · [License](https://github.com/ispstiima/AgRibotLeafyVeg/blob/6a1b5e79ffef06bd7d9444280d2e4243d62d1500/LICENSE) |
| **Greenhouse lettuce · IoT4Lettuce** | Hydroponic growing trial with 45 plants, two cultivars and several sensors, including Livox and depth cameras. One corrected Flexx2 plant PLY loaded as 5,941 XYZ points in the app parser. For a whole-bench test, establish the frame and obtain all planting positions. | CC BY 4.0. The multi-sensor archive is roughly 39 GB. [Deposit](https://zenodo.org/records/20759414) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.20759414) |
| **Field tomato and weeds · GROUNDBASED_WEED** | Overhead photos of young plants in commercial tomato fields in Spain. The 2021 labels distinguish tomatoes from five named weeds. [Check how often crop and weed boxes overlap](#how-often-do-weeds-share-a-photo-with-a-young-tomato). | ODbL 1.0, with attribution and database share-alike terms. [Deposit](https://doi.org/10.20350/digitalCSIC/17475) · [Authors’ license and class guide](https://digital.csic.es/bitstream/10261/396144/9/README.txt) |
| **High-wire tomato greenhouse** | RGB images of Tasty Tom trusses with fruit, stem and organ annotations. Inspect stem lean, overlap and occlusion when designing the simulator. These images alone cannot supply registered metric trunk locations. | Authors specify CC BY 4.0. [Dataset and annotation guide](https://github.com/akshaykburusa/tomato_greenhouse_dataset) |
| **Tomato plant geometry · TomatoPGT** | 42 reconstructed scans from three vegetative plants with part labels and graph structure. Group scans by original plant when comparing geometry. Mature greenhouse rows require separate validation. | CC BY 4.0. [Versioned deposit](https://data.mendeley.com/datasets/72md54c7n7/1) · [License metadata](https://api.datacite.org/dois/10.17632/72md54c7n7.1) |
| **Globe artichoke** | Aerial imagery studies can inform spacing and count experiments. A field-scale XYZ survey with complete metric plant centers and verified reuse terms remains an open gap. [Published artichoke center errors and missed plants](research-evidence.md#what-researchers-have-measured) | Dataset terms unconfirmed. [Field study](https://www.sciencedirect.com/science/article/pii/S0168169923005732) |

## How often do weeds share a photo with a young tomato?

Moreno, Rivera Cárdenas and Andújar photographed early-season tomato fields in Santa Amalia, Spain, from about 1–1.5 m overhead. Experts drew a rectangle around each recognized plant. We read the two COCO annotation files and checked their class names against the accompanying YOLO lists. The scans in Crop Trainer measure height. These field photos measure a plant’s **projected footprint in pixels**. [Dataset and authors](https://doi.org/10.20350/digitalCSIC/17475) · [Acquisition and annotation paper](https://doi.org/10.1016/j.dib.2025.112249)

| Annotation file | Photos | Tomato boxes | Named weed boxes | Unidentified boxes |
| --- | ---: | ---: | ---: | ---: |
| TOMATO_1 · 2021 | 938 | 1,075 | 7,293 | 692 |
| TOMATO_2 · 2022 | 278 | No tomato class | 11,689 | 242 |

Of the 626 photos with a labeled tomato in 2021, **620 also contained a named weed**. On 111 of those 620 photos, the largest named weed box covered more pixels than every tomato box in the frame. And 205 of the 1,075 tomato boxes intersected at least one named weed box. We counted each tomato once when the rectangles shared positive area. Rectangle overlap can occur where the leaves themselves do not touch.

For a synthetic test, include weeds beside seedlings and vary their size independently. A rule that picks the largest plant in a patch will sometimes pick a weed even with perfectly drawn boxes. The photos provide neither a soil-height map nor surveyed stem centers, so they cannot score the browser detector in centimeters.

**Match classes by name when comparing years.** COCO category 6 means tomato (`LYPES`) in 2021 and unidentified (`NR`) in 2022. The 2022 export tells us which weeds were labeled. Tomato presence in those frames is unknown. Using those frames as crop-free examples or testing second-year tomato recall would require additional labeling.

**Replay with the small download.** Extract only `Annotations_extra.zip` from the deposit. From the repository root run the following command with Node. The database license calls for attribution and has share-alike terms for publicly used adapted databases. The app distributes the counting code and aggregate results. [Annotation archive](https://digital.csic.es/bitstream/10261/396144/8/Annotations_extra.zip) · [License and citation](https://digital.csic.es/bitstream/10261/396144/9/README.txt) · [Counting code](../benchmark/studies/tomato-field-boxes.mjs)

```sh
node benchmark/studies/tomato-field-boxes.mjs /path/to/Annotations_extra/coco_Annotations/*.json
```

## How much of a lettuce plant has measured depth?

A leaf visible in a color image can leave a hole in the depth map. Milella and colleagues photographed romaine lettuce outdoors in Bari, Italy, with a RealSense D435 about 0.9–1.3 m above the ground. We matched all 128 plant masks to their color-aligned 16-bit depth maps. Some frames show two separately masked plants. A white pixel selects the focal plant and a zero depth means the camera supplied no distance there. [Study, files and mask definitions](https://github.com/ispstiima/AgRibotLeafyVeg/tree/6a1b5e79ffef06bd7d9444280d2e4243d62d1500) · [RealSense depth encoding](https://dev.realsenseai.com/docs/projection-in-realsense-sdk-2-0/)

| 2025 visit (32 plants each) | Median plant mask area (pixels) | Median mask with nonzero depth | Adjacent in-mask pixels both missing | Expected after shuffling within each mask |
| --- | ---: | ---: | ---: | ---: |
| April 15 | 6,838 | 83.3% | 15.65% | 3.64% |
| April 30 | 31,003 | 96.6% | 2.80% | 0.15% |
| May 13 | 93,152 | 96.7% | 4.20% | 0.38% |
| May 21 | 107,398 | 99.3% | 0.81% | 0.02% |

The earliest visit had the smallest projected plants and the most missing depth. Gaps clustered on all four dates. For a synthetic robustness test, compare **scattered missing returns** with **contiguous gaps** at the same total return count and score the same held-out plants. These camera measurements motivate that comparison. Selecting a LiDAR dropout rate requires measurements from the target scanner.

We counted each horizontal and vertical neighbor pair inside a mask once. For a mask with `k` missing pixels out of `n`, randomly relocating its holes gives each pair a `(k/n) × ((k−1)/(n−1))` chance of losing both ends. The last two columns pool pairs within each date. Coverage and area are per-plant medians. The researchers harvested different plants at each visit. Camera height, view, plant size, weather and mask alignment could all affect coverage. A nonzero distance can still be wrong. Pixels outside a focal mask include neighboring plants, so this check cannot separate soil from foliage or score plot-wide plant detections.

To replay locally, download the [pinned CC0 collection](https://github.com/ispstiima/AgRibotLeafyVeg/tree/6a1b5e79ffef06bd7d9444280d2e4243d62d1500). The offline check uses Node and ImageMagick (`magick` or `convert` on your path). It needs only the `plant_mask_*.png` and `depth_aligned_*.raw` files, in their original date and plot directories.

```sh
node cli/lettuce-depth.mjs /path/to/AgRibotLeafyVeg
```

### Does the detector notice the shape of a gap?

We tested the gap pattern on synthetic romaine. Each 30,000-ray plot supplied three scans from the same coordinates. One kept all returns. The second dropped a random 20% of each plant’s returns, rounded per plant. The third dropped exactly as many from the same plant by removing the returns nearest a randomly chosen spot in the XY plane. Every soil return stayed. One four-unit network trained on six mixed-layout fields; six new planting seeds screened the comparison and six more confirmed it with the same weights and cutoff.

| Confirmation layout | Complete scan F1 | Scattered gaps F1 | One patch per plant F1 | Height-peak baseline F1 (same three scans) |
| --- | ---: | ---: | ---: | --- |
| Grid | 0.858 | 0.787 | 0.778 | 0.608 / 0.593 / 0.587 |
| 64-ring layout | 0.881 | 0.810 | 0.804 | 0.721 / 0.703 / 0.695 |

These are pooled 10 cm matches. Across the six grid scans, both masks removed 2,173 of 180,000 returns (1.2%). True matches fell from 977 to 847 (scattered) or 834 (patches), out of 1,287 plants. Both masks removed 1.3% of all returns on the ring layout. Losing canopy samples hurt on both layouts. The smaller difference between patch and scattered loss changed direction on the screening grid at 10 cm. A useful scanner check is to record returns **per plant**, alongside the total point count. The 20% loss and one-patch shape are deliberately chosen stress tests for one synthetic crop form. The camera data above supplies neither a LiDAR gap radius nor a measured LiDAR loss rate.

Run the [paired synthetic study](../benchmark/studies/lettuce-return-gaps.mjs) with `node benchmark/studies/lettuce-return-gaps.mjs`. Its JSON gives both sets of seeds, the weight hash, both detectors’ scores at 7.5, 10 and 15 cm, and separate generation, fitting, masking and scoring times.

## Can a ring of returns estimate the soil height near a seedling?

A low leaf can hide the soil it grows over. We checked Crop Trainer’s ground-height calculation using five outdoor maize seedling plots from Zhu and colleagues’ **Crops3D**. Their FARO terrestrial laser scans include a ground label (`scalar_sf = 0`) and a separate ID for each plant. We used every maize file in the authors’ instance-segmentation test list. The tomato collection in this release was photographed in a greenhouse and its labels cover plant organs. [Dataset and CC0 license](https://doi.org/10.6084/m9.figshare.27313272) · [Acquisition and labels, Table 2](https://doi.org/10.1038/s41597-024-04290-0) · [Authors’ file guide](https://github.com/clawCa/Crops3D#data-format-description)

**How close was the estimate?** Across 9,318,986 measured points, 160 plant IDs provided query locations. Only 99 had enough nearby labeled ground to check a height. The reference was the median of the lowest ground-labeled returns in occupied cells within 10 cm. The estimates below used all returns without their labels. Both summaries give each eligible plant equal weight. The table assumes the raw scanner axes are in metres. The source PLY files omit unit and coordinate-system metadata.

| Where the estimator looked | Median absolute difference from visible ground | 90th percentile | Within 35 mm of the reference |
| --- | ---: | ---: | ---: |
| Whole plot | 3.2 mm | 84.3 mm | 85 / 99 |
| Ring 15–30 cm from the query | 2.1 mm | 72.1 mm | 84 / 99 |

The ring’s height spread tells a different story. Across the 99 queries, the median distance between its 20th and 80th percentiles was **163.2 mm** using all occupied-cell minima. Restricting the same rings to ground-labeled returns gave **5.1 mm**. A cell whose lowest visible return is a leaf can make the spread large even on fairly level soil. All 160 rings had sufficient returns. In the inner reference patch, 22 plants had zero ground-labeled cells, 16 had one, and 23 had two. Those 61 were excluded from both methods. These maize scans do not establish tomato detection accuracy.

**Replay.** Extract `maize-2.ply`, `maize-3.ply`, `maize-11.ply`, `maize-12.ply` and `maize-14.ply` from `Crops3D_IS/IS/` in the original archive. From the Crop Trainer repository run the command below. It reports each plant ID, its coverage, signed differences and the paired spreads. A positive difference means the estimated surface was above the visible-ground reference.

```sh
node cli/maize-ground.mjs /path/to/Crops3D_IS/IS
```

We used the raw XY plane and treated Z as up. No survey correction or detrending was applied. Each query is the cell containing the mean XY of that plant’s labeled points, which can be displaced from the stem. The 5 cm grid starts at coordinate zero on both axes. Both estimates take the nearest-rank 20th percentile of occupied-cell minima. A query needs three occupied ring cells and three ground-labeled inner cells. Distances use cell-center offsets. The inner reference cells and the ring are disjoint. The whole-plot baseline includes the inner cells and has access to their heights without seeing their labels. This checks agreement with exposed ground near a plant. Measuring the soil directly under an obscuring leaf calls for an independent survey.

For an independently calibrated soil measurement, Herodowicz-Mleczak and colleagues photographed tilled fields near Poznań using a leveled frame and checkpoints. The standard deviation of heights in seeder-treated surfaces ranged from **6.21 to 34.42 mm**. This statistic describes variation across a soil surface at 1 mm map resolution. The archive includes measurements by tillage treatment and field. [Field method and Table 2](https://doi.org/10.1029/2021MS002578) · [Data and attribution](https://zenodo.org/records/4936484) · [CC BY 4.0 license](https://api.datacite.org/dois/10.5281/zenodo.4936484)

## Can we check the shape of the simulated apple branches?

Purdue’s dormant apple dataset pairs Kinect 2 depth images with numbered photographs of the primary branches on nine trees. Six trees were scanned outdoors and three indoors. Akbar and colleagues measured branch diameters about 6.35 cm from the trunk and the spacing between successive branch attachments. Compare those measurements with the same locations on the simulator’s dormant trees. The numbered photographs also let you check which branches a front or rear view misses. A test of broken scaffolds would still need labeled breaks or matching scans before and after a known removal. Purdue lists a public 19 GB archive. Its download page gives no explicit data reuse license. [Measurement method and examples, §§3–4](https://openaccess.thecvf.com/content_cvpr_2016_workshops/w9/papers/Akbar_A_Novel_Benchmark_CVPR_2016_paper.pdf) · [Purdue data archive](https://engineering.purdue.edu/RVL/CVPRW_Dataset/)

Cornell’s AppleQSM study measured 84 twelve-year-old trees in a tall-spindle orchard in Ithaca, New York. Its three rows give separate height ranges for the SnapDragon and RubyFrost cultivars. When comparing a generator, measure from the soil at the trunk to the highest point of the tree. For branch diameter, Cornell used a disc 5 cm from the trunk–branch junction on 106 branches from nine trees. The team measured trunk diameter relative to a protective cover, so reproducing that comparison requires the cover height. The paper publishes summary measurements and links the analysis code. The authors offer raw scans by request. [Field methods and Tables 1–2](https://pmc.ncbi.nlm.nih.gov/articles/PMC11077705/#T1) · [Apple generator and shape checks](../trainer/plants/apple.md)

## Can we score apple trunk locations on a surveyed orchard?

We could verify apple LiDAR scans and published trunk surveys. None of the releases checked supplied both a registered scan and an independent trunk-base coordinate for every tree in a stated plot.

- **Trzebnica, Poland.** Hadas and colleagues surveyed the bottoms of 50 selected apple stems with about 3 cm horizontal accuracy. The public deposit describes 476 trees and its two apple archives contain normalized ground and above-ground point clouds. A team could inspect how many low returns reach the stems today. To score pins, it would also need the original base coordinates and the boundary of a fully surveyed patch. The deposit is CC BY 4.0. [Field methods, §2.3](https://isprs-archives.copernicus.org/articles/XLII-2/407/2018/isprs-archives-XLII-2-407-2018.pdf) · [Data and file manifest](https://zenodo.org/records/15831891) · [License](https://api.datacite.org/dois/10.5281/zenodo.15831891)
- **OrchardQuant-3D, England.** The authors positioned 1,104 apple trees using row-end centroids and row geometry, with interpolation at gaps. The v1.2 RTK archive contains four region-of-interest points in `roi_points.shp`. These can help locate a plot, but they cannot establish the position of each trunk. For the separate Nanjing pear orchard, the public `Data_pear.zip` contains a dormant scan and a flowering scan, both LAS, with no separate table of surveyed trunks. Its seasonal coverage could test whether the same pins reappear. The stated BSD license covers the code and algorithms. [Study methods](https://doi.org/10.1111/pbi.70229) · [Release and RTK archive](https://github.com/The-Zhou-Lab/OrchardQuant-3D/releases/tag/V1.2)
- **Tree-SLAM, Netherlands.** Researchers measured all 65 trees in one apple row with an RTK survey pole. They took a reading on each side of each trunk and averaged the opposite readings to locate its center. Their public CC BY 4.0 archive contains 8,917 images and 8,917 YOLO label files for apple and pear trunk segmentation. Replaying the apple location test would require the separate mapping recordings, the 65 surveyed coordinates and their shared frame. [Survey method and row counts, §2.2](https://arxiv.org/html/2507.12093v1#S2.SS2) · [Versioned data and license](https://doi.org/10.4121/5b453456-60ef-4fc7-a3af-d6609906d85c.v1)
- **SeeTree, Washington.** This map covers 16 rows of Jazz apples. The team located trees by combining RGB-D trunk detections with vehicle-mounted RTK and averaging repeated sightings. They removed obstructed views and placed a few hidden trees between their neighbors. Treat those coordinates as estimates when testing an occluded trunk. The 200 tagged trees identified which tree the robot had reached. [Map construction, §3.2](https://doi.org/10.1016/j.compag.2024.109454) · [Authors’ sample map and recordings](https://github.com/Jostan86/pf_orchard_localization#usage)
- **Azumai, Japan.** Nishiwaki and Emaru registered a UAV-mounted Ouster OS1-64 scan to a UTM map. Their seven independent GNSS reference readings were taken with the antenna overlapping the tree canopy, for tree identification at a target accuracy of one metre. They do not establish the soil-entry point of a trunk at 15 cm. The preprint is CC BY 4.0. We found no paired release of surveyed tree bases and raw scans for this experiment. [Acquisition and reference placement, §§2.1–2.5](https://www.preprints.org/manuscript/202303.0507/v1)
- **SEEmear, Brazil.** Embrapa released two stereo recordings from a palmette-trained Fuji orchard in Vacaria. The `.pos` file contains the moving rover’s time-stamped GNSS solution. Teams can reconstruct the trees from depth and compare trunk visibility from the two cameras. The five-file release has no separate survey of trunk centers. The dataset is CC BY 4.0. [Acquisition and files](https://zenodo.org/records/17750202) · [Rover position file](https://zenodo.org/records/17750202/files/gnss-ppk_solution-20250313140650.pos?download=1) · [License](https://api.datacite.org/dois/10.5281/zenodo.17750202)

For a new survey, record the center of each trunk where it enters the soil, including trunks hidden by foliage or guards. Save the plot boundary, coordinate frame and registration error alongside the coordinates. A count from the whole orchard cannot tell whether individual pins land within 15 cm. [Field validation protocol](field-validation.md) · [Synthetic apple locator results](orchard-bases.md)

**Another orchard reference for the low-trunk band.** TreeScope’s Merced County pistachio plot pairs aerial OS1-64 and ground-based OS0-128 scans with measurements from 70 trees. The field crew measured diameter at 30 cm above ground, inside the height range used by Crop Trainer’s experimental ranker. We inspected both `UCM-0523` measurement JSONs. Each has 70 tree IDs with a single `DBH` field. These measurements can check the width of visible stems. Scoring a pin’s horizontal error requires separate base coordinates. TreeScope specifies CC BY-NC-SA 4.0. [Measurements](https://tnl.treescope.org/Treescope/Treescope_v1.0_DIST/UCM-0523/ground_truth/measurements/) · [Field methods and Table II](https://arxiv.org/pdf/2310.02162) · [License and project](https://treescope.org/)

**For scanner calibration in a citrus orchard.** UC Riverside’s CitrusFarm release pairs Velodyne scans with a robot-mounted GPS-RTK receiver. The first `gt.csv` contains time-stamped receiver positions. The supplied CAD calibration places its center 0.220 m behind and 0.153 m above the LiDAR origin. Applying that offset matters when registering repeated passes. Scoring tree locations would also require a separate survey of trunk centers. The authors release this dataset under CC BY-SA 4.0. [Dataset and license](https://registry.opendata.aws/citrus-farm/) · [First trajectory CSV](https://ucr-robotics.s3.amazonaws.com/citrus-farm-dataset/ground_truth/01_13B_Jackal/gt.csv) · [Sensor frame and translation](https://ucr-robotics.s3.amazonaws.com/citrus-farm-dataset/Calibration/results/04-lidar-gps-result.txt)

**For comparing the shapes of individual orchard trees.** PilotSCAN provides summer and autumn mobile-LiDAR reconstructions. We inspected the autumn `trees.zip` directory and found 37 individually named point clouds, including `trees/A1.txt` and `trees/C14.txt`. The header of `A1.txt` includes XYZ, ring, elevation angle, `passing_beams` and `local_transmittance`. Those fields give a starting point for investigating how much of a canopy a scan sees. The authors manually segmented these trees from the registered scans. Their `tf.zip` describes the sensor poses used in reconstruction. The release lists no independent survey of where each trunk enters the soil. Use the tree crops to compare structure across scans and check registration before interpreting an apparent shift as damage. Both reconstruction deposits specify CC BY 4.0. [Autumn tree files and methods](https://doi.org/10.5281/zenodo.20031878) · [Summer companion](https://doi.org/10.5281/zenodo.20030062)

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

### Did the vineyard scanner miss the lower part of the plant?

We checked the raw April 9 returns around the published trunk coordinates. We counted each 5 cm XY cell containing a return **within 15 cm horizontally of the coordinate and 15–50 cm above the fitted ground plane**. That band can contain grass, supports or wood. A count there measures sampled space. Identifying the trunk surface requires a material label.

Across all 52 vines, the original laser scan had at least one such return in every neighborhood. Keeping the highest point per cell retained 543 of 1,251 near-trunk cells with a return still in the band, covering 48 of the 52 vines. Among those 48, the frozen model placed four pins within 15 cm. It also matched two of the four vines without a retained low return. Four vines are too few to estimate a difference between these groups.

Could exposing those low returns help the detector? We made a second input by keeping only the highest measured point **inside the band** in every plot cell. Both inputs used the same saved weights, height-only baseline, survey and ground plane. After checking the original center strip, we froze the rule and tested the disjoint strips immediately north and south. Each held 17 other surveyed vines.

| Strip | Surveyed vines | Vines with a proposal within 15 cm | Learned matches within 15 cm | Height-only matches within 15 cm |
| --- | ---: | ---: | ---: | ---: |
| Center | 18 | 8 → 10 | 1 → 0 | 2 → 4 |
| North | 17 | 14 → 8 | 2 → 0 | 3 → 2 |
| South | 17 | 11 → 11 | 3 → 0 | 2 → 3 |

Each arrow runs from the original highest-point input to the band-only input. On the 34 held-out vines, the frozen network lost all five of its 15 cm matches. The height baseline matched five under either preparation, with 107 extra pins on the original input and 99 on the band-only input. More visible low surfaces alone did not rescue localization. These strips share one site, date and scanner registration. They support a within-site comparison. [Dataset paper and acquisition methods](https://doi.org/10.1016/j.dib.2026.112614) · [Versioned dataset and license](https://doi.org/10.5281/zenodo.18259014)

We also checked whether removing the upper canopy had concealed a benefit. On the same three strips, we kept every original point and added the highest distinct in-band point in each cell. Adding 2,301 measured points left the proposal counts and both detectors’ scores unchanged at all three tolerances. The current proposal rule uses a grid of maximum heights. A detector that explicitly scores **vertical support below the canopy** would test a different use of the raw measurements. This follow-up used the same 52 vines after the strip results were known.

**Replay with the April archive and the saved weights from the instructions above.** The preparation commands create new directories. The study prints counts for both coverage groups, per-tolerance scores for both detectors on all three inputs, and separate preparation and scoring times. The optional strip argument defaults to the original center plot.

```sh
node benchmark/studies/vineyard-low-band.mjs /path/to/extracted-dataset vine-strip vine-weights.json
node benchmark/studies/prepare-vineyard.mjs /path/to/extracted-dataset vine-north north
node benchmark/studies/vineyard-low-band.mjs /path/to/extracted-dataset vine-north vine-weights.json
node benchmark/studies/prepare-vineyard.mjs /path/to/extracted-dataset vine-south south
node benchmark/studies/vineyard-low-band.mjs /path/to/extracted-dataset vine-south vine-weights.json
```

### Can stacked returns locate a vine trunk?

Imagine viewing a stake from the side. Several laser returns can form a narrow vertical column. From above, that column might look like just one dot. We tested whether a rule that keeps this vertical information can find the surveyed vine bases. We reserved the April 19 and January 30 scans before evaluating the rule. Both revisit the same 52 vines from April 9. They test a different acquisition and season at one site. [Gomes and colleagues’ acquisition methods](https://doi.org/10.1016/j.dib.2026.112614) · [TLS-Grapevine2024 data and attribution, CC BY 4.0](https://doi.org/10.5281/zenodo.18259014)

**Are there unused surveyed vines for a new test?** Matching the published trunk coordinates against the three strip CSVs accounts for all 52 distinct horizontal positions once each (18 central, 17 north, 17 south). The other point layers record registration targets and scanner stations. Another visit here can test changes in visibility over time. An independent planting test needs newly surveyed positions. [Survey files and description](https://doi.org/10.5281/zenodo.18259014)

We divided the space 15–55 cm above the fitted soil plane into eight 5 cm layers. At every occupied ground cell, the rule looks in a 15 × 15 cm neighborhood and counts the longest sequence of occupied layers. It ranks longer stacks first, breaking ties by the number of occupied 3D cells and then by ground-cell index. A footprint rule uses only the number of occupied ground cells in that same neighborhood. Both place pins at least 65 cm apart, with a pin budget equal to the existing synthetic-trained model’s prediction count on each strip. All methods use the same April ground planes and plot boundaries at all dates.

| Acquisition, 52 reference bases per date | Pins per method | Model matches within 15 cm | Footprint matches | Vertical matches at 7.5 / 10 / 15 cm | Vertical extra pins / missed vines at 15 cm |
| --- | ---: | ---: | ---: | ---: | ---: |
| April 9, 2024 · early leaves, previously studied | 61 | 6 | 2 | 9 / 11 / 17 | 44 / 35 |
| April 19, 2024 · inflorescences emerging | 60 | 13 | 10 | 9 / 11 / 17 | 43 / 35 |
| January 30, 2025 · dormancy | 59 | 4 | 3 | 5 / 9 / 19 | 40 / 33 |

**The April 19 gain came from the middle strip.** Our rule had to beat both the frozen model and the footprint at 15 cm on each outer strip. It failed on both. In the north, it matched two of 17 vines and both comparators matched four. In the south, it matched four of 17, versus five for the model and three for the footprint. In the center, the model found four of 18 and the column rule found 11. On the dormant scan, the column rule found three in the north and seven in the south, up from one and zero with the model.

Does the full stack add information beyond simply having many returns near a plant? We added two controls after inspecting April 9 and before scoring either reserved date. Ranking by the **number of returns** in the neighborhood found 14 vines at 15 cm on each date. Keeping only the **highest occupied layer inside the band** per ground cell, then ranking by the stack across adjacent cells, found 10, 18 and 17 on the three dates. The full stack helped on some dates and strips. A stake, weeds or another structure can also produce stacked returns. Identifying their material, or validating an apple tree’s trunk base, requires separate labels. The browser’s vineyard detector still uses the original fitted weights.

**Replay locally.** First prepare `vine-strip`, `vine-north`, `vine-south` and `vine-weights.json` using the April instructions above. Set `scan` to the local processed LAS for each acquisition. The archive filenames are `BBCH13_20240409_TLS.las`, `BBCH55_20240419_TLS.las` and `BBCH00_20250130_TLS.las`. Only the study code is distributed here. On one CPU, reading and binning all three strips took 5–10 seconds per acquisition. Every JSON report includes scan counts, timings, the weight hash and per-distance scores for the learned, height-only and geometric methods. [Column measurement and scoring code](../benchmark/studies/vineyard-vertical-support.mjs)

```sh
scan=/path/to/BBCH55_20240419_TLS.las
for strip in vine-strip vine-north vine-south
do
  node benchmark/studies/vineyard-vertical-support.mjs "$scan" "$strip" vine-weights.json
done
```


### Can the same rule find trunks at a second vineyard?

At block B7 in Tomiño, Spain, Vélez and colleagues measured trunk positions using a Trimble R2 GNSS receiver. They photographed the plot from a drone and surveyed it with a DJI Zenmuse L1 laser on July 14, 2022. We reserved both captures before placing any pins. We ran the same three detectors on every 10 m square containing a survey record, keeping the Portuguese model, ground-plane estimator, column rule and pin spacing fixed. Each capture supplied its own soil estimate, derived from the lowest returns in occupied cells. [EscaYard field methods](https://doi.org/10.1016/j.dib.2024.110497) · [VineLiDAR flight and instrument](https://doi.org/10.1016/j.dib.2023.109686)

| Drone capture | Returns in 26 squares | Pins per method | Model matches at 7.5 / 10 / 15 cm | Footprint matches | Vertical-column matches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Red-band photo reconstruction, 30 m flight | 1,079,430 | 550 | 2 / 4 / 11 | 2 / 2 / 8 | 6 / 7 / 21 |
| DJI L1 LiDAR, 30 m flight | 8,008,361 | 1,006 | 3 / 6 / 11 | 1 / 6 / 10 | 6 / 13 / 32 |

The denominator is **138 trunk-position records**. One pair is only 2 cm apart. The release does not establish a complete census for all 26 squares, so unmatched pins could include other living vines. We report one-to-one matches to recorded positions and leave false-alarm rates open. The geometric methods receive the model’s pin count within each square. The LiDAR row has more available pins, so the difference between capture rows cannot be attributed to sensor quality alone.

At 15 cm, the column rule matched more survey records than the model in **14 of 26 LiDAR squares**, fewer in five and the same in seven. For the photo reconstruction the corresponding counts were 12, four and ten. After scoring, we checked whether each recorded location had any possible column within 15 cm. All **138 of 138** had one in the LiDAR, and **120 of 138** in the photo reconstruction. Each qualifying 5 cm ground cell had a return 15–55 cm above the estimated ground. Many available columns never became matching pins. A column can contain leaves, grass or trellis material. The survey marks the plant’s location and gives no material label for those returns.

**Alignment changed the answer.** The survey’s projection file specifies ETRS89 / UTM 29N (EPSG:25829). Both cloud headers specify WGS 84 / UTM 29N (EPSG:32629). The standard ETRS89-to-WGS84 operation changes the nominal projected coordinates here by less than 1 mm and lists 1 m accuracy. We used the published XY values and fitted no shifts. We also moved the survey 25 cm in four prespecified directions as a sensitivity check. Moving it east changed the LiDAR model/column matches at 15 cm from **11/32 to 17/8**, and the photo comparison from **11/21 to 18/6**. Survey targets measured independently in both capture frames would be needed to establish centimeter-level registration. [Coordinate operation, EPSG 1149](https://epsg.io/1149)

**Where are the alignment checkpoints?** EscaYard’s 16 released files include trunk positions, a plant health table, smartphone photographs, ten photo-derived clouds and two orthomosaics. VineLiDAR supplies ten laser clouds. We found no B7 target-ID/XYZ pairs or measured horizontal checkpoint residuals in either release. The reflectance panel in the imaging methods calibrates image brightness. A related 2021 deposit does supply surveyed black-and-white targets in `GCPs.zip`. All seven PointZ coordinates fall outside the July B7 clouds, the nearest about **143 m** beyond their bounds. They were photographed at the neighboring B9 site. [EscaYard inventory and methods](https://doi.org/10.1016/j.dib.2024.110497) · [VineLiDAR inventory](https://zenodo.org/records/8113105) · [Surveyed targets](https://zenodo.org/records/7383601) · [Marker photograph and survey method](https://doi.org/10.1016/j.dib.2022.108876)

**What can those seven targets check?** VineLiDAR’s September 16, 2021 flight at 30 m over B9 matches the date and block of the published checkerboard survey. Its 15,166,707 colorized returns use local coordinates. The LAS header contains no map projection, and its reported horizontal bounds are all zero. Reading the actual points gave X from −0.10 to 78.67 m and Y from −3.56 to 120.90 m. The nominal coordinate published for the vineyard describes the site. It does not locate the cloud’s origin. [September data and flight dates](https://doi.org/10.1016/j.dib.2023.109686) · [Survey and marker photograph, Fig. 3](https://doi.org/10.1016/j.dib.2022.108876)

We visually inspected all seven search windows for a square with alternating light and dark quarters. Six identifiable targets appeared. ID 1 had no resolved checker. At ID 4 an elongated blue object was brighter than the marker. We used the second-ranked patch with the checker pattern. We estimated only a horizontal translation, using IDs 2, 3 and 4. At IDs 5, 6 and 7 the horizontal residuals were **3.5, 0.8 and 7.9 cm** (5.0 cm root mean square). Those three markers were inspected before we chose the split and were excluded from the fit. The result checks manual marker identification and relative alignment for one B9 flight. The sample is too small for a site-wide accuracy estimate. No tree coordinates entered the calculation, and the July B7 comparison uses its own published coordinates.

To replay, decompress the September 16, 30 m B9 LAZ to point-format-7 LAS and extract the neighboring survey’s `GCPs.dbf`. The code counts bright, near-neutral blue returns in 4 cm cells within 8 m search windows and estimates a center from the occupied bright cells around each reviewed patch. Giving a new output directory as a third argument writes the local color previews for inspection. [Survey files](https://zenodo.org/records/7383601) · [Laser flights](https://zenodo.org/records/8113105) · [Checkpoint measurement and reviewed IDs](../benchmark/studies/vineyard-b9-checkpoints.mjs)

```sh
laszip -i 20210916_FLEXIGROBOTS_L1_PRO_30M_4MS_B9.laz -o b9-september.las
node benchmark/studies/vineyard-b9-checkpoints.mjs b9-september.las GCPs.dbf b9-previews
```

**Replay the B7 detector comparison.** Extract `trunk_locations_VineyardB7.zip` and download the red B7 LAS from EscaYard. Get the July 14, 30 m B7 LAZ from VineLiDAR. LASzip decompresses the laser file into LAS. Train `vine-weights.json` using the CPU command under “Replay the vineyard test” above. The study selects grid squares using the survey, fits a plane in each from scan heights alone, and matches predictions across plot boundaries. The final CPU passes took about 10 seconds for the photo cloud and 56 seconds for the laser cloud on this machine, excluding download and LAZ decompression. Both deposits are by Vélez and colleagues and use CC BY 4.0. [EscaYard files](https://zenodo.org/records/10362568) · [VineLiDAR files](https://zenodo.org/records/8113105) · [LASzip](https://laszip.org/) · [Local comparison code](../benchmark/studies/vineyard-b7.mjs)

```sh
laszip -i 20220714_FLEXIGROBOTS_L1_PRO_30M_4MS_B7.laz -o b7-laser.las
node benchmark/studies/vineyard-b7.mjs 20220714_FLEXIGROBOTS_B7_30M0G_MS_PRO_Red_densified_point_cloud.las trunk_locations_VineyardB7.shp vine-weights.json
node benchmark/studies/vineyard-b7.mjs b7-laser.las trunk_locations_VineyardB7.shp vine-weights.json
```

### Does the B7 result hold in the neighboring vineyard?

We froze the three-marker B9 translation before scoring a single trunk. The separate `Trunk_locations.zip` contains 121 distinct RTK coordinates. The survey covered three selected rows, and two records are just 7 mm apart. Across the 28 grid squares that contain those records, the 30 m laser flight supplied **11,678,611 returns**. All squares had sufficient ground-plane samples. We kept the Portuguese weights, the 15–55 cm height band and the 65 cm pin spacing. Three of the 28 squares had too few separated candidate positions for the column rule to fill the model’s pin count. [September survey and methods](https://doi.org/10.1016/j.dib.2022.108876) · [Same-day drone laser acquisition](https://doi.org/10.1016/j.dib.2023.109686)

| Frozen method | Pins placed | Survey records matched at 7.5 / 10 / 15 cm | Survey records missed at 15 cm |
| --- | ---: | ---: | ---: |
| Synthetic-trained model | 1,536 | 3 / 6 / 11 | 110 |
| Ground footprint | 1,495 | 4 / 4 / 8 | 113 |
| Vertical columns | 1,475 | 0 / 0 / 2 | 119 |

The column rule lost to the model in nine squares at 15 cm, won in one and tied in 18. After seeing that the geometric rules sometimes ran out of candidates, we repeated the comparison with exactly the same number of pins in each square for all methods. That left 1,475 pins per method and reproduced every match count in the table. Extra pins outside the reference rows could land on other vines. A false-alarm rate requires a complete survey of the scored area.

All **121** survey coordinates had an occupied 5 cm ground cell within 15 cm when returns at every height were counted. Restricting cells to returns 15–55 cm above the estimated soil left just **64** coordinates with a candidate nearby. The rule placed a matching pin at two. Both the availability of low returns and the choice among nearby candidates deserve attention. With each of the four prespecified survey shifts (25 cm east, west, north or south), the column rule matched 13, 7, 7 and 6 records at 15 cm. The model matched 8, 7, 5 and 11. We kept the checkpoint-based alignment for the main result. The difference between the B7 and B9 results could arise from plot structure, acquisition geometry, season, registration or their combination.

**Replay B9 locally.** Use the same September LAS and `GCPs.dbf` as for the checkpoint check. Add `Trunks.shp` from the survey deposit and the CPU-generated `vine-weights.json` from “Replay the vineyard test.” The command recalculates the translation from checkerboards before loading trunk positions. One CPU run took about 3 seconds for registration and 21 seconds for the detector comparison, excluding download and decompression. [Survey files, CC BY 4.0](https://zenodo.org/records/7383601) · [Laser files, CC BY 4.0](https://zenodo.org/records/8113105) · [Scoring code](../benchmark/studies/vineyard-b9.mjs)

```sh
node benchmark/studies/vineyard-b9.mjs b9-september.las GCPs.dbf Trunks.shp vine-weights.json
```

### Can we compare the 30 m and 50 m vineyard scans?

A vine detector can appear to miss a trunk if its scan and survey maps are even a few centimeters apart. The September 16, 2021 B9 deposit offers two DJI L1 flights over the **same vines**, flown at 4 m/s. The 50 m flight began at 17:00 and the 30 m flight at 17:15. We reserved the higher flight to see whether its own ground markers could align it accurately enough for the same detector test. [VineLiDAR flight table](https://doi.org/10.1016/j.dib.2023.109686) · [Survey and marker photograph](https://doi.org/10.1016/j.dib.2022.108876)

Before opening the 50 m scan, we required recognizable checkerboards at survey IDs 2, 3 and 4 to fit a translation. At least three of IDs 1, 5, 6 and 7 had to be recognizable to check it. We kept the original 4 cm raster and minimum of 12 bright cells per marker. The three or more check distances had to average at most 7.5 cm in root mean square, with each at most 15 cm. We inspected the fitting windows first. The table gives the strongest patch in each window, so these counts are **upper bounds** on the bright cells in a recognizable checkerboard.

| Intended role | Survey marker IDs | Bright cells in strongest patch, same order | Result |
| --- | --- | --- | --- |
| Fit the map | 2, 3, 4 | 25, 8, 28 | ID 3 falls below 12. ID 4 shows alternating quarters. |
| Check the map | 1, 5, 6, 7 | 4, 12, 1, 17 | Only IDs 5 and 7 reach 12. Three checks are required. |

The 50 m file contains **9,597,830 returns**, yet the marker detail is insufficient to establish an independent translation by this method. We stopped before loading trunk positions or model weights. The 30 m fit still applies to its own flight. Comparing detector accuracy across these heights requires stronger alignment evidence for the 50 m scan. Further reference marks with documented ground coordinates and identifiable centers in the 50 m returns would make that comparison possible.

**Replay the alignment check locally.** Download the 50 m B9 LAZ from the flight deposit and `GCPs.dbf` from the survey deposit. The published MD5 for the compressed flight is `a514501e64f634ee19bf98c230c05d98`. The JSON reports the counts for each marker and whether there is enough evidence to score trunks. Both deposits credit Vélez and colleagues and carry CC BY 4.0. [Laser files](https://zenodo.org/records/8113105) · [Survey files](https://zenodo.org/records/7383601) · [Alignment code](../benchmark/studies/vineyard-b9-checkpoints.mjs)

```sh
laszip -i 20210916_FLEXIGROBOTS_L1_PRO_50M_4MS_B9.laz -o b9-september-50m.las
node benchmark/studies/vineyard-b9-checkpoints.mjs b9-september-50m.las GCPs.dbf
```
