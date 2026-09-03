// Electron 主进程：编排悬浮窗、全局键盘、托盘、权限和 IPC
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  globalShortcut,
  systemPreferences,
  screen,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { registerDesktopIpc } = require('./main/desktop-ipc');
const { createKeyboardHook, loadNativeKeyboardHook } = require('./main/keyboard-hook');
const { createWindowStateStore, keepBottomEdge } = require('./main/window-state');
const { createSoundSettingsStore } = require('./main/sound-settings');
const mitt = require('mitt');
const { createKeyStatsStore, createKeyStatsTracker } = require('./main/key-stats');
const { createScoreStatsStore, registerScoreIpc } = require('./main/score-stats');

const WINDOW_SIZE = { width: 360, height: 420 };
const LEGACY_WINDOW_HEIGHT = 620;
const STATE_FILENAME = 'window-state.json';
const TOGGLE_SHORTCUT = 'CmdOrCtrl+Shift+B';

let win = null;
let tray = null;
let touchOff = false;  // 取消触点：窗口全透传不挡交互，恢复只能走托盘菜单
const SOUND_LEVELS = [0.1, 0.3, 0.5, 0.75, 1];  // 音量档位

// 音效开关与独立音量持久化（userData/sound-settings.json）
const soundStore = createSoundSettingsStore({
  getFilePath: () => path.join(app.getPath('userData'), 'sound-settings.json'),
});
const savedSound = soundStore.load();
let soundOn = savedSound.soundOn;
const soundVolume = { scroll: savedSound.scroll, fire: savedSound.fire };

function saveSoundSettings() {
  soundStore.save({ soundOn, ...soundVolume });
}

// 启动后把持久化的音效状态推给渲染进程
function pushSoundState() {
  sendToRenderer('sound-changed', soundOn);
  sendToRenderer('sound-volume-changed', { ...soundVolume });
}

// 音效音量统一切换：记录档位、持久化并同步渲染进程与托盘勾选态
function setSoundVolume(kind, level) {
  soundVolume[kind] = level;
  saveSoundSettings();
  sendToRenderer('sound-volume-changed', { ...soundVolume });
  rebuildTrayMenu();
}

function volumeSubmenu(label, kind) {
  return {
    label,
    submenu: SOUND_LEVELS.map((level) => ({
      label: `${Math.round(level * 100)}%`,
      type: 'radio',
      checked: Math.abs(soundVolume[kind] - level) < 1e-6,
      click: () => setSoundVolume(kind, level),
    })),
  };
}

const windowState = createWindowStateStore({
  getFilePath: () => path.join(app.getPath('userData'), STATE_FILENAME),
  getDisplays: () => screen.getAllDisplays(),
  windowSize: WINDOW_SIZE,
});

function getWindow() {
  return win;
}

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- 事件总线 ----------
// 共享 mitt 总线：键盘捕获发布 key:down / key:up 事实，订阅者独立响应
const appEvents = mitt();

// ---------- 按键统计 ----------
// 被动订阅者：只消费 key:down 中的 label 计数，不感知事件来源
const keyStatsStore = createKeyStatsStore({
  getFilePath: () => path.join(app.getPath('userData'), 'key-stats.json'),
});
const keyStats = createKeyStatsTracker({ store: keyStatsStore, events: appEvents });
keyStats.start();

// ---------- 打星星得分统计 ----------
// 独立持久化订阅者：接收渲染进程上报的得分事实，按天累计最近 7 天
const scoreStatsStore = createScoreStatsStore({
  getFilePath: () => path.join(app.getPath('userData'), 'score-stats.json'),
});

// ---------- 全局键盘监听 ----------
// 键盘捕获模块只发布按键事实，不感知消费方；游戏键由下方订阅器桥接渲染进程
const nativeKeyboard = loadNativeKeyboardHook();
const keyboardHook = createKeyboardHook({
  ...nativeKeyboard,
  events: appEvents,
});

// 游戏键事实 → gkey IPC（渲染进程契约不变）
appEvents.on('key:down', ({ type, label }) => {
  if (type) sendToRenderer('gkey', { type, down: true, label });
});
appEvents.on('key:up', ({ type }) => {
  if (type) sendToRenderer('gkey', { type, down: false });
});

// ---------- 权限 ----------
function hasPermission() {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(false);
}

function requestPermission() {
  if (process.platform === 'darwin') systemPreferences.isTrustedAccessibilityClient(true);
}

function pushHookStatus() {
  const granted = hasPermission();
  sendToRenderer('hook-status', {
    running: keyboardHook.isRunning && granted,
    granted,
  });
}

// ---------- 窗口 ----------

function loadWindowPosition() {
  return keepBottomEdge(
    windowState.load(),
    WINDOW_SIZE.height,
    LEGACY_WINDOW_HEIGHT,
  );
}
function saveWindowPosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  windowState.save({ x, y, windowHeight: WINDOW_SIZE.height });
}

function runSmokeCapture(targetWindow) {
  if (!process.env.BUBBLE_SHOT) return;
  setTimeout(() => sendToRenderer('gkey', { type: 'fire', down: true }), 2000);
  setTimeout(() => sendToRenderer('gkey', { type: 'left', down: true, label: 'Q' }), 2360);
  setTimeout(async () => {
    if (targetWindow.isDestroyed()) return;
    const image = await targetWindow.webContents.capturePage();
    fs.writeFileSync(process.env.BUBBLE_SHOT, image.toPNG());
  }, 2400);
}

