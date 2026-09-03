// 主进程能力模块测试
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const mitt = require('mitt');
const {
  buildKeySets,
  classifyKey,
  createKeyboardHook,
  buildKeyNameByCode,
  resolveKeyLabel,
} = require('../main/keyboard-hook');
const {
  createDragController,
  isFinitePoint,
  registerDesktopIpc,
} = require('../main/desktop-ipc');
const { createSoundSettingsStore } = require('../main/sound-settings');
const {
  createWindowStateStore,
  isPositionVisible,
  keepBottomEdge,
} = require('../main/window-state');

function makeKeyCodes() {
  const names = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
    'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L',
    'Z', 'X', 'C', 'V', 'B', 'N', 'M',
    'ArrowLeft', 'ArrowRight', 'Space',
  ];
  return Object.fromEntries(names.map((name, index) => [name, index + 1]));
}

test('全局键位映射输出稳定的领域事件', () => {
  const keyCodes = makeKeyCodes();
  const keySets = buildKeySets(keyCodes);

  assert.deepEqual(classifyKey(keyCodes.Q, keySets), { type: 'left', label: 'Q' });
  assert.deepEqual(classifyKey(keyCodes.M, keySets), { type: 'right', label: 'M' });
  assert.deepEqual(classifyKey(keyCodes.ArrowLeft, keySets), { type: 'left', label: '←' });
  assert.deepEqual(classifyKey(keyCodes.Space, keySets), { type: 'fire' });
  assert.equal(classifyKey(9999, keySets), null);
});

test('键盘适配器管理监听器生命周期并发布按下抬起事实', () => {
  class FakeHook extends EventEmitter {
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const hook = new FakeHook();
  const bus = mitt();
  const events = [];
  bus.on('key:down', (payload) => events.push(['key:down', payload]));
  bus.on('key:up', (payload) => events.push(['key:up', payload]));
  const keyCodes = makeKeyCodes();
  const keyboard = createKeyboardHook({ hook, keyCodes, events: bus });

  assert.equal(keyboard.start(), true);
  hook.emit('keydown', { keycode: keyCodes.Q });
  hook.emit('keyup', { keycode: keyCodes.Q });
  assert.deepEqual(events, [
    ['key:down', { type: 'left', label: 'Q' }],
    ['key:up', { type: 'left' }],
  ]);

  keyboard.stop();
  assert.equal(hook.stopped, true);
  assert.equal(hook.listenerCount('keydown'), 0);
});

test('键盘适配器对所有按键发布完整按下抬起事实（含非玩法键）', () => {
  class FakeHook extends EventEmitter {
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const hook = new FakeHook();
  const bus = mitt();
  const downs = [];
  const ups = [];
  bus.on('key:down', (payload) => downs.push(payload));
  bus.on('key:up', (payload) => ups.push(payload));
  const keyCodes = makeKeyCodes();
  const keyNameByCode = buildKeyNameByCode(keyCodes);
  const keyboard = createKeyboardHook({ hook, keyCodes, events: bus });

  assert.equal(keyboard.start(), true);
  hook.emit('keydown', { keycode: keyCodes.Q });
  hook.emit('keydown', { keycode: keyCodes.Space });
  hook.emit('keydown', { keycode: 9999 });
  hook.emit('keyup', { keycode: 9999 });
  keyboard.stop();

  assert.deepEqual(downs, [
    { type: 'left', label: 'Q' },
    { type: 'fire', label: 'Space' },
    { type: null, label: '9999' },
  ]);
  assert.deepEqual(ups, [
    { type: null },
  ]);
  assert.equal(resolveKeyLabel(keyCodes.ArrowRight, { label: '→' }, null, keyNameByCode), '→');
});

test('窗口状态只恢复仍位于显示器内的位置', () => {
  const windowSize = { width: 360, height: 420 };
  const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }];
  assert.equal(isPositionVisible({ x: 100, y: 100 }, windowSize, displays), true);
  assert.equal(isPositionVisible({ x: 2000, y: 100 }, windowSize, displays), false);

  let written = null;
  const store = createWindowStateStore({
    getFilePath: () => '/virtual/window-state.json',
    getDisplays: () => displays,
    windowSize,
    readFile: () => JSON.stringify({ x: 100, y: 100 }),
    writeFile: (_path, value) => { written = value; },
  });
  assert.deepEqual(store.load(), { x: 100, y: 100 });
  assert.equal(store.save({ x: 20, y: 30 }), true);
  assert.equal(written, '{"x":20,"y":30}');
});

