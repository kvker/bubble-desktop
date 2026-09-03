// 渲染领域规则测试
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceBubble,
  classifyLocalKey,
  createBubble,
  evaluateStateAnimation,
  pickColorIndex,
  selectDragonMotion,
  updateAim,
  waveValue,
} from '../src/game/domain.mjs';

const bubbleRules = {
  areaLeft: 60,
  areaRight: 300,
  areaTop: 200,
  radius: 16,
  popTime: 0.18,
};

test('颜色选择与发射泡泡由显式输入决定', () => {
  assert.equal(pickColorIndex(() => 0.99, 5), 4);
  assert.deepEqual(
    createBubble(0, 3, { launchX: 180, launchY: 530, speed: 520 }),
    { x: 180, y: 496, vx: 0, vy: -520, color: 3, pop: -1 },
  );
});

test('泡泡在侧边反弹、到顶破裂并按时回收', () => {
  const bounced = advanceBubble(
    { x: 70, y: 400, vx: -100, vy: 0, color: 1, pop: -1 },
    0.1,
    bubbleRules,
  );
  assert.deepEqual(bounced, { x: 76, y: 400, vx: 100, vy: 0, color: 1, pop: -1 });

  const popped = advanceBubble(
    { x: 180, y: 205, vx: 0, vy: -100, color: 2, pop: -1 },
    0.1,
    bubbleRules,
  );
  assert.deepEqual(popped, { x: 180, y: 200, vx: 0, vy: -100, color: 2, pop: 0 });
  assert.equal(advanceBubble({ ...popped, pop: 0.18 }, 0.001, bubbleRules), null);
});

test('瞄准角限制边界，发射后指数回中，手动输入优先', () => {
  assert.deepEqual(
    updateAim(1.3, false, 1, 1, { maxAngle: 1.35, rotationSpeed: 2.8 }),
    { angle: 1.35, returning: false },
  );
  assert.deepEqual(
    updateAim(0.001, true, 0, 0.016, { maxAngle: 1.35, rotationSpeed: 2.8 }),
    { angle: 0, returning: false },
  );
  const manual = updateAim(0.5, true, -1, 0.1, { maxAngle: 1.35, rotationSpeed: 2.8 });
  assert.equal(manual.returning, false);
  assert.ok(Math.abs(manual.angle - 0.22) < Number.EPSILON);
});

const CHARACTER_MATERIAL = {
  schemaVersion: 1,
  id: 'test',
  style: { fontSize: 44, fill: '#ffffff', fontFamily: 'sans-serif', fontWeight: 'bold',
    stroke: { width: 6, color: '#000000' }, dropShadow: { distance: 3, alpha: 0.4, blur: 3 } },
  states: {
    fire: {
      text: '吹',
      animation: [
        { prop: 'scaleX', type: 'pulse', amp: 0.16, duration: 0.25 },
        { prop: 'scaleY', type: 'pulse', amp: 0.16, duration: 0.25, invert: true },
      ],
    },
    walk: {
      text: '走',
      animation: [
        { prop: 'scaleX', type: 'sine', amp: 0.1, freq: 9 },
        { prop: 'scaleY', type: 'sine', amp: 0.1, freq: 9, phase: 180 },
      ],
    },
    idle: {
      text: '静',
      animation: [
        { prop: 'scaleY', type: 'sine', amp: 0.02, freq: 2.2 },
      ],
    },
  },
};

test('波形求值：sine 按频率相位输出、pulse 按时长输出单峰且可反向', () => {
  assert.equal(waveValue({ type: 'sine', amp: 1, freq: 1 }, 0), 0);
  assert.ok(Math.abs(waveValue({ type: 'sine', amp: 1, freq: 1 }, 0.25) - 1) < 1e-6);
  assert.equal(waveValue({ type: 'sine', amp: 1, freq: 2, phase: 90 }, 0), 1);
  assert.equal(waveValue({ type: 'pulse', amp: 1, duration: 0.2 }, 0), 0);
  assert.ok(Math.abs(waveValue({ type: 'pulse', amp: 1, duration: 0.2 }, 0.1) - 1) < 1e-6);
  assert.equal(waveValue({ type: 'pulse', amp: 1, duration: 0.2, invert: true }, 0.1), -1);
});

test('状态动画按时间把同一 prop 的多条求值求和', () => {
  const out = evaluateStateAnimation([
    { prop: 'scaleX', type: 'sine', amp: 0.1, freq: 1 },
    { prop: 'scaleX', type: 'sine', amp: 0.05, freq: 2 },
  ], 0);
  assert.deepEqual(out, { scaleX: 0, scaleY: 0, skewX: 0, y: 0 });
});

test('文字角色形变按发射、走踏、待机优先级输出状态文字与形变基准', () => {
  const NOW = { name: 'now' };
  const base = { firePulse: 0, active: false, walkTime: 0, idleTime: 0, dt: 0.016, fireDuration: 0.25 };

  const fire = selectDragonMotion({ ...base, firePulse: 0.2, active: true, walkTime: 1 }, CHARACTER_MATERIAL);
  assert.equal(fire.stateKey, 'fire');
  assert.equal(fire.text, '吹');
  assert.equal(fire.walkTime, 1);
  assert.ok(fire.pose.scaleX > 1);
  assert.ok(fire.pose.scaleY < 1);

  const walk = selectDragonMotion({ ...base, active: true, walkTime: 0, dt: 0.2 }, CHARACTER_MATERIAL);
  assert.equal(walk.stateKey, 'walk');
  assert.equal(walk.text, '走');
  assert.equal(walk.walkTime, 0.2);
  assert.notEqual(walk.pose.scaleX, walk.pose.scaleY);

  const idle = selectDragonMotion({ ...base, walkTime: 2, idleTime: 0 }, CHARACTER_MATERIAL);
  assert.equal(idle.stateKey, 'idle');
  assert.equal(idle.text, '静');
  assert.equal(idle.walkTime, 0);
  assert.equal(idle.pose.scaleX, 1);
});

test('本地键位分类与全局键位领域事件一致', () => {
  assert.deepEqual(classifyLocalKey('KeyQ'), { type: 'left', label: 'Q' });
  assert.deepEqual(classifyLocalKey('Digit6'), { type: 'right', label: '6' });
  assert.deepEqual(classifyLocalKey('ArrowRight'), { type: 'right', label: '→' });
  assert.deepEqual(classifyLocalKey('Space'), { type: 'fire' });
  assert.equal(classifyLocalKey('Escape'), null);
});
