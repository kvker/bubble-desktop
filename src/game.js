// 泡泡龙键盘伴侣 —— 不是游戏，是陪你敲键盘的桌面挂件
// 全局按键驱动：左半键盘滚轮左转，右半键盘右转，空格吐泡泡
import { Application, Assets, Graphics, Container, Sprite, Text } from './vendor/pixi.mjs';
import {
  advanceBubble,
  classifyLocalKey,
  createBubble,
  pickColorIndex,
  selectDragonMotion,
  updateAim,
} from './game/domain.mjs';
import { createGameplayEvents } from './features/gameplay-events.mjs';
import { mountScoreDisplay } from './features/score-display.mjs';
import { mountScoreRecorder } from './features/score-recorder.mjs';
import { mountScoreStars } from './features/score-stars.mjs';
import { male as maleMaterial, female as femaleMaterial } from '../skins/index.mjs';

// ---------- 常量 ----------
// 逻辑视口固定 360×420：挂件的整体缩放由窗口尺寸与 #game 的 CSS transform 实现，布局不随窗口物理尺寸变化
const W = 360;
const H = 420;
const R = 16;                    // 泡泡半径
const LAUNCH_X = W / 2;
const LAUNCH_Y = H - 90;
const POP_TOP = R * 2;           // 破裂波纹所需净空（最大膨胀 1.8R）
// 球弹射区：左右与两侧龙的后方对齐，顶部保留破裂动画净空
const AREA_HALF_W = 92 + 28;
const AREA_LEFT = LAUNCH_X - AREA_HALF_W;
const AREA_RIGHT = LAUNCH_X + AREA_HALF_W;
const AREA_TOP = POP_TOP;
const MAX_ANGLE = 1.35;          // 滚轮最大偏转角（弧度）
const ROT_SPEED = 2.8;           // 滚轮旋转速度（弧度/秒）
const BUBBLE_SPEED = 520;        // 泡泡飞行速度（px/秒）
const POP_TIME = 0.18;           // 回收时的破裂动画时长（秒）
const POP_TIME_FIRE = 0.25;      // 发射兴奋动画时长（秒）
const KEY_FADE = 0.1;            // 按键提示渐隐时长（秒）
const COLORS = [0xff5a5f, 0xffb400, 0x3ddc84, 0x4aa8ff, 0xc678dd];
const LAUNCH_RULES = Object.freeze({
  launchX: LAUNCH_X,
  launchY: LAUNCH_Y,
  speed: BUBBLE_SPEED,
});
const BUBBLE_RULES = Object.freeze({
  areaLeft: AREA_LEFT,
  areaRight: AREA_RIGHT,
  areaTop: AREA_TOP,
  radius: R,
  popTime: POP_TIME,
});
const AIM_RULES = Object.freeze({ maxAngle: MAX_ANGLE, rotationSpeed: ROT_SPEED });

// ---------- 状态 ----------
let angle = 0;                   // 滚轮角度，0 为垂直向上
let current = 0;                 // 已上膛的泡泡颜色
let next = 1;                    // 下一颗颜色
const bubbles = [];              // 飞行中的泡泡 {x, y, vx, vy, color, pop}
const held = { left: new Set(), right: new Set() };
let spaceHeld = false;
let globalActive = false;        // 全局监听生效时，禁用窗口内兜底键盘
let firePulse = 0;               // 发射时小精灵的兴奋动画计时
let angleReturning = false;      // 发射后指针平滑回中
let elapsed = 0;

const pickColor = () => pickColorIndex(Math.random, COLORS.length);

// ---------- 渲染 ----------
const app = new Application();
await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: true });
document.getElementById('game').appendChild(app.canvas);

// 整体缩放：窗口内容区 = 逻辑视口 × 缩放档位；#game 固定逻辑尺寸并通过 transform 等比缩放适配
let activeScale = 1;           // 当前整体缩放档位：hover 命中阈值按比例换算为逻辑坐标
function applyWindowScale(scaleValue) {
  const el = document.getElementById('game');
  if (!el || typeof scaleValue !== 'number' || !Number.isFinite(scaleValue)) return;
  activeScale = scaleValue;
  el.style.transform = `scale(${scaleValue})`;
  el.style.transformOrigin = '0 0';
}
window.desktop.onWindowScaleChanged(applyWindowScale);
window.desktop.getWindowScale().then(applyWindowScale);

