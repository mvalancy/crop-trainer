![Crop Trainer. A LiDAR beam sweeps across rows of pixel-art lettuce.](art/title.svg)

# Crop Trainer

Can you teach a computer to spot a head of lettuce? Grow a virtual field, scan it into a cloud of laser dots with LiDAR, and train a tiny neural network to drop a pin on each plant. It all happens in your browser. No account, Python or downloads needed.

**[Train your first lettuce detector →](https://mvalancy.github.io/crop-trainer/trainer/)**

New to LiDAR? [Try spotting a plant in the browser](https://mvalancy.github.io/crop-trainer/#guide), then [follow one lettuce through five illustrated lessons](docs/first-steps/README.md).

## Earn your first harvest 🌱

1. **Plant lettuce.** Open the training shed and leave the starter settings as they are.
2. **Press “Generate, train & score.”** The app grows six practice fields. It knows where it planted each lettuce, so it can teach the model which clusters of dots look like plant centers.
3. **Check the harvest.** The model gets three fresh fields. On the results map, look for a green ring with no red dot nearby. You’ve spotted a plant the model may have missed.

![A scan turns lettuce into dots. The model learns from known centers, then predicts pins on a fresh field.](art/scan-learn-find.svg)

Training uses your GPU through WebGPU when available. Your CPU can do the whole run, too.

## What will you grow next?

[Explore a field in 3D](https://mvalancy.github.io/crop-trainer/#field), or try the same training run with **globe artichokes** or **young tomatoes**. Which crop is easiest to find?

Have a scan of your own? [Try your detector on a local PLY](https://mvalancy.github.io/crop-trainer/trainer/#field-test) and see how it compares with picking the tallest peaks.

[Field guide and experiments](docs/README.md) · [Agent quickstart](AGENTS.md) · [MIT license](LICENSE)

**Browse the repo** · [Training shed](trainer/README.md) · [Benchmark](benchmark/README.md) · [Test plot](test/README.md) · [Illustrations](art/README.md)
