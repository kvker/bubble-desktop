// 得分星星纯规则：位置、形状、碰撞和重生时间
export const SCORE_STAR_SIZE = 24;
export const SCORE_STAR_RADIUS = SCORE_STAR_SIZE / 2;

export function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

export function randomPoint(random, area) {
  return {
    x: randomBetween(random, area.left, area.right),
    y: randomBetween(random, area.top, area.bottom),
  };
}

export function createFivePointStar(size = SCORE_STAR_SIZE) {
  const rawPoints = [];
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? 1 : 0.46;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    rawPoints.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  const xs = rawPoints.map(({ x }) => x);
  const ys = rawPoints.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const normalize = (value, min, max) => (value - min) / (max - min) * size - size / 2;

  return rawPoints.flatMap(({ x, y }) => [
    normalize(x, minX, maxX),
    normalize(y, minY, maxY),
  ]);
}

export function bubbleHitsStar(star, bubbles, bubbleRadius) {
  const collisionRadiusSquared = (SCORE_STAR_RADIUS + bubbleRadius) ** 2;
  return bubbles.some((bubble) => {
    if (bubble.pop >= 0) return false;
    const dx = bubble.x - star.x;
    const dy = bubble.y - star.y;
    return dx * dx + dy * dy <= collisionRadiusSquared;
  });
}
