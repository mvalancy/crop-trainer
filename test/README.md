# The test plot

![A seed packet marked 27 yields two matching rows of seedlings when the same field is grown twice.](../art/seed-replay.svg)

A seed is a field’s replay code. If a change moves the plants when you only switch off the trellis wires, a detector comparison stops being fair. The growing-system tests replay that pair and compare the plant coordinates.

From the repository root, run one small experiment with Node.js 22 or later. The second command runs the full suite.

```sh
node --test test/growing-systems.test.js
node --test
```

| What changed? | Open these checks |
| --- | --- |
| Plant geometry, fixtures or field replay | [Growing systems](growing-systems.test.js) · [Trainer](trainer.test.js) |
| Network settings or saved-weight predictions | [Networks](network.test.js) · [Inference](inference.test.js) |
| Scan files or survey coordinates | [PLY reader](ply.test.js) · [Reference labels](references.test.js) · [Field-test command](field-test-cli.test.js) |
| Plant attachments and earlier generator versions | [Lettuce, buds and greenhouse supports](plant-attachments.test.js) |
| Comparing scans or locating an apple trunk | [Paired scans](scan-study.test.js) · [Height peaks near scan gaps](peak-averaging.test.js) · [Orchard geometry and survey frames](orchard.test.js) |
| Pairing benchmark results | [Density comparisons](density.test.js) |

[Crop Trainer home](../README.md) · [Local setup](../docs/local-setup.md)

To check a slow browser start, open **Field test** with network throttling. Select a PLY and saved weights immediately. **Find plants** should become available as soon as the scan has been read, even while the trainer is checking its GPU. With labeled apple data, switch between the three overlays and check the counts against the saved CLI report. [Field test](https://mvalancy.github.io/crop-trainer/trainer/#field-test) · [Score a scan locally](../docs/scan-cli.md)