test('音效设置持久化，缺失或损坏时回退默认值', () => {
  let written = null;
  const store = createSoundSettingsStore({
    getFilePath: () => '/virtual/sound-settings.json',
    readFile: () => JSON.stringify({ soundOn: false, scroll: 0.5, fire: 0.1 }),
    writeFile: (_path, value) => { written = value; },
  });
  assert.deepEqual(store.load(), { soundOn: false, scroll: 0.5, fire: 0.1 });
  assert.equal(store.save({ soundOn: true, scroll: 0.3, fire: 1 }), true);
  assert.equal(written, '{"soundOn":true,"scroll":0.3,"fire":1}');

  const missing = createSoundSettingsStore({
    getFilePath: () => '/virtual/sound-settings.json',
    readFile: () => { throw new Error('不存在'); },
    writeFile: () => {},
  });
  assert.deepEqual(missing.load(), { soundOn: true, scroll: 0.3, fire: 1 });

  const invalid = createSoundSettingsStore({
    getFilePath: () => '/virtual/sound-settings.json',
    readFile: () => JSON.stringify({ soundOn: '是', scroll: 9, fire: -1 }),
    writeFile: () => {},
  });
  assert.deepEqual(invalid.load(), { soundOn: true, scroll: 0.3, fire: 1 });
});

test('窗口缩短时只迁移一次并保持屏幕底边位置', () => {
  assert.deepEqual(
    keepBottomEdge({ x: 100, y: 50 }, 420, 620),
    { x: 100, y: 250 },
  );
  assert.deepEqual(keepBottomEdge({ x: 100, y: 250, windowHeight: 420 }, 420, 620), { x: 100, y: 250 });
  assert.equal(keepBottomEdge(null, 420, 620), null);
});

test('窗口拖动拒绝无效坐标并按屏幕位移移动', () => {
  const positions = [];
  let saved = 0;
  const win = {
    isDestroyed: () => false,
    getPosition: () => [40, 50],
    setPosition: (x, y) => positions.push([x, y]),
  };
  const drag = createDragController({
    getWindow: () => win,
    saveWindowPosition: () => { saved += 1; },
  });

  assert.equal(isFinitePoint({ screenX: 1, screenY: 2 }), true);
  assert.equal(drag.start({ screenX: 100, screenY: 100 }), true);
  assert.equal(drag.move({ screenX: 112.4, screenY: 91.2 }), true);
  assert.deepEqual(positions, [[52, 41]]);
  assert.equal(drag.move({ screenX: Infinity, screenY: 0 }), false);
  assert.equal(drag.end(), true);
  assert.equal(saved, 1);
});

test('IPC 只接受当前窗口发送者并可完整注销', () => {
  const ipcMain = new EventEmitter();
  const ignored = [];
  const webContents = {};
  const win = {
    webContents,
    isDestroyed: () => false,
    setIgnoreMouseEvents: (...args) => ignored.push(args),
    getPosition: () => [0, 0],
    setPosition: () => {},
  };
  const registration = registerDesktopIpc({
    ipcMain,
    getWindow: () => win,
    saveWindowPosition: () => {},
  });

  ipcMain.emit('set-ignore-mouse', { sender: {} }, true);
  ipcMain.emit('set-ignore-mouse', { sender: webContents }, 'true');
  ipcMain.emit('set-ignore-mouse', { sender: webContents }, true);
  assert.deepEqual(ignored, [[true, { forward: true }]]);

  registration.dispose();
  assert.equal(ipcMain.listenerCount('set-ignore-mouse'), 0);
});


