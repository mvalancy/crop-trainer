![Apple wood and seasonal leaf clusters on a central leader and a broken open-vase tree.](../../art/plants/apple.svg)

# Inside the apple orchard

Stand beside a leafless apple tree and you can usually trace a limb back to the trunk. A canopy seen from above can conceal that entire connection. Crop Trainer builds the connected wood first so the orchard can answer both questions. Where does a tree grow? Which parts would an overhead scan actually see? [Explore the central-leader orchard](https://mvalancy.github.io/crop-trainer/?crop=apple&plantArchitecture=3&plantForm=central-leader&seed=39061&sensor=reference&budget=100000&noise=clean#field)

## Read the silhouette

In a **central-leader** tree, a tapering main axis continues to the top. Lower scaffold branches typically reach farther than upper ones. The young tree shown on page 35 of the UC training handbook is a reference for this scaffold arrangement. In an **open-vase** tree the main axis ends low and several limbs rise around a relatively open center. See the photographed training examples on pages 42 and 44. Open-center apples are a useful contrast in heritage and home orchards. Commercial orchards also include spindle and planar systems that differ from both examples. [UC orchard training photographs](https://ucanr.edu/sites/default/files/2016-10/249531.pdf#page=35) · [UC IPM apple training](https://ipm.ucanr.edu/home-and-landscape/apple-training/) · [Montana State heritage apple pruning](https://agresearch.montana.edu/warc/guides/apples/heritage_orchard_management_guide/caring-for-heritage-trees/pruning.html)

## Follow a bud out from the trunk

1. The field chooses a planting position, size and organ seed. Selecting a single form grows one management system across the plot. A seeded mix assigns a form to each tree for a controlled challenge.
2. The central leader sprouts **7–9 scaffolds**, staggered around the trunk at different heights. Each scaffold bends once and tapers. The vase forks into **3–4 primary limbs** low on the trunk. Those limbs fork again near the outside of the crown.
3. Lateral shoots grow from positions on each scaffold. Their foliage is a group of rotated ellipsoids attached to those shoots. The seed varies the orientation, reach, bend, height and cluster size. Numbers in this rule are synthetic design choices.
4. The overhead scanner intersects those volumes and tapered woody surfaces. The nearest visible surface produces the return. The label marks the planting base even when leaves hide the trunk completely. Use **Plant tissue** coloring to distinguish woody returns. The optional structure overlay shows the complete modeled centerlines. [Apple generator](apple.js) · [Surface sampler](surfaces.js)

## Break a branch or take away its leaves

Choose **All plants damaged** to shorten one scaffold into a woody stub. Its distal shoots and their clusters disappear. The other scaffolds use the same random draws as in the intact tree. On a vase, losing one of three main limbs can open a large gap. On a central leader the same type of break can be much less conspicuous. **About one in four damaged** selects a reproducible subset by planting ID. [Inspect a broken vase orchard](https://mvalancy.github.io/crop-trainer/?crop=apple&plantArchitecture=3&plantForm=open-vase&plantCondition=damaged&seed=39061&sensor=reference&budget=100000&noise=clean#field)

For a second experiment, keep the same seed, form, condition, ground and ray budget. Switch **Apple foliage** from **Leaf on** to **Dormant · leaf off** and generate again. The wood and tree bases stay paired. Compare the number of woody returns, then orbit the scan to inspect which surfaces remain hidden. A vertical trunk can produce very few returns from above even in winter. [Inspect a dormant vase orchard](https://mvalancy.github.io/crop-trainer/?crop=apple&plantArchitecture=3&plantForm=open-vase&plantCondition=damaged&appleCanopy=dormant&seed=39061&sensor=reference&budget=100000&noise=clean#field)

## What would make it representative of a particular orchard?

These rules reproduce a branching relationship you can check visually. Foliage clusters approximate the occupied crown. Individual leaves, apples, bark, regrowth after injury, complex bends and row-side acquisition would need additional geometry or sensing work. A single broken scaffold is a controlled damage case. It cannot establish how often a storm produces that injury. For a particular block, record age, rootstock, cultivar, spacing and training system. Measure trunk diameter, first fork height, scaffold angles and crown widths on a calibration row. Independently survey tree bases on another row and compare predicted pin locations against that survey. AppleQSM is an example of working quantitatively with laser scans of actual apple tree branches. [AppleQSM](https://pmc.ncbi.nlm.nih.gov/articles/PMC11077705/) · [Field validation guide](../../docs/field-validation.md)

The same tree can produce a dense crown and almost no returns low on its trunk. Inspect a paired profile, then compare two ways of predicting the planting position. [Can a scan locate the base of an apple tree?](../../docs/orchard-bases.md)
