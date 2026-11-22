// Assign at most one prediction to each surveyed center.
export const matchingSlack = 1e-12;
export function matchCenters(pins, truth, radius) {
 const radiusSquared = radius ** 2;
 const candidates = pins.map(([x, y]) => {
  const boxes = [];
  for (let box = 0; box < truth.length; box++) {
   const [tx, ty] = truth[box];
   if ((tx-x)**2 + (ty-y)**2 <= radiusSquared + matchingSlack) boxes.push(box);
  }
  return boxes;
 });
 const pinByBox = new Int32Array(truth.length).fill(-1);
 const visited = new Int32Array(truth.length).fill(-1);
 function assign(pin, visit) {
  for (const box of candidates[pin]) {
   if (visited[box] === visit) continue;
   visited[box] = visit;
   if (pinByBox[box] === -1 || assign(pinByBox[box], visit)) {
    pinByBox[box] = pin;
    return true;
   }
  }
  return false;
 }
 let count = 0;
 for (let pin = 0; pin < pins.length; pin++) {
  if (assign(pin, pin)) count++;
 }
 return {count, pinByBox};
}
