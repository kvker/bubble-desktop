// 窗口设置存储：持久化整体缩放档位，损坏或缺失时回退默认档位
const fs = require('fs');

// 挂件整体缩放档位：逻辑视口 360×420 按档位等比缩放窗口内容区
const LOGICAL_SIZE = { width: 360, height: 420 };
const SCALE_LEVELS = [0.5, 0.75, 1];
const DEFAULTS = { scale: 1 };

function isValidScale(value) {
  return SCALE_LEVELS.some((level) => Math.abs(level - value) < 1e-6);
}

function normalizeSettings(data) {
  return {
    scale: isValidScale(data?.scale) ? data.scale : DEFAULTS.scale,
  };
}

function windowSizeForScale(logical, scale) {
  return {
    width: Math.round(logical.width * scale),
    height: Math.round(logical.height * scale),
  };
}

function createWindowSettingsStore({
  getFilePath,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
}) {
  return {
    load() {
      try {
        return normalizeSettings(JSON.parse(readFile(getFilePath(), 'utf8')));
      } catch {
        return { ...DEFAULTS };
      }
    },
    save(settings) {
      try {
        writeFile(getFilePath(), JSON.stringify(normalizeSettings(settings)));
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = {
  createWindowSettingsStore,
  normalizeSettings,
  windowSizeForScale,
  LOGICAL_SIZE,
  SCALE_LEVELS,
  DEFAULTS,
};
