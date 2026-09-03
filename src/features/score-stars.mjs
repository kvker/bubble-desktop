// 得分星星：自治管理随机生成、碰撞检测、事件发布与销毁
import { Graphics } from '../vendor/pixi.mjs';
import { GAMEPLAY_EVENTS } from './gameplay-events.mjs';
import {
  SCORE_STAR_SIZE,
  bubbleHitsStar,
  createFivePointStar,
  randomBetween,
  randomPoint,
} from './score-star-domain.mjs';

const STAR_COLOR = 0xffd84d;
const STAR_STROKE = 0xb96b00;
const STAR_VALUE = 1;
const RESPAWN_DELAY = Object.freeze({ min: 0.55, max: 1.25 });

function createScoreStarView() {
  return new Graphics({ roundPixels: true })
    .poly(createFivePointStar(SCORE_STAR_SIZE), true)
    .fill(STAR_COLOR)
    .stroke({ color: STAR_STROKE, width: 1.5, alignment: 1, join: 'round' });
}

export function mountScoreStars({
  layer,
  ticker,
  events,
  getBubbles,
  area,
  bubbleRadius,
  random = Math.random,
  createView = createScoreStarView,
}) {
  let activeStar = null;
  let nextStarId = 1;
  let respawnIn = 0;

  const spawn = () => {
    const position = randomPoint(random, area);
    const view = createView();
    view.position.set(position.x, position.y);
    layer.addChild(view);
    activeStar = {
      id: `score-star-${nextStarId++}`,
      x: position.x,
      y: position.y,
      view,
    };
  };

  const destroyActiveStar = () => {
    if (!activeStar) return;
    layer.removeChild(activeStar.view);
    activeStar.view.destroy();
    activeStar = null;
  };

  const collectActiveStar = () => {
    const collected = activeStar;
    events.emit(GAMEPLAY_EVENTS.starCollected, {
      starId: collected.id,
      value: STAR_VALUE,
      position: { x: collected.x, y: collected.y },
    });
    destroyActiveStar();
    respawnIn = randomBetween(random, RESPAWN_DELAY.min, RESPAWN_DELAY.max);
  };

  const update = (frame) => {
    const dt = Math.min(frame.deltaMS / 1000, 0.05);
    if (!activeStar) {
      respawnIn -= dt;
      if (respawnIn <= 0) spawn();
      return;
    }

    if (bubbleHitsStar(activeStar, getBubbles(), bubbleRadius)) collectActiveStar();
  };

  spawn();
  ticker.add(update);

  return {
    destroy() {
      ticker.remove(update);
      destroyActiveStar();
    },
  };
}