const g = new Graphics();        // 全部元素每帧重绘，天然无对象泄漏
const featureLayer = new Container(); // 自治玩法功能层
const dragonLayer = new Container(); // 两只文字角色（男/女，文字整体形变动画）
const keyLayer = new Container();    // 按键提示文字层（最上层）
app.stage.addChild(g, featureLayer, dragonLayer, keyLayer);

// ---------- 音效（assets/ 下；每次播放克隆独立实例，快速连按不会互相打断） ----------
const sfxScroll = new Audio('./assets/rotate.mp3');  // 左右按键：滚轮转动
sfxScroll.volume = 0.3;
const sfxFire = new Audio('./assets/send.mp3');      // 空格：发射
let soundEnabled = true;         // 音效开关，状态栏托盘菜单切换，默认开启
window.desktop.onSoundChanged((on) => { soundEnabled = on; });
// 转动 / 发射音效音量独立调节（菜单档位，默认 30% / 100%）
window.desktop.onSoundVolumeChanged(({ scroll, fire }) => {
  sfxScroll.volume = scroll;
  sfxFire.volume = fire;
});
function playSfx(audio) {
  if (!soundEnabled) return;
  const a = audio.cloneNode();
  a.volume = audio.volume;
  a.play().catch(() => {});  // 未授权自动播放等场景静默忽略
}

// 按键提示：发射球中心白色黑边带阴影文字，0.1 秒渐隐
const keyBursts = [];            // { label, view: Text, ttl }
function showKeyBurst(label) {
  const hit = keyBursts.find((k) => k.label === label);
  if (hit) { hit.ttl = KEY_FADE; return; }  // 长按重复触发时只重置渐隐
  const view = new Text({
    text: label,
    style: {
      fill: 0xffffff,
      fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      fontSize: 18,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 3, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.5, blur: 2, distance: 2, angle: Math.PI / 2 },
    },
  });
  view.anchor.set(0.5);
  view.x = LAUNCH_X;
  view.y = LAUNCH_Y;
  keyLayer.addChild(view);
  keyBursts.push({ label, view, ttl: KEY_FADE });
}

function updateKeyBursts(dt) {
  for (let i = keyBursts.length - 1; i >= 0; i--) {
    const k = keyBursts[i];
    k.ttl -= dt;
    if (k.ttl <= 0) {
      k.view.destroy();
      keyBursts.splice(i, 1);
    } else {
      k.view.alpha = k.ttl / KEY_FADE;
    }
  }
}

// 文字角色：由 skins/<id>/character.json 物料驱动（艺术字样式 + 动画编排），无贴图
// 物料经验证工具保证完整；新增角色只需在 skins/ 放物料并在 skins/index.mjs 导入、此处注册容器
function materialStyle(material) {
  const { style } = material;
  return {
    fill: style.fill,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    stroke: { color: style.stroke.color, width: style.stroke.width, join: 'round' },
    dropShadow: {
      color: 0x000000,
      alpha: style.dropShadow.alpha,
      blur: style.dropShadow.blur,
      distance: style.dropShadow.distance,
      angle: Math.PI / 2,
    },
  };
}

function createTextCharacter(material) {
  const t = new Text({ text: material.states.idle.text, style: materialStyle(material) });
  t.anchor.set(0.5, 0.5);
  t.material = material;
  return t;
}

// image 物料：预加载每状态单帧图，按状态切换 texture。动画编排与 text 共用。
async function createImageCharacter(material) {
  const textures = {};
  for (const [stateKey, state] of Object.entries(material.states)) {
    textures[stateKey] = await Assets.load(`./skins/${material.id}/${state.image.replace('./', '')}`);
  }
  const sprite = new Sprite(textures.idle);
  sprite.anchor.set(0.5, 0.5);
  sprite.material = material;
  sprite.textures = textures;
  return sprite;
}

async function createCharacter(material) {
  if (material.type === 'image') return createImageCharacter(material);
  return createTextCharacter(material);
}

const dragonLeft = await createCharacter(maleMaterial);
const dragonRight = await createCharacter(femaleMaterial);
dragonLeft.x = LAUNCH_X - 92;
dragonLeft.y = LAUNCH_Y + 18;
dragonRight.x = LAUNCH_X + 92;
dragonRight.y = LAUNCH_Y + 18;
dragonLayer.addChild(dragonLeft, dragonRight);

