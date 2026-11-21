# From a planted field to a scan

![Laser rays hit leaves and the soil between them.](../../art/lesson-returns.svg)

A recipe fixes the crop, seed, soil, scanner and ray budget. The generator grows the field, samples its visible surfaces and records the XYZ returns. Given the same recipe and generator version, it produces the same scan ID. [Try the field generator](https://mvalancy.github.io/crop-trainer/)

| To change | Open |
| --- | --- |
| How the plot becomes measured points and reference boxes | [Field simulation](field.js) |
| Board positions, widths and lengths | [Board layout](boards.js) |
| A crop profile or scanner layout | [Crops](crops.js) · [Sensors](sensors.js) |
| Orchard, vineyard or greenhouse infrastructure | [Growing systems](growing-systems.js) |
| How a seed becomes a particular plant | [Plant architecture controls](plant-version.js) · [Illustrated crop guides](../plants/README.md) |
| Worker progress, cancellation or scan handoff | [Scan session](scan-session.js) · [Generator worker](generate-worker.js) |

Use the field’s PLY download for XYZ and its labels JSON for the simulator’s answer key. The scanner presets approximate sampling layouts. [Scanner assumptions](../../docs/scanners.md)

With boards enabled, the original recipe places nine rectangles on randomly selected plant positions. Set `boardPlacement` to `independent` to scatter their centers uniformly over the 10 m square. A separate seeded draw sets each center, so changing the planting positions does not move the boards. Switching placements preserves their nominal widths, lengths and angles for a fixed obstacle recipe. Boards can overlap and an edge can extend beyond the plot. Only visible surfaces inside the scanned area produce returns. Omitting the option or using `plant` replays the original scan IDs. With boards off, placement has no effect on the scan or its ID.

For synthetic measurement studies, call `field(recipe, undefined, {includePlantIds:true})` to obtain a `plantIds` array aligned with the emitted XYZ points. Zero means background. A positive value is the plant’s zero-based box index plus one. Ownership follows each measured point through noise, repeated returns and soil removal. The public PLY and the detector use XYZ. [Training peak audit](../../docs/tomato-soil-sampling.md#what-did-the-laser-hit-at-a-positive-training-peak)
