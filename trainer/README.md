# Inside the training shed

![A lettuce scan becomes laser dots, a tiny network learns from them, and pins land on a fresh field.](../art/scan-learn-find.svg)

**Can your model find a lettuce it has never seen?** Choose **Generate, train & score** in the shed. The generator knows where it planted each crop. The detector learns which peaks in the scan tend to sit near those positions. Look at a fresh validation field to see which plants it found. [Open the training shed →](https://mvalancy.github.io/crop-trainer/trainer/)

Field practice gives the model about 30 seconds to learn from 16 plantings. For a short architecture comparison, select **Quick check** and keep the fields and the 40-epoch budget fixed while changing the number of hidden layers. Compare the missed plants, then use **Download model weights** to take the detector with you. [Training settings](../docs/training.md) · [Try saved weights on a local scan](https://mvalancy.github.io/crop-trainer/trainer/#field-test)

| Follow a plant through the app | Start here |
| --- | --- |
| Grow lettuce, apples and five other crop or growing-system profiles | [Illustrated plant guides](plants/README.md) |
| Send rays through a seeded field and export the returns | [Generator](generator/README.md) |
| Compare two scans of the same planting | [Paired scan studies](study/README.md) |
| Fit a detector and inspect its scoring rules | [Models](models/README.md) |
| Change the layer diagram or live training display | [Interface](ui/README.md) |
| Run saved weights on a local XYZ scan | [Field test](field-test/README.md) |

[Training page](index.html) · [Page controller](main.js) · [Crop Trainer home](../README.md) · [Compare two runs](../benchmark/README.md)
