// 打星星得分统计：按本地日期累计最近 7 天并持久化，独立处理得分上报 IPC
const fs = require('fs');
const { toLocalDateKey, daysAgo, keepRecent, RETENTION_DAYS } = require('./key-stats');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function createScoreStatsStore({
  getFilePath,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
}) {
  let days = null;

  function load() {
    try {
      const data = JSON.parse(readFile(getFilePath(), 'utf8'));
      days = keepRecent(
        data && typeof data.days === 'object' && data.days !== null ? data.days : {},
        new Date(),
      );
    } catch {
      days = {};
    }
    return days;
  }

  function record(value, now = new Date()) {
    if (!Number.isFinite(value) || value <= 0) return;
    if (!days) load();
    const dateKey = toLocalDateKey(now);
    days[dateKey] = (days[dateKey] ?? 0) + Math.round(value);
    keepRecent(days, now);
    save();
  }

  function save() {
    if (!days) return false;
    try {
      writeFile(getFilePath(), JSON.stringify({ days }));
      return true;
    } catch {
      return false;
    }
  }

  // 报告：最近 7 天（含当日）逐日得分 + 全期合计，日期从近到远排列
  function getReport(now = new Date()) {
    if (!days) load();
    const entries = [];
    let total = 0;
    for (let offset = 0; offset < RETENTION_DAYS; offset++) {
      const date = daysAgo(now, offset);
      const dateKey = toLocalDateKey(date);
      const score = days[dateKey] ?? 0;
      total += score;
      entries.push({ date: dateKey, weekday: WEEKDAYS[date.getDay()], score });
    }
    return { days: entries, total, today: toLocalDateKey(now) };
  }

  return { load, record, save, getReport };
}

// 得分上报 IPC 注册：只接受主游戏窗口发送者，非法值由 store.record 拒绝
function registerScoreIpc({ ipcMain, getWindow, store }) {
  const handler = (event, value) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    store.record(value);
  };
  ipcMain.on('score:collected', handler);
  return {
    dispose() {
      ipcMain.off('score:collected', handler);
    },
  };
}

module.exports = { createScoreStatsStore, registerScoreIpc };
