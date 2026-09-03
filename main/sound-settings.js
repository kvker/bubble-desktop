// 音效设置存储：持久化开关与转动/发射独立音量，损坏或缺失时回退默认值
const fs = require('fs');

const DEFAULTS = { soundOn: true, scroll: 0.3, fire: 1 };

function isValidLevel(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeSettings(data) {
  return {
    soundOn: typeof data?.soundOn === 'boolean' ? data.soundOn : DEFAULTS.soundOn,
    scroll: isValidLevel(data?.scroll) ? data.scroll : DEFAULTS.scroll,
    fire: isValidLevel(data?.fire) ? data.fire : DEFAULTS.fire,
  };
}

function createSoundSettingsStore({
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
  createSoundSettingsStore,
  normalizeSettings,
  DEFAULTS,
};
