// 窗口状态存储：持久化位置并确保窗口仍位于可用显示器内
const fs = require('fs');

function isFinitePosition(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y);
}

function isPositionVisible(position, windowSize, displays) {
  if (!isFinitePosition(position)) return false;
  const centerX = position.x + windowSize.width / 2;
  const centerY = position.y + windowSize.height / 2;
  return displays.some(({ workArea }) => (
    centerX >= workArea.x
    && centerX < workArea.x + workArea.width
    && centerY >= workArea.y
    && centerY < workArea.y + workArea.height
  ));
}

function keepBottomEdge(position, currentHeight, legacyHeight = currentHeight) {
  if (!isFinitePosition(position)) return null;
  const previousHeight = Number.isFinite(position.windowHeight)
    ? position.windowHeight
    : legacyHeight;
  return {
    x: position.x,
    y: position.y + previousHeight - currentHeight,
  };
}

function createWindowStateStore({
  getFilePath,
  getDisplays,
  windowSize,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
}) {
  return {
    load() {
      try {
        const position = JSON.parse(readFile(getFilePath(), 'utf8'));
        return isPositionVisible(position, windowSize, getDisplays()) ? position : null;
      } catch {
        return null;
      }
    },
    save(position) {
      if (!isFinitePosition(position)) return false;
      try {
        writeFile(getFilePath(), JSON.stringify(position));
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = {
  createWindowStateStore,
  isFinitePosition,
  keepBottomEdge,
  isPositionVisible,
};
