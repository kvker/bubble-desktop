// 按键统计存储与事件订阅测试
const test = require('node:test');
const assert = require('node:assert/strict');
const mitt = require('mitt');
const {
  createKeyStatsStore,
  createKeyStatsTracker,
  toLocalDateKey,
  daysAgo,
  RETENTION_DAYS,
  isStatKey,
} = require('../main/key-stats');

function memoryStore(initial) {
  let content = initial;
  return {
    getFilePath: () => '/virtual/key-stats.json',
    readFile: () => {
      if (content === undefined) throw new Error('文件不存在');
      return content;
    },
    writeFile: (_path, value) => { content = value; },
    dump: () => content,
  };
}

// store 的 load/getReport 用真实系统时钟做 7 天裁剪，测试基准必须相对当前时刻，硬编码绝对日期会随日期过期
const NOW = new Date();

test('按键按日累计并生成最近 7 天报告，非统计范围内按键不出现', () => {
  const fs = memoryStore(undefined);
  const store = createKeyStatsStore(fs);
  store.record('Q', NOW);
  store.record('Q', NOW);
  store.record('Space', NOW);

  const report = store.getReport(NOW);
  assert.equal(report.today, toLocalDateKey(NOW));
  assert.equal(report.days.length, RETENTION_DAYS);
  const today = report.days.find((day) => day.date === report.today);
  assert.deepEqual(today.counts, { Q: 2 });
  assert.deepEqual(report.totals, { Q: 2 });
});

test('只保留最近 7 天，更早数据在记录时被清理', () => {
  const oldKey = toLocalDateKey(daysAgo(NOW, 8));
  const threeDaysAgo = toLocalDateKey(daysAgo(NOW, 3));
  const fs = memoryStore(JSON.stringify({
    days: { [oldKey]: { Q: 9 }, [threeDaysAgo]: { W: 2 } },
  }));
  const store = createKeyStatsStore(fs);
  store.record('E', NOW);

  const saved = JSON.parse(fs.dump());
  assert.equal(saved.days[oldKey], undefined);
  assert.equal(saved.days[threeDaysAgo].W, 2);
  assert.equal(saved.days[toLocalDateKey(NOW)].E, 1);
});

test('数据文件缺失或损坏时回退为空数据', () => {
  const missing = createKeyStatsStore(memoryStore(undefined));
  missing.record('A', NOW);
  const report = missing.getReport(NOW);
  const today = report.days.find((day) => day.date === report.today);
  assert.deepEqual(today.counts, { A: 1 });

  const corrupt = createKeyStatsStore(memoryStore('不是 JSON'));
  const corruptReport = corrupt.getReport(NOW);
  assert.equal(corruptReport.days.length, RETENTION_DAYS);
  assert.deepEqual(corruptReport.totals, {});
});

test('tracker 作为被动订阅者累计 key:down 事实', () => {
  const fs = memoryStore(undefined);
  const store = createKeyStatsStore(fs);
  const events = mitt();
  const tracker = createKeyStatsTracker({ store, events, now: () => NOW });
  tracker.start();

  events.emit('key:down', { label: 'Tab' });
  events.emit('key:down', { label: 'Tab' });
  events.emit('key:down', { label: 'Q' });
  events.emit('key:down', { label: '←' });
  tracker.stop();
  events.emit('key:down', { label: 'Tab' });

  const report = store.getReport(NOW);
  const today = report.days.find((day) => day.date === report.today);
  assert.deepEqual(today.counts, { Q: 1, '←': 1 });
});

test('统计范围过滤：只关注 26 字母、0-9、左右方向键', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.equal(isStatKey(ch), true, `${ch} 应统计`);
  for (const d of '0123456789') assert.equal(isStatKey(d), true, `${d} 应统计`);
  assert.equal(isStatKey('←'), true);
  assert.equal(isStatKey('→'), true);
  for (const off of ['Space', 'Tab', 'Enter', 'ShiftLeft', 'CapsLock', 'Escape', 'ArrowUp', 'ArrowDown', '', undefined]) {
    assert.equal(isStatKey(off), false, `${off} 不应统计`);
  }
});

test('空 label 不写入统计', () => {
  const fs = memoryStore(undefined);
  const store = createKeyStatsStore(fs);
  store.record('', NOW);
  store.record(undefined, NOW);
  assert.deepEqual(store.getReport(NOW).totals, {});
});
