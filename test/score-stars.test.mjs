// 得分星星与独立计分策略测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameplayEvents, GAMEPLAY_EVENTS } from '../src/features/gameplay-events.mjs';
import { mountScoreRecorder } from '../src/features/score-recorder.mjs';
import {
  SCORE_STAR_SIZE,
  bubbleHitsStar,
  createFivePointStar,
  randomPoint,
} from '../src/features/score-star-domain.mjs';
import { mountScoreStars } from '../src/features/score-stars.mjs';

test('五角星几何边界严格为 24×24', () => {
  const points = createFivePointStar();
  const xs = points.filter((_value, index) => index % 2 === 0);
  const ys = points.filter((_value, index) => index % 2 === 1);

  assert.equal(Math.max(...xs) - Math.min(...xs), SCORE_STAR_SIZE);
  assert.equal(Math.max(...ys) - Math.min(...ys), SCORE_STAR_SIZE);
});

test('星星在固定区域内按注入随机数生成', () => {
  const values = [0, 1];
  const point = randomPoint(() => values.shift(), {
    left: 72,
    right: 288,
    top: 244,
    bottom: 460,
  });
  assert.deepEqual(point, { x: 72, y: 460 });
});

test('星星只与飞行中的泡泡发生圆形碰撞', () => {
  const star = { x: 100, y: 100 };
  assert.equal(bubbleHitsStar(star, [{ x: 128, y: 100, pop: -1 }], 16), true);
  assert.equal(bubbleHitsStar(star, [{ x: 128.1, y: 100, pop: -1 }], 16), false);
  assert.equal(bubbleHitsStar(star, [{ x: 100, y: 100, pop: 0 }], 16), false);
});

test('后台计分记录器独立累计并发布分数变化', () => {
  const events = createGameplayEvents();
  const changes = [];
  events.on(GAMEPLAY_EVENTS.scoreChanged, (event) => changes.push(event));
  const recorder = mountScoreRecorder({ events });

  events.emit(GAMEPLAY_EVENTS.starCollected, { value: 1 });
  events.emit(GAMEPLAY_EVENTS.starCollected, { value: 1 });
  assert.equal(recorder.getScore(), 2);
  assert.deepEqual(changes, [
    { score: 1, delta: 1 },
    { score: 2, delta: 1 },
  ]);

  recorder.destroy();
  events.emit(GAMEPLAY_EVENTS.starCollected, { value: 1 });
  assert.equal(recorder.getScore(), 2);
});

test('上报持久化失败不影响进程内计分与得分变化事件流', () => {
  const events = createGameplayEvents();
  const changes = [];
  events.on(GAMEPLAY_EVENTS.scoreChanged, (event) => changes.push(event));
  let reported = 0;
  const recorder = mountScoreRecorder({
    events,
    reportScore: () => { reported += 1; throw new Error('上报失败'); },
  });

  events.emit(GAMEPLAY_EVENTS.starCollected, { value: 1 });
  events.emit(GAMEPLAY_EVENTS.starCollected, { value: 1 });
  assert.equal(recorder.getScore(), 2);
  assert.deepEqual(changes, [
    { score: 1, delta: 1 },
    { score: 2, delta: 1 },
  ]);
  assert.equal(reported, 2);
});

test('星星自行发布碰撞事实并销毁视图', () => {
  const events = createGameplayEvents();
  const collected = [];
  events.on(GAMEPLAY_EVENTS.starCollected, (event) => collected.push(event));

  const views = [];
  const layer = {
    addChild: (view) => views.push(view),
    removeChild: (view) => views.splice(views.indexOf(view), 1),
  };
  const ticker = {
    callback: null,
    add(callback) { this.callback = callback; },
    remove(callback) { if (this.callback === callback) this.callback = null; },
  };
  const view = {
    rotation: 0,
    destroyed: false,
    position: { set(x, y) { view.x = x; view.y = y; } },
    destroy() { this.destroyed = true; },
  };
  const feature = mountScoreStars({
    layer,
    ticker,
    events,
    getBubbles: () => [{ x: 100, y: 100, pop: -1 }],
    area: { left: 100, right: 100, top: 100, bottom: 100 },
    bubbleRadius: 16,
    random: () => 0.5,
    createView: () => view,
  });

  assert.equal(views.length, 1);
  ticker.callback({ deltaMS: 16 });
  assert.equal(views.length, 0);
  assert.equal(view.destroyed, true);
  assert.deepEqual(collected, [{
    starId: 'score-star-1',
    value: 1,
    position: { x: 100, y: 100 },
  }]);

  feature.destroy();
  assert.equal(ticker.callback, null);
});
