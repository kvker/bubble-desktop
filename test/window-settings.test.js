// 窗口缩放设置存储测试：档位持久化、非法回退与尺寸换算
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createWindowSettingsStore,
  normalizeSettings,
  windowSizeForScale,
  LOGICAL_SIZE,
  SCALE_LEVELS,
  DEFAULTS,
} = require('../main/window-settings');

test('默认档位与档位集合符合契约', () => {
  assert.deepEqual(SCALE_LEVELS, [0.5, 0.75, 1]);
  assert.equal(DEFAULTS.scale, 1);
  assert.deepEqual(normalizeSettings(undefined), { scale: 1 });
  assert.deepEqual(normalizeSettings({}), { scale: 1 });
  assert.deepEqual(normalizeSettings({ scale: 0.75 }), { scale: 0.75 });
  assert.deepEqual(normalizeSettings({ scale: 0.3 }), { scale: 1 });
  assert.deepEqual(normalizeSettings({ scale: 'yes' }), { scale: 1 });
});

test('缩放档位把逻辑视口等比换算为窗口内容区尺寸', () => {
  assert.deepEqual(windowSizeForScale(LOGICAL_SIZE, 0.5), { width: 180, height: 210 });
  assert.deepEqual(windowSizeForScale(LOGICAL_SIZE, 0.75), { width: 270, height: 315 });
  assert.deepEqual(windowSizeForScale(LOGICAL_SIZE, 1), { width: 360, height: 420 });
});

test('窗口缩放设置持久化，缺失或损坏时回退默认档位', () => {
  let written = null;
  const store = createWindowSettingsStore({
    getFilePath: () => '/virtual/window-settings.json',
    readFile: () => JSON.stringify({ scale: 0.75 }),
    writeFile: (_path, value) => { written = value; },
  });
  assert.deepEqual(store.load(), { scale: 0.75 });
  assert.equal(store.save({ scale: 0.5 }), true);
  assert.equal(written, '{"scale":0.5}');

  const normalized = createWindowSettingsStore({
    getFilePath: () => '/virtual/window-settings.json',
    writeFile: (_path, value) => { written = value; },
    readFile: () => { throw new Error('不存在'); },
  });
  assert.equal(normalized.save({ scale: 2 }), true);
  assert.equal(written, '{"scale":1}');

  const missing = createWindowSettingsStore({
    getFilePath: () => '/virtual/window-settings.json',
    readFile: () => { throw new Error('不存在'); },
    writeFile: () => {},
  });
  assert.deepEqual(missing.load(), { scale: 1 });

  const invalid = createWindowSettingsStore({
    getFilePath: () => '/virtual/window-settings.json',
    readFile: () => JSON.stringify({ scale: '小' }),
    writeFile: () => {},
  });
  assert.deepEqual(invalid.load(), { scale: 1 });
});
