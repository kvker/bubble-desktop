// 领域规则：无 DOM、Electron 和 PixiJS 依赖的运动与输入计算
const LOCAL_LEFT = new Set([
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
]);
const LOCAL_RIGHT = new Set([
  'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyN', 'KeyM',
]);

export function pickColorIndex(random, colorCount) {
  return Math.floor(random() * colorCount);
}

export function createBubble(angle, color, { launchX, launchY, speed }) {
  return {
    x: launchX + Math.sin(angle) * 34,
    y: launchY - Math.cos(angle) * 34,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    color,
    pop: -1,
  };
}

export function advanceBubble(bubble, dt, { areaLeft, areaRight, areaTop, radius, popTime }) {
  if (bubble.pop >= 0) {
    const pop = bubble.pop + dt;
    return pop > popTime ? null : { ...bubble, pop };
  }

  let x = bubble.x + bubble.vx * dt;
  let y = bubble.y + bubble.vy * dt;
  let vx = bubble.vx;
  let pop = bubble.pop;

  if (x < areaLeft + radius && vx < 0) {
    x = areaLeft + radius;
    vx = -vx;
  } else if (x > areaRight - radius && vx > 0) {
    x = areaRight - radius;
    vx = -vx;
  }
  if (y <= areaTop) {
    y = areaTop;
    pop = 0;
  }

  return { ...bubble, x, y, vx, pop };
}

export function updateAim(angle, returning, direction, dt, { maxAngle, rotationSpeed }) {
  if (direction !== 0) {
    return {
      angle: Math.max(-maxAngle, Math.min(maxAngle, angle + direction * rotationSpeed * dt)),
      returning: false,
    };
  }
  if (!returning) return { angle, returning };

  const nextAngle = angle * Math.exp(-10 * dt);
  if (Math.abs(nextAngle) < 0.002) return { angle: 0, returning: false };
  return { angle: nextAngle, returning: true };
}

// ---------- 文字角色动画编排（JSON 物料驱动） ----------

// 波形求值：sine（正弦，需 freq，可带 phase 度数）与 pulse（单峰冲击，需 duration，invert 反向）
export function waveValue(item, t) {
  if (item.type === 'sine') {
    const phase = (item.phase ?? 0) * Math.PI / 180;
    return Math.sin(t * item.freq * Math.PI * 2 + phase) * item.amp;
  }
  if (item.type === 'pulse') {
    const p = Math.min(1, Math.max(0, t / item.duration));
    const v = Math.sin(p * Math.PI) * item.amp;
    return item.invert ? -v : v;
  }
  return 0;
}

// 按时间求一条状态动画的所有条目，对同一 prop 求和，输出原始偏移量
export function evaluateStateAnimation(animation, t) {
  const out = { scaleX: 0, scaleY: 0, skewX: 0, y: 0 };
  for (const item of animation) {
    out[item.prop] += waveValue(item, t);
  }
  return out;
}

// 角色动画状态机：按发射、走踏、待机优先级选定状态，返回状态文字与整体形变基准。
// material 为 skins/<id>/character.json 解析结果；渲染层只消费输出，不感知编排细节。
export function selectDragonMotion(
  { firePulse, active, walkTime, idleTime, dt, fireDuration },
  material,
) {
  let stateKey;
  let t;
  let nextWalkTime = walkTime;
  if (firePulse > 0) {
    stateKey = 'fire';
    t = Math.max(0, fireDuration - firePulse);
  } else if (active) {
    stateKey = 'walk';
    nextWalkTime = walkTime + dt;
    t = nextWalkTime;
  } else {
    stateKey = 'idle';
    t = idleTime;
    nextWalkTime = 0;
  }
  const state = material.states[stateKey];
  const raw = evaluateStateAnimation(state.animation, t);
  return {
    stateKey,
    text: state.text,
    pose: {
      scaleX: 1 + raw.scaleX,
      scaleY: 1 + raw.scaleY,
      skewX: raw.skewX,
      y: raw.y,
    },
    walkTime: nextWalkTime,
  };
}

export function classifyLocalKey(code) {
  if (code === 'Space') return { type: 'fire' };
  if (code === 'ArrowLeft') return { type: 'left', label: '←' };
  if (code === 'ArrowRight') return { type: 'right', label: '→' };
  if (LOCAL_LEFT.has(code)) return { type: 'left', label: code.slice(code.startsWith('Key') ? 3 : 5) };
  if (LOCAL_RIGHT.has(code)) return { type: 'right', label: code.slice(code.startsWith('Key') ? 3 : 5) };
  return null;
}