function createWindow() {
  win = new BrowserWindow({
    ...WINDOW_SIZE,
    ...(loadWindowPosition() ?? {}),
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'index.html'), {
    query: { development: app.isPackaged ? '0' : '1' },
  });
  win.on('moved', saveWindowPosition);
  win.on('closed', () => {
    desktopIpc.resetDrag();
    win = null;
  });
  win.webContents.on('did-finish-load', () => {
    pushHookStatus();
    pushSoundState();
    runSmokeCapture(win);
  });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }
  win.show();
  win.focus();
}

function setPin(pinned) {
  if (!win) return;
  win.setAlwaysOnTop(pinned, 'screen-saver');
  sendToRenderer('pin-changed', pinned);
}

// ---------- 菜单与托盘 ----------
// 触点开关统一切换：取消后窗口全透传（左右键都穿透），同步渲染进程与托盘勾选态
function setTouchOff(off) {
  touchOff = off;
  if (off && win && !win.isDestroyed()) win.setIgnoreMouseEvents(true, { forward: true });
  sendToRenderer('touch-off-changed', touchOff);
  rebuildTrayMenu();
}

// 统计窗口尺寸：宽 1024 固定，总高 = 16:9 高度 576 - 标题栏 28 ≈ 548（内容区不再被标题栏压缩）
function getStatsWindowSize() {
  const width = 1024;
  return { width, height: Math.round((width * 9) / 16) - 28 };
}

// 按键统计窗口：独立展示最近 7 天，关闭即销毁，再次打开复用
let statsWindow = null;

function openKeyStatsWindow() {
  if (statsWindow && !statsWindow.isDestroyed()) {
    statsWindow.show();
    statsWindow.focus();
    return;
  }
  statsWindow = new BrowserWindow({
    ...getStatsWindowSize(),
    title: '统计面板（最近 7 天）',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  statsWindow.loadFile(path.join(__dirname, 'stats.html'));
  statsWindow.on('closed', () => {
    statsWindow = null;
  });
}

// 开机自启动：仅打包应用读写系统登录项；开发态读写会留下裸 Electron 登录项，直接禁用
function getOpenAtLogin() {
  if (!app.isPackaged) return false;
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setOpenAtLogin(open) {
  if (app.isPackaged) {
    try {
      app.setLoginItemSettings({ openAtLogin: open });
    } catch {
      // 系统限制或权限异常时静默，不阻塞菜单
    }
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const granted = hasPermission();
  const menu = Menu.buildFromTemplate([
    {
      label: '通用',
      submenu: [
        { label: '显示 / 隐藏', accelerator: TOGGLE_SHORTCUT, click: toggleWindow },
        {
          label: '始终置顶',
          type: 'checkbox',
          checked: win ? win.isAlwaysOnTop() : true,
          click: (item) => setPin(item.checked),
        },
        {
          label: '恢复 / 取消触点',
          type: 'checkbox',
          checked: !touchOff,
          click: (item) => setTouchOff(!item.checked),
        },
        {
          label: '开机自启动',
          type: 'checkbox',
          checked: getOpenAtLogin(),
          click: (item) => setOpenAtLogin(item.checked),
        },
        granted
          ? { label: '键盘监听：已授权 ✓', enabled: false }
          : { label: '键盘监听未授权，点击去授权（授权后需重启）', click: requestPermission },
      ],
    },
    {
      label: '音频',
      submenu: [
        {
          label: '开/关音效',
          type: 'checkbox',
          checked: soundOn,
          click: (item) => {
            soundOn = item.checked;
            saveSoundSettings();
            sendToRenderer('sound-changed', soundOn);
          },
        },
        volumeSubmenu('转动音效音量', 'scroll'),
        volumeSubmenu('发射音效音量', 'fire'),
      ],
    },
    {
      label: '统计',
      submenu: [
        { label: '统计面板', click: openKeyStatsWindow },
      ],
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  // 状态栏 template 图标：纯黑+透明 PNG，系统自动适配深浅色（assets/tray-template.png）
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-template.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('泡泡龙键盘伴侣');
  rebuildTrayMenu();
}

// ---------- IPC 与生命周期 ----------
const desktopIpc = registerDesktopIpc({
  ipcMain,
  getWindow,
  saveWindowPosition,
});

// 按键统计查询：只接受本应用窗口发起的请求
ipcMain.handle('key-stats:get', (event) => {
  const isTrustedSender =
    (win && !win.isDestroyed() && event.sender === win.webContents) ||
    (statsWindow && !statsWindow.isDestroyed() && event.sender === statsWindow.webContents);
  if (!isTrustedSender) return null;
  return {
    ...keyStatsStore.getReport(),
    score: scoreStatsStore.getReport(),
  };
});

// 打星星得分上报：注册到 score-stats（只接受主游戏窗口发来的事实，星星只产生于游戏场景）
const scoreIpc = registerScoreIpc({ ipcMain, getWindow, store: scoreStatsStore });

async function bootstrap() {
  createWindow();
  createTray();
  keyboardHook.start();
  pushHookStatus();
  globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // 常驻托盘，不退出。
});

app.on('will-quit', () => {
  saveWindowPosition();
  globalShortcut.unregisterAll();
  keyboardHook.stop();
  keyStats.stop();
  ipcMain.removeHandler('key-stats:get');
  scoreIpc.dispose();
  desktopIpc.dispose();
});
