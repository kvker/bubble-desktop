// 按键统计：store 按本地日期累计最近 7 天并持久化；tracker 作为被动订阅者消费 key:down 事实
const fs = require('fs');

const RETENTION_DAYS = 7;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 统计只关注：26 个字母、数字 0-9、左右方向键
function isStatKey(label) {
  return /^[A-Z0-9]$/.test(label) || label === '←' || label === '→';
}

function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
}

// 只保留最近 RETENTION_DAYS 天（含当日），日期键为 YYYY-MM-DD 可直接字典序比较
function keepRecent(days, now) {
  const keepFrom = toLocalDateKey(daysAgo(now, RETENTION_DAYS - 1));
  for (const dateKey of Object.keys(days)) {
    if (dateKey < keepFrom) delete days[dateKey];
  }
  return days;
}

function createKeyStatsStore({
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

  function record(label, now = new Date()) {
    if (!label) return;
    if (!days) load();
    const dateKey = toLocalDateKey(now);
    days[dateKey] = days[dateKey] ?? {};
    days[dateKey][label] = (days[dateKey][label] ?? 0) + 1;
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

  // 报告：最近 7 天（含当日）逐日计数 + 全按键合计，日期从近到远排列
  function getReport(now = new Date()) {
    if (!days) load();
    const entries = [];
    const totals = {};
    for (let offset = 0; offset < RETENTION_DAYS; offset++) {
      const date = daysAgo(now, offset);
      const dateKey = toLocalDateKey(date);
      const counts = {};
      for (const [key, count] of Object.entries(days[dateKey] ?? {})) {
        if (!isStatKey(key)) continue;
        counts[key] = count;
        totals[key] = (totals[key] ?? 0) + count;
      }
      entries.push({ date: dateKey, weekday: WEEKDAYS[date.getDay()], counts });
    }
    return { days: entries, totals, today: toLocalDateKey(now) };
  }

  return { load, record, save, getReport };
}

// 被动订阅者：只接收 key:down 事实并累计，不感知事件来源；now 用于测试注入固定时钟
function createKeyStatsTracker({ store, events, now = () => new Date() }) {
  const handleKeyDown = ({ label }) => {
    if (!isStatKey(label)) return;
    store.record(label, now());
  };
  return {
    start() {
      events.on('key:down', handleKeyDown);
    },
    stop() {
      events.off('key:down', handleKeyDown);
    },
  };
}

module.exports = {
  createKeyStatsStore,
  createKeyStatsTracker,
  toLocalDateKey,
  daysAgo,
  keepRecent,
  RETENTION_DAYS,
  isStatKey,
};
