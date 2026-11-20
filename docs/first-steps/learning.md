# How does the model learn from a mistake?

Suppose a peak receives a low score and the planting map puts it right on a lettuce. During practice the model can compare its answer with a **label**, the answer we want it to learn. Which peaks should count as practice examples in the first place?

![A ruler around a reference center shows three example peaks. At 5 cm it teaches “yes”, at 12 cm it is skipped, and at 20 cm it teaches “no”.](../../art/lesson-labels.svg)

For every practice peak, the app finds the nearest labeled center. Under 9.5 cm away earns a positive label (1). Over 15 cm earns a negative label (0). It skips the distances in between, including the two boundaries. That avoids teaching a firm answer from a borderline peak. It draws equal numbers of positive and negative examples and uses the training examples to set each feature’s average and scale.

## One update, then another

The model makes a score using its current weights. **Loss** measures how much those scores disagree with the practice labels. For a positive example, giving 0.10 incurs more loss than giving 0.80. A confidently wrong answer costs more than a close call. The app averages this penalty over a group of examples.

To update a weight, the trainer works out which direction would reduce the loss nearby. In a neural network it traces the influence of the output backward through the layers, a calculation called **backpropagation**. The **learning rate** controls the size of the step. A very small step can be slow. A very large one can overshoot. The next set of predictions uses the updated weights.

<details>
<summary>Work through one weight update with a pencil</summary>

Imagine a one-clue logistic model, with its bias held at zero for this exercise. The clue has value 1, its starting weight is 0, and the label says “yes” (1). The weighted total starts at 0, so the sigmoid gives a score of 0.50.

For this model and loss, the slope for that weight is **(score − label) × clue**. Here that is (0.50 − 1) × 1 = −0.50. With a learning rate of 0.25, subtract the scaled slope from the old weight. The new weight is 0 − 0.25 × (−0.50) = **0.125**. The next score for this clue rises to about **0.531**. The example nudged the model toward the correct answer.

What would a “no” label do at the same starting point? The slope becomes +0.50, the weight falls to −0.125, and the score drops to about 0.469. In the shed, many examples contribute to each update, and the biases can move too.

</details>

![Training loss from the 40-epoch starter CPU run, dropping from 0.651 to 0.321, with each point drawn from its recorded loss history.](../../art/lesson-loss.svg)

An **epoch** is one pass through the practice examples. The seed-27 starter used 3,052 balanced candidates, six practice fields and 40 epochs. With full-batch updates, all candidates contribute to one update per epoch. Mini-batches update the weights several times during the pass. The chart shows practice loss before each epoch’s update. Final validation uses the weights after the last update.

## Give the detector a fair exam

A **validation field** is an unseen planting kept out of fitting. The app holds out whole field seeds, since two scans of the same row can show the same lettuce. The starter uses three validation fields, each scanned with soil and with soil removed. Those six scans represent three plantings. An improving practice curve alone cannot tell you what happened to their pins.

**Try it.** Run the duration benchmark. For the same seed, compare 10, 40 and 100 epochs. Find the lowest practice loss, then find the highest mean validation F1 (the pin score explained next). Do they belong to the same run? Keep the crop and fields fixed while testing duration. CPU and WebGPU are two ways your browser can do the arithmetic. The backend, runtime and validation results are separate entries in the report. [Compare training durations](https://mvalancy.github.io/crop-trainer/benchmark/?comparison=epochs&crop=lettuce&seed=27)

[Back · What a model calculates](models.md) · [Next · How do you score its pins?](scoring.md)
