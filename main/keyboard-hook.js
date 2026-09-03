// 全局键盘捕获：独立模块，只向共享 mitt 总线发布 key:down / key:up 事实，不感知任何消费方
const LEFT_KEYS = ['1', '2', '3', '4', '5', 'Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
const RIGHT_KEYS = ['6', '7', '8', '9', '0', 'Y', 'U', 'I', 'O', 'P', 'H', 'J', 'K', 'L', 'N', 'M'];

function buildKeySets(keyCodes) {
  const labels = new Map();
  for (const key of [...LEFT_KEYS, ...RIGHT_KEYS]) labels.set(keyCodes[key], key);
  labels.set(keyCodes.ArrowLeft, '←');
  labels.set(keyCodes.ArrowRight, '→');

  return {
    left: new Set([...LEFT_KEYS.map((key) => keyCodes[key]), keyCodes.ArrowLeft]),
    right: new Set([...RIGHT_KEYS.map((key) => keyCodes[key]), keyCodes.ArrowRight]),
    space: keyCodes.Space,
    labels,
  };
}

function classifyKey(keycode, keySets) {
  if (keycode === keySets.space) return { type: 'fire' };
  if (keySets.left.has(keycode)) return { type: 'left', label: keySets.labels.get(keycode) };
  if (keySets.right.has(keycode)) return { type: 'right', label: keySets.labels.get(keycode) };
  return null;
}

// 构建 keycode → 常量名 反向映射（用于未分类按键的 label）
function buildKeyNameByCode(keyCodes) {
  const map = new Map();
  if (!keyCodes) return map;
  for (const [name, code] of Object.entries(keyCodes)) {
    map.set(code, name);
  }
  return map;
}

// 解析按键 label：游戏键保留原 label，Space 独立映射，其余回退到常量名或 keycode 字符串
function resolveKeyLabel(keycode, key, keySets, keyNameByCode) {
  if (key?.label) return key.label;
  if (keySets?.space === keycode) return 'Space';
  return keyNameByCode.get(keycode) ?? String(keycode);
}

function loadNativeKeyboardHook({ requireModule = require, logger = console } = {}) {
  try {
    const { uIOhook, UiohookKey } = requireModule('uiohook-napi');
    return { hook: uIOhook, keyCodes: UiohookKey };
  } catch (error) {
    logger.error('uiohook-napi 加载失败：', error.message);
    return { hook: null, keyCodes: null };
  }
}

// 只发布按键事实：key:down { type, label }、key:up { type }，type 仅游戏键有值（left/right/fire）
function createKeyboardHook({ hook, keyCodes, events, logger = console }) {
  let running = false;
  const keySets = keyCodes ? buildKeySets(keyCodes) : null;
  const keyNameByCode = buildKeyNameByCode(keyCodes);

  const handleDown = (event) => {
    const key = classifyKey(event.keycode, keySets);
    events.emit('key:down', {
      type: key?.type ?? null,
      label: resolveKeyLabel(event.keycode, key, keySets, keyNameByCode),
    });
  };
  const handleUp = (event) => {
    const key = classifyKey(event.keycode, keySets);
    events.emit('key:up', { type: key?.type ?? null });
  };
  const removeListeners = () => {
    const remove = hook?.off?.bind(hook) ?? hook?.removeListener?.bind(hook);
    if (remove) {
      remove('keydown', handleDown);
      remove('keyup', handleUp);
    }
  };

  return {
    get isRunning() {
      return running;
    },
    start() {
      if (!hook || !keySets || running) return false;
      hook.on('keydown', handleDown);
      hook.on('keyup', handleUp);
      try {
        hook.start();
        running = true;
        return true;
      } catch (error) {
        removeListeners();
        logger.error('全局键盘监听启动失败：', error.message);
        return false;
      }
    },
    stop() {
      if (!hook || !running) return;
      try {
        hook.stop();
      } catch {
        // 应用退出时忽略原生监听器停止失败。
      }
      removeListeners();
      running = false;
    },
  };
}

module.exports = {
  buildKeySets,
  buildKeyNameByCode,
  classifyKey,
  createKeyboardHook,
  loadNativeKeyboardHook,
  resolveKeyLabel,
};
