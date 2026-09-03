// 打星星得分统计存储与上报 IPC 测试
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createScoreStatsStore, registerScoreIpc } = require('../main/score-stats');
const { toLocalDateKey, daysAgo, RETENTION_DAYS } = require('../main/key-stats');

function memoryStore(initial) {
  let content = initial;
  return {
    getFilePath: () => '/virtual/score-stats.json',
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

test('得分按日累计并生成最近 7 天报告', () => {
  const fs = memoryStore(undefined);
  const store = createScoreStatsStore(fs);
  store.record(1, NOW);
  store.record(1, NOW);
  store.record(1, NOW);

  const report = store.getReport(NOW);
  assert.equal(report.today, toLocalDateKey(NOW));
  assert.equal(report.days.length, RETENTION_DAYS);
  const today = report.days.find((day) => day.date === report.today);
  assert.equal(today.score, 3);
  assert.equal(report.total, 3);
});

test('跨天记录分别累计，合计为全期之和', () => {
  const fs = memoryStore(undefined);
  const store = createScoreStatsStore(fs);
  store.record(2, NOW);
  store.record(1, daysAgo(NOW, 1));
  store.record(3, daysAgo(NOW, 4));

  const report = store.getReport(NOW);
  assert.equal(report.days.find((day) => day.date === report.today).score, 2);
  assert.equal(report.days.find((day) => day.date === toLocalDateKey(daysAgo(NOW, 1))).score, 1);
  assert.equal(report.days.find((day) => day.date === toLocalDateKey(daysAgo(NOW, 4))).score, 3);
  assert.equal(report.total, 6);
});

test('只保留最近 7 天，更早数据在记录时被清理', () => {
  const oldKey = toLocalDateKey(daysAgo(NOW, 8));
  const threeDaysAgo = toLocalDateKey(daysAgo(NOW, 3));
  const fs = memoryStore(JSON.stringify({
    days: { [oldKey]: 9, [threeDaysAgo]: 2 },
  }));
  const store = createScoreStatsStore(fs);
  store.record(1, NOW);

  const saved = JSON.parse(fs.dump());
  assert.equal(saved.days[oldKey], undefined);
  assert.equal(saved.days[threeDaysAgo], 2);
  assert.equal(saved.days[toLocalDateKey(NOW)], 1);
});

test('未来日期键不被清理，但不出现在当期报告', () => {
  const futureKey = toLocalDateKey(daysAgo(NOW, -2));
  const fs = memoryStore(JSON.stringify({ days: { [futureKey]: 5 } }));
  const store = createScoreStatsStore(fs);
  store.record(1, NOW);

  const saved = JSON.parse(fs.dump());
  assert.equal(saved.days[futureKey], 5);
  assert.equal(store.getReport(NOW).total, 1);
});

test('数据文件缺失或损坏时回退为空数据', () => {
  const missing = createScoreStatsStore(memoryStore(undefined));
  missing.record(1, NOW);
  const missingReport = missing.getReport(NOW);
  const today = missingReport.days.find((day) => day.date === missingReport.today);
  assert.equal(today.score, 1);

  const corrupt = createScoreStatsStore(memoryStore('不是 JSON'));
  assert.equal(corrupt.getReport(NOW).total, 0);
});

test('写盘失败不抛出异常，内存态仍可继续累计', () => {
  const store = createScoreStatsStore({
    getFilePath: () => '/virtual/score-stats.json',
    readFile: () => { throw new Error('不存在'); },
    writeFile: () => { throw new Error('磁盘故障'); },
  });
  assert.equal(store.record(1, NOW), undefined);
  assert.equal(store.record(1, NOW), undefined);
  assert.equal(store.getReport(NOW).total, 2);
});

test('非法得分值不写入统计', () => {
  const fs = memoryStore(undefined);
  const store = createScoreStatsStore(fs);
  store.record(NaN, NOW);
  store.record(0, NOW);
  store.record(-1, NOW);
  store.record('1', NOW);
  assert.equal(store.getReport(NOW).total, 0);
});

test('score:collected IPC 只接受主游戏窗口发送者并可完整注销', () => {
  const ipcMain = new EventEmitter();
  const store = createScoreStatsStore(memoryStore(undefined));
  const webContents = {};
  const win = { webContents, isDestroyed: () => false };
  const registration = registerScoreIpc({ ipcMain, getWindow: () => win, store });

  ipcMain.emit('score:collected', { sender: {} }, 1);
  ipcMain.emit('score:collected', { sender: { webContents: {} } }, 1);
  ipcMain.emit('score:collected', { sender: webContents }, 1);
  ipcMain.emit('score:collected', { sender: webContents }, 1);
  ipcMain.emit('score:collected', { sender: webContents }, 0);
  ipcMain.emit('score:collected', { sender: webContents }, '1');
  assert.equal(store.getReport().total, 2);

  registration.dispose();
  ipcMain.emit('score:collected', { sender: webContents }, 1);
  assert.equal(store.getReport().total, 2);
  assert.equal(ipcMain.listenerCount('score:collected'), 0);
});
