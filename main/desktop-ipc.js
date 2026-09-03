// 桌面 IPC 边界：校验发送方和坐标后再控制窗口
function isFinitePoint(point) {
  return Number.isFinite(point?.screenX) && Number.isFinite(point?.screenY);
}

function createDragController({ getWindow, saveWindowPosition }) {
  let dragState = null;

  return {
    start(point) {
      const win = getWindow();
      if (!win || win.isDestroyed() || !isFinitePoint(point)) return false;
      const [winX, winY] = win.getPosition();
      dragState = {
        startX: point.screenX,
        startY: point.screenY,
        winX,
        winY,
      };
      return true;
    },
    move(point) {
      const win = getWindow();
      if (!win || win.isDestroyed() || !dragState || !isFinitePoint(point)) return false;
      win.setPosition(
        Math.round(dragState.winX + point.screenX - dragState.startX),
        Math.round(dragState.winY + point.screenY - dragState.startY),
      );
      return true;
    },
    end() {
      if (!dragState) return false;
      dragState = null;
      saveWindowPosition();
      return true;
    },
    reset() {
      dragState = null;
    },
  };
}

function registerDesktopIpc({ ipcMain, getWindow, saveWindowPosition }) {
  const drag = createDragController({ getWindow, saveWindowPosition });
  const isTrustedEvent = (event) => {
    const win = getWindow();
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  };

  const listeners = {
    'set-ignore-mouse': (event, ignore) => {
      if (!isTrustedEvent(event) || typeof ignore !== 'boolean') return;
      getWindow().setIgnoreMouseEvents(ignore, { forward: true });
    },
    'drag-start': (event, point) => {
      if (isTrustedEvent(event)) drag.start(point);
    },
    'drag-move': (event, point) => {
      if (isTrustedEvent(event)) drag.move(point);
    },
    'drag-end': (event) => {
      if (isTrustedEvent(event)) drag.end();
    },
  };

  for (const [channel, listener] of Object.entries(listeners)) {
    ipcMain.on(channel, listener);
  }

  return {
    resetDrag: drag.reset,
    dispose() {
      drag.reset();
      for (const [channel, listener] of Object.entries(listeners)) {
        ipcMain.removeListener(channel, listener);
      }
    },
  };
}

module.exports = {
  createDragController,
  isFinitePoint,
  registerDesktopIpc,
};
