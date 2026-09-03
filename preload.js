// 预加载脚本：只暴露全局按键事件、拖动窗口与统计查询的最小 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onGlobalKey: (cb) => ipcRenderer.on('gkey', (_e, payload) => cb(payload)),
  onHookStatus: (cb) => ipcRenderer.on('hook-status', (_e, s) => cb(s)),
  onSoundChanged: (cb) => ipcRenderer.on('sound-changed', (_e, on) => cb(on)),
  onSoundVolumeChanged: (cb) => ipcRenderer.on('sound-volume-changed', (_e, v) => cb(v)),
  onTouchOffChanged: (cb) => ipcRenderer.on('touch-off-changed', (_e, on) => cb(on)),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  dragStart: (pos) => ipcRenderer.send('drag-start', pos),
  dragMove: (pos) => ipcRenderer.send('drag-move', pos),
  dragEnd: () => ipcRenderer.send('drag-end'),
  getKeyStats: () => ipcRenderer.invoke('key-stats:get'),
  reportScoreCollected: (value) => ipcRenderer.send('score:collected', value),
});
