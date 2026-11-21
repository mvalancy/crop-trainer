import {seededRandom} from '../plants/traits.js';

export function checkBoardPlacement(value) {
  const placement = value ?? 'plant';
  if (placement !== 'plant' && placement !== 'independent') {
    throw Error('Choose plant or independent board placement.');
  }
  return placement;
}

export function boardLayout({plantCenters, placement = 'plant', seed, obstacleRandom, plotSize}) {
  if (placement === 'plant' && !plantCenters.length) return [];
  const scatter = placement === 'independent' ? seededRandom(seed ^ 0x6205ad83) : null;
  const boards = [];
  for (let i = 0; i < 9; i++) {
    // Reserve the historical anchor draw in both arms so the shape draws stay paired.
    const anchorDraw = obstacleRandom();
    const [x, y] = scatter
      ? [scatter() * plotSize, scatter() * plotSize]
      : plantCenters[Math.floor(anchorDraw * plantCenters.length)];
    boards.push({
      x, y,
      angle: obstacleRandom() * (2 * Math.PI),
      halfLength: .28 + .30 * obstacleRandom(),
      halfWidth: .09 + .1 * obstacleRandom()
    });
  }
  return boards;
}