// ---------- 自治玩法注册 ----------
const gameplayEvents = createGameplayEvents();
const gameplayFeatures = [
  mountScoreRecorder({
    events: gameplayEvents,
    reportScore: (value) => window.desktop.reportScoreCollected(value),
  }),
  mountScoreStars({
    layer: featureLayer,
    ticker: app.ticker,
    events: gameplayEvents,
    getBubbles: () => bubbles.map(({ x, y, pop }) => ({ x, y, pop })),
    area: {
      left: AREA_LEFT + 12,
      right: AREA_RIGHT - 12,
      top: AREA_TOP + 12,
      bottom: LAUNCH_Y - 70,
    },
    bubbleRadius: R,
  }),
];

const isDevelopment = new URLSearchParams(window.location.search).get('development') === '1';
if (isDevelopment) {
  gameplayFeatures.push(mountScoreDisplay({
    layer: featureLayer,
    events: gameplayEvents,
    x: LAUNCH_X,
  }));
}

window.addEventListener('beforeunload', () => {
  for (const feature of gameplayFeatures.reverse()) feature.destroy();

});
// ---------- 发射与回收 ----------
function fire() {
  bubbles.push(createBubble(angle, current, LAUNCH_RULES));
  current = next;
  next = pickColor();
  firePulse = POP_TIME_FIRE;
  angleReturning = true;         // 发射完指针回到中间角度
  playSfx(sfxFire);
}

function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const nextBubble = advanceBubble(bubbles[i], dt, BUBBLE_RULES);
    if (nextBubble) bubbles[i] = nextBubble;
    else bubbles.splice(i, 1);
  }
}

// ---------- 每帧绘制 ----------
function drawBubble(x, y, colorIdx, alpha = 1, scale = 1) {
  g.circle(x, y, R * scale).fill({ color: COLORS[colorIdx], alpha });
  g.circle(x - R * 0.32 * scale, y - R * 0.36 * scale, R * 0.28 * scale)
    .fill({ color: 0xffffff, alpha: 0.45 * alpha });
}

function redraw() {
  g.clear();

  // 滚轮底座外圈：黑色半透明边框 + 阴影（浅色桌面下保持可见）
  for (let i = 4; i >= 1; i--) {
    g.circle(LAUNCH_X, LAUNCH_Y + 3, 33 + i).fill({ color: 0x000000, alpha: 0.06 });
  }
  g.circle(LAUNCH_X, LAUNCH_Y, 33).stroke({ color: 0x000000, alpha: 0.4, width: 2.5 });

  // 滚轮底座
  g.circle(LAUNCH_X, LAUNCH_Y, 30).fill({ color: 0xffffff, alpha: 0.1 });
  g.circle(LAUNCH_X, LAUNCH_Y, 30).stroke({ color: 0xffffff, alpha: 0.25, width: 1.5 });

  // 滚轮喷嘴/指针（随角度旋转）：黑色半透明边框 + 阴影衬底，再叠白色芯
  const nx = Math.sin(angle);
  const ny = -Math.cos(angle);
  g.moveTo(LAUNCH_X, LAUNCH_Y + 3)
    .lineTo(LAUNCH_X + nx * 42, LAUNCH_Y + 3 + ny * 42)
    .stroke({ color: 0x000000, alpha: 0.15, width: 14, cap: 'round' });
  g.moveTo(LAUNCH_X, LAUNCH_Y)
    .lineTo(LAUNCH_X + nx * 42, LAUNCH_Y + ny * 42)
    .stroke({ color: 0x000000, alpha: 0.4, width: 10, cap: 'round' });
  g.moveTo(LAUNCH_X, LAUNCH_Y)
    .lineTo(LAUNCH_X + nx * 42, LAUNCH_Y + ny * 42)
    .stroke({ color: 0xffffff, alpha: 0.7, width: 6, cap: 'round' });

  // 瞄准虚线
  for (let i = 3; i <= 8; i++) {
    g.circle(LAUNCH_X + nx * i * 22, LAUNCH_Y + ny * i * 22, 2.5)
      .fill({ color: 0xffffff, alpha: 0.35 });
  }

  // 已上膛的泡泡
  drawBubble(LAUNCH_X, LAUNCH_Y, current);
  // 下一颗预告（右侧小泡泡）
  drawBubble(LAUNCH_X + 58, LAUNCH_Y + 22, next, 0.9, 0.55);

  // 飞行中的泡泡
  for (const b of bubbles) {
    if (b.pop >= 0) {
      const t = b.pop / POP_TIME;
      g.circle(b.x, b.y, R * (1 + t * 0.8)).stroke({ color: COLORS[b.color], alpha: 1 - t, width: 2.5 });
    } else {
      drawBubble(b.x, b.y, b.color);
    }
  }
}

