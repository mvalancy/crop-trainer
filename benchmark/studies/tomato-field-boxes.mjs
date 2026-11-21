// Count labeled tomato/weed encounters in the DIGITAL.CSIC COCO exports.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const weedNames = new Set(["SOLNI", "POROL", "CYPRO", "SETVE", "ECHCG"]);

function intersects([x, y, w, h], [u, v, p, q]) {
  return x < u + p && u < x + w && y < v + q && v < y + h;
}

function largestArea(boxes) {
  return Math.max(...boxes.map(([, , width, height]) => width * height));
}

function countPhotos({ categories, images, annotations }) {
  const names = new Map(categories.map(({ id, name }) => [id, name]));
  const validClasses = new Set(["LYPES", "NR", ...weedNames]);
  for (const name of names.values()) {
    if (!validClasses.has(name)) throw new Error(`Unknown plant class: ${name}`);
  }
  const photos = new Map(images.map(({ id }) => [id, { tomatoes: [], weeds: [] }]));
  const result = {
    images: photos.size, annotations: annotations.length,
    classNamesById: Object.fromEntries(names),
    tomatoBoxes: 0, namedWeedBoxes: 0, unidentifiedBoxes: 0,
    photosWithTomatoes: 0, photosWithBoth: 0,
    tomatoBoxesIntersectingWeeds: 0, photosWhereLargestWeedExceedsEveryTomato: 0,
  };
  for (const { category_id, image_id, bbox } of annotations) {
    const name = names.get(category_id);
    const photo = photos.get(image_id);
    if (!name || !photo) throw new Error("Annotation without a declared image or category");
    if (name === "NR") {
      result.unidentifiedBoxes++;
    } else if (name === "LYPES") {
      photo.tomatoes.push(bbox);
      result.tomatoBoxes++;
    } else {
      photo.weeds.push(bbox);
      result.namedWeedBoxes++;
    }
  }
  for (const { tomatoes, weeds } of photos.values()) {
    if (!tomatoes.length) continue;
    result.photosWithTomatoes++;
    if (!weeds.length) continue;
    result.photosWithBoth++;
    if (largestArea(weeds) > largestArea(tomatoes)) {
      result.photosWhereLargestWeedExceedsEveryTomato++;
    }
    result.tomatoBoxesIntersectingWeeds += tomatoes.filter(
      (box) => weeds.some((weed) => intersects(box, weed)),
    ).length;
  }
  return result;
}

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more local annotations_TOMATO_*.json files");
for (const file of files) {
  const result = countPhotos(JSON.parse(await readFile(file, "utf8")));
  console.log(JSON.stringify({ file: basename(file), ...result }, null, 2));
}
