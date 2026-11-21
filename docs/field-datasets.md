# Find a field dataset for your detector

Crop Trainer predicts one horizontal position per plant. To score a real plot, you need a metric scan and a reference position for **every plant in the plot**, both in the same coordinate frame. A labeled leaf, fruit or visible patch of canopy answers a different question. Start with the vineyard if you want a test you can replay today. Public data stays on your computer. [Local scoring guide](scan-cli.md)

| Growing system and source | What you can measure | Access and reuse |
| --- | --- | --- |
| **Vineyard · TLS-Grapevine2024** | Registered terrestrial laser scans of two rows in Portugal over nine growth stages. The archive contains 52 distinct trunk positions. Use these for base detection. The 38 vines with detailed agronomic observations are a separate subset. | CC BY 4.0. Credit Gomes and colleagues, cite the version, and describe preprocessing. [Archive](https://zenodo.org/records/18259014) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.18259014) |
| **Apple orchard · HOPS** | Tree instances, trunks and fruit across orchard point clouds. Derive a reference per tree from labeled trunk points near local ground, then inspect ambiguous trunks by hand. Keep terrestrial laser scans and reconstructed scans in separate results. Crop large files before opening them in the app. | The authors provide downloads. Redistribution terms for the full collection still need confirmation. [Project and splits](https://www.ipb.uni-bonn.de/data/hops/index.html) · [Paper](https://arxiv.org/abs/2503.13188) |
| **Apple fruit · Fuji-SfM** | Image-based 3D reconstructions of 11 trees with 1,455 annotated apples. Use for fruit localization or canopy geometry. It supplies no equivalent set of trunk-base targets. HOPS also uses Fuji-SfM in its tests. | **Conflicting license statements.** The catalog lists CC BY 4.0 and the deposited license specifies CC BY-NC-SA 4.0. Seek clarification before redistributing or using commercially. [Deposit](https://zenodo.org/records/3712808) · [Catalog](https://api.datacite.org/dois/10.5281/zenodo.3712808) · [Deposited license](https://zenodo.org/records/3712808/files/LICENSE.txt?download=1) |
| **Open-field lettuce · AgRibotLeafyVeg** | 112 overhead RealSense RGB-D observations over four dates in Bari. Each mask selects one sampled plant. Neighbors may be marked as background, so whole-frame precision and plant counts would be misleading. Use the masks to check visibility or canopy shape. For metric locations, verify camera calibration and scan pose first. | CC0 1.0. One raw depth frame and its mask were checked for matching 1280 × 720 dimensions. [Authors’ data, label definitions and license](https://github.com/ispstiima/AgRibotLeafyVeg) |
| **Greenhouse lettuce · IoT4Lettuce** | Hydroponic growing trial with 45 plants, two cultivars and several sensors, including Livox and depth cameras. One corrected Flexx2 plant PLY loaded as 5,941 XYZ points in the app parser. For a whole-bench test, establish the frame and obtain all planting positions. | CC BY 4.0. The multi-sensor archive is roughly 39 GB. [Deposit](https://zenodo.org/records/20759414) · [License metadata](https://api.datacite.org/dois/10.5281/zenodo.20759414) |
| **High-wire tomato greenhouse** | RGB images of Tasty Tom trusses with fruit, stem and organ annotations. Inspect stem lean, overlap and occlusion when designing the simulator. These images alone cannot supply registered metric trunk locations. | Authors specify CC BY 4.0. [Dataset and annotation guide](https://github.com/akshaykburusa/tomato_greenhouse_dataset) |
| **Tomato plant geometry · TomatoPGT** | 42 reconstructed scans from three vegetative plants with part labels and graph structure. Group scans by original plant when comparing geometry. Mature greenhouse rows require separate validation. | CC BY 4.0. [Versioned deposit](https://data.mendeley.com/datasets/72md54c7n7/1) · [License metadata](https://api.datacite.org/dois/10.17632/72md54c7n7.1) |
| **Globe artichoke** | Aerial imagery studies can inform spacing and count experiments. A field-scale XYZ survey with complete metric plant centers and verified reuse terms remains an open gap. [Published artichoke center errors and missed plants](research-evidence.md#what-researchers-have-measured) | Dataset terms unconfirmed. [Field study](https://www.sciencedirect.com/science/article/pii/S0168169923005732) |

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
node run.mjs train vine-training.json vine-settings.json --weights vine-weights.json
node benchmark/prepare-vineyard.mjs /path/to/extracted-dataset vine-strip
node score-scan.mjs vine-weights.json vine-strip/plot.ply vine-score.json --labels vine-strip/trunks.csv --origin 34453,180304,490.04084483709477 --grade-percent -1.491114864874099,6.625270270267329
```

3. To inspect the pins visually, open **Training shed → Field test**, select the weights, PLY and CSV, and enter the metre origin and grade percentages from `vine-strip/frame.json`. [Open Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

**How the strip was prepared.** The archive contains 33,512,063 returns in the processed LAS. A 10 × 10 m square centered on the trunk survey extent (snapped to whole metres) contained 12,058,322 returns. The adapter retained the highest measured point in each occupied 5 cm cell, giving 16,685 points. It estimated a ground plane from the low returns of 45 occupied square-metre patches. The reference CSV uses the deposited PointZ geometry in EPSG:3763. The height-only and learned detectors both see the same overhead representation. This preprocessing can discard trunk returns visible from the side.

**What the result supports.** This synthetic-only model failed to localize most trunks on one physical strip at one date. Its mean F1 across the three tolerances on its synthetic holdout was 0.150. The physical test gives us a place to inspect proposal coverage, canopy displacement and survey alignment. For future comparisons, reserve another row or site before tuning. The nine dates revisit the same vines and measure seasonal change on that planting. [Source archive and attribution](https://doi.org/10.5281/zenodo.18259014)
