# Inside the field generator

[![A scanning beam passes over a lettuce and leaves a trail of points.](../art/title.svg)](https://mvalancy.github.io/crop-trainer/#scan-viewer)

Grow a field, zoom in on a single plant and see which leaves the laser reached. Open the paired scan comparison to find out what changes when the same planting receives fewer rays. [Open the field generator](https://mvalancy.github.io/crop-trainer/#field)

| To change… | Start here |
| --- | --- |
| Field controls, scan downloads and share links | [Generator page](../index.html) and [field controls](farm.js) |
| Orbit, pan, zoom and point colors | [3D viewer](viewer.js) |
| The interactive first lesson | [Beginner exercises](first-steps.js) and [scan patch exercise](field-lesson.js) |
| Navigation, buttons and layouts across the three pages | [Shared stylesheet](farm.css) |
| An explanation beside a control | Set `data-help` on the control. The [help buttons](help.js) use its existing label and the [help stylesheet](help.css) places the explanation. |
| How the plants grow and how a ray hits a leaf | [Plant architecture guide](../trainer/plants/README.md) and [field generator](../trainer/generator/field.js) |

The site runs directly from these browser modules. To make a change and try it on your computer, follow the [local setup](../docs/local-setup.md).