function animateDragons(dt) {
  // 左半键盘只驱动左角色走踏，右半键盘只驱动右角色走踏；空格发射时两只一起吹泡泡
  // 状态选择、文字切换与整体形变全部由物料 JSON 动画编排驱动（fire > walk > idle）
  for (const [d, active] of [[dragonLeft, held.left.size > 0], [dragonRight, held.right.size > 0]]) {
    const { stateKey, text, pose, walkTime } = selectDragonMotion(
      {
        firePulse,
        active,
        walkTime: d.walkTime,
        idleTime: elapsed,
        dt,
        fireDuration: POP_TIME_FIRE,
      },
      d.material,
    );
    d.walkTime = walkTime;
    if (d.material.type === 'image') {
      d.texture = d.textures[stateKey] ?? d.texture;
    } else {
      d.text = text;
    }
    d.scale.set(pose.scaleX, pose.scaleY);
    d.skew.set(pose.skewX, 0);
    d.y = LAUNCH_Y + 18 + pose.y;
  }
}



// ---------- 主循环 ----------
app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 0.05);
  elapsed += dt;
  if (firePulse > 0) firePulse = Math.max(0, firePulse - dt);

  const dir = (held.right.size > 0 ? 1 : 0) - (held.left.size > 0 ? 1 : 0);
  const aim = updateAim(angle, angleReturning, dir, dt, AIM_RULES);
  angle = aim.angle;
  angleReturning = aim.returning;

  updateBubbles(dt);
  updateKeyBursts(dt);
  animateDragons(dt);
  redraw();
});

// ---------- 输入：全局监听为主，窗口聚焦键盘为兜底 ----------
function handleKey(type, down, source, label) {
  if (source === 'local' && globalActive) return; // 避免与全局事件重复
  if (type === 'fire') {
    if (down && !spaceHeld) { spaceHeld = true; fire(); }
    if (!down) spaceHeld = false;
    return;
  }
  if (down && label) {
    showKeyBurst(label);   // 每次按下都亮一下
    playSfx(sfxScroll);    // 每次按下都播音效
  }
  const set = held[type];
  if (down) set.add(source);
  else set.delete(source);
}

window.desktop.onGlobalKey(({ type, down, label }) => handleKey(type, down, 'global', label));

window.addEventListener('keydown', (event) => {
  const key = classifyLocalKey(event.code);
  if (!key) return;
  if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  if (key.type === 'fire' && event.repeat) return;
  handleKey(key.type, true, 'local', key.label);
});
window.addEventListener('keyup', (event) => {
  const key = classifyLocalKey(event.code);
  if (key) handleKey(key.type, false, 'local');
});
window.addEventListener('blur', () => {
  held.left.clear();
  held.right.clear();
  spaceHeld = false;
});

// ---------- 权限状态（无界面提示，授权入口在状态栏托盘菜单） ----------
window.desktop.onHookStatus(({ running }) => {
  globalActive = running;
});

// ---------- 鼠标穿透：只在底部可操作区域（小龙与滚轮附近）拦截鼠标 ----------
// 窗口默认穿透（透明区域不遮挡桌面），指针进入交互区才接管，带滞回避免边界抖动
const INTERACT_ENTER_Y = H - 150;
const INTERACT_EXIT_Y = H - 170;
let hovering = false;
let touchEnabled = true;         // 触点开关：关闭后左键透传不挡交互，仅保留右键（全局钩子兜底）
window.desktop.onTouchOffChanged((off) => {
  touchEnabled = !off;
  if (!touchEnabled && hovering) {
    hovering = false;
    window.desktop.setIgnoreMouse(true);
  }
});
function updateHover(y) {
  if (!touchEnabled) return;
  const next = hovering ? y >= INTERACT_EXIT_Y : y >= INTERACT_ENTER_Y;
  if (next !== hovering) {
    hovering = next;
    window.desktop.setIgnoreMouse(!hovering);
  }
}
window.addEventListener('mousemove', (e) => updateHover(e.clientY));
window.addEventListener('mouseleave', () => {
  if (hovering) {
    hovering = false;
    window.desktop.setIgnoreMouse(true);
  }
});

// ---------- 左键拖动 ----------
let dragging = false;
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  window.desktop.dragStart({ screenX: e.screenX, screenY: e.screenY });
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  window.desktop.dragMove({ screenX: e.screenX, screenY: e.screenY });
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  window.desktop.dragEnd();
});

current = pickColor();
next = pickColor();
