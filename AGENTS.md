# 泡泡龙键盘伴侣

不是游戏，是桌面陪伴挂件：两只小泡泡龙常驻屏幕角落，你敲键盘干活时它们跟着同步转滚轮，按空格就朝滚轮方向吐个泡泡。泡泡飞远了自动破裂回收，不会累积。

## 运行

```bash
pnpm install   # 首次安装
pnpm start
pnpm dev     # 等同 pnpm start
```

## 工程检查

```bash
pnpm verify       # 语法检查 + 自动化测试
pnpm run dist     # 构建 macOS 安装包
```

自动化测试使用 Node 内置测试运行器，不需要额外开发依赖。

## 架构

```text
main.js                    Electron 生命周期与桌面能力编排
├── main/keyboard-hook.js  全局键盘捕获：只发布 key:down/key:up 事实
├── main/window-state.js   窗口位置持久化与显示器校验
├── main/score-stats.js   打星星得分按天持久化与报告
└── main/desktop-ipc.js    IPC 信任边界与窗口拖动

preload.js                 最小化渲染进程 API（含 getKeyStats 统计查询）
src/game.js                       PixiJS 场景、输入与每帧编排
├── src/game/domain.mjs           无运行时依赖的纯领域规则
└── src/features/                 自治玩法功能
    ├── score-stars.mjs           星星生成、碰撞与销毁
    ├── score-recorder.mjs        后台分数记录
    ├── score-display.mjs         仅开发态显示
    └── gameplay-events.mjs       mitt 事实事件契约
```

入口文件负责表达完整业务流程，基础设施副作用集中在 `main/`，运动、选帧和键位分类规则集中在 `src/game/domain.mjs` 并可独立测试。

窗口网页内容区固定为 360×420，与完整玩法有效区域一致；渲染层读取 `window.innerWidth/innerHeight`，泡泡破裂净空从内容区顶部开始，不保留额外透明空白。

### 稳定基础架构约束

当前架构是后续玩法扩展的稳定基线。除非用户明确要求，或必须修复缺陷、安全问题、平台兼容问题，否则不对以下模块做破坏性变更：

- `main.js` 与 `main/`：Electron 生命周期、系统能力和 IPC 边界。
- `preload.js`：渲染进程可使用的最小桌面 API。
- `src/game.js`：现有泡泡、角色、输入与 PixiJS 场景编排。
- `src/game/domain.mjs`：现有运动、回中、选帧和键位领域规则。

“破坏性变更”包括改变既有职责、协议或行为，把新玩法状态和分支塞入基础模块，或者让基础模块依赖具体玩法。允许的默认改动仅限新增自治功能模块，以及在顶层增加不含业务逻辑的注册和组装代码。

### 玩法扩展原则

后续玩法按“自治模块 + 事件协作”扩展：

- 功能自己拥有状态、视图、更新、碰撞检测和销毁生命周期。
- 功能通过构造参数获得舞台、Ticker、只读查询或其他必要能力，不读取其他功能的内部可变状态。
- 功能之间不直接调用内部实现，也不由现有基础玩法接管新业务。
- 跨功能消息使用共享 `mitt` 实例，只发送已经发生的事实，不发送要求其他模块执行某个流程的命令。
- 事件发布者不知道谁会消费事件；订阅者独立决定如何响应。
- 顶层编排只负责创建事件总线和注册功能，不处理星星生成、碰撞或计分规则。

以未来“得分星星”为例，目标依赖关系是：

```text
顶层玩法编排
├── 创建共享 mitt 事件总线
├── 注册星星功能
│   ├── 在固定范围内随机生成星星
│   ├── 自己检测与泡泡的碰撞
│   ├── 发布 star:collected 事实事件
│   └── 销毁被碰撞的星星
└── 注册计分功能
    ├── 订阅 star:collected
    ├── 独立维护得分状态
    └── 独立更新得分显示
```

组装代码只表达依赖关系：

```js
const gameplayEvents = mitt();

mountScoreFeature({ stage, events: gameplayEvents });
mountStarFeature({
  stage,
  ticker: app.ticker,
  events: gameplayEvents,
  getBubbles: () => readonlyBubbleSnapshots,
});
```

星星功能在碰撞后只发布事实并结束自己的生命周期：

```js
events.emit('star:collected', {
  starId,
  value,
  position: { x, y },
});
destroy();
```

计分功能是独立订阅者；现有泡泡、角色、键盘、桌面基础模块都不订阅 `star:collected`，也不保存或计算得分。未来可以用同一模式增加连击、成就、音效反馈、粒子效果等其他订阅者，而不修改星星功能或稳定基础架构。

该扩展协议现已用于得分星星：`mitt` 通过独立 vendoring 脚本进入浏览器运行时，星星、计分记录器和开发态显示器保持自治。

计分记录器持续累计进程内总分并保持显示器运行规则不变；跨重启持久化由主进程 `score-stats` 订阅者按天写入 `userData/score-stats.json`，统计面板置顶展示最近 7 天得分。

## 行为

| 你的操作 | 挂件反应 |
| --- | --- |
| 敲键盘左半区任意键（G/T/V 及左侧，含 1–5） | 滚轮向左转，左龙走踏，播放转动音效 |
| 敲键盘右半区任意键（H/Y/B 及右侧，含 6–0） | 滚轮向右转，右龙走踏，播放转动音效 |
| 按空格 | 沿滚轮角度吐出一个泡泡（发射音效），发射后指针自动回中 |
| 泡泡碰到黄色五角星 | 星星发布收集事件并自毁，后台计分增加 1；得分文字只在 `pnpm start` / `pnpm dev` 时显示 |
| 方向键 ← / → | 滚轮左转 / 右转（仅此两个特殊键生效） |
| 敲击任意字母/数字键 | 发射球中心渐隐显示所按字符（白字黑边带阴影） |
| `Cmd/Ctrl + Shift + B` | 显示 / 隐藏（全局快捷键） |
| 状态栏托盘菜单 | 显示/隐藏、始终置顶、音效开关、转动/发射音效音量档位（10%–100%，开关与音量均持久化）、恢复/取消触点、统计面板、开机自启动、退出应用；未授权时含“去授权”入口（与系统权限设置同效用） |
| 左键拖动挂件 | 移动位置，重启后恢复到最后拖到的位置 |
| 托盘菜单 → 统计面板 | 打开统计面板：置顶展示近 7 天逐日打星星得分与合计，下方为最近 7 天 26 个字母、数字 0-9、左右方向键（←/→）的点击次数（按日分列 + 合计，其余按键不统计） |
| 托盘菜单 → 开机自启动 | 勾选后在登录系统时自动启动（读写系统登录项，打包应用生效） |

键盘监听是**全局**的：窗口不聚焦、你在别的应用里打字，滚轮也会跟着转。

按键捕获是独立发布者模块（`main/keyboard-hook.js`），只向共享 mitt 总线发布 `key:down` / `key:up` 事实（`type` 仅游戏键有值）。主进程的 gkey IPC 转发、按键统计都是订阅者，新增消费方只需再挂一个订阅者，捕获模块零改动。

## macOS 首次运行：授权

全局键盘监听需要“辅助功能”权限。未授权时，托盘菜单中会出现“去授权”入口，点击弹出系统授权引导（或在 系统设置 → 隐私与安全性 → 辅助功能 中勾选本应用）。**授权后需要重启应用生效**。

未授权时的兜底行为：仅当挂件窗口聚焦时响应键盘。

Windows 无需授权。

## 打包（macOS）

```bash
pnpm run dist   # 输出 dist/ 下的 dmg 和 zip（Apple Silicon，未签名）
```

注意事项：

- 打包后是独立 App，需在 系统设置 → 隐私与安全性 → 辅助功能 中为它单独授权（与开发时的 Electron 授权不共享），授权后重启 App 生效。
- 未签名应用在其他 Mac 首次打开会被 Gatekeeper 拦截，右键 → 打开 即可。
- 打包图标使用 `build/icon.png`（AI 生成原创 logo，1024×1024）；electron-builder 会自动生成 icns 等多尺寸图标。
- 状态栏（菜单栏）图标使用 `assets/tray-template.png`（纯黑+透明的 template 图，系统自动适配深浅色）；在 `main.js` 的 `createTray()` 中 `nativeImage.createFromPath` + `setTemplateImage(true)` 加载。

## 角色表现：艺术字物料（JSON 驱动）

角色不再使用贴图素材，改为**角色物料 JSON** 驱动。物料声明 `type: "text" | "image"`，两种类型共用同一套动画编排（`fire/walk/idle` 各状态的整体形变），扩展新角色只需放一份完整物料并在 `skins/index.mjs` 导入、`game.js` 注册容器，零代码改动画逻辑。

### text 物料

```jsonc
{
  "schemaVersion": 1, "type": "text", "id": "male",
  "style": { "fontSize": 44, "fill": "#ffffff", "fontFamily": "-apple-system, \"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", sans-serif",
    "fontWeight": "bold", "stroke": { "width": 6, "color": "#000000" },
    "dropShadow": { "distance": 3, "alpha": 0.4, "blur": 3 } },
  "states": {
    "fire": { "text": "左", "animation": [
        { "prop": "scaleX", "type": "pulse", "amp": 0.16, "duration": 0.25 },
        { "prop": "scaleY", "type": "pulse", "amp": 0.16, "duration": 0.25, "invert": true } ] },
    "walk": { "text": "左", "animation": [
        { "prop": "scaleX", "type": "sine", "amp": 0.1, "freq": 9 },
        { "prop": "scaleY", "type": "sine", "amp": 0.1, "freq": 9, "phase": 180 } ] },
    "idle": { "text": "左", "animation": [
        { "prop": "scaleY", "type": "sine", "amp": 0.02, "freq": 2.2 },
        { "prop": "y", "type": "sine", "amp": 2.5, "freq": 2.2 } ] }
  }
}
```

### image 物料（单帧）

```jsonc
{
  "schemaVersion": 1, "type": "image", "id": "img-sample",
  "states": {
    "fire": { "image": "./fire.png", "animation": [...] },
    "walk": { "image": "./walk.png", "animation": [...] },
    "idle": { "image": "./idle.png", "animation": [...] }
  }
}
```

- image 类型每个状态一张**单帧静态图**，路径相对物料所在 `skins/<id>/` 目录；渲染用 `Assets.load` 加载 PNG，按状态切换 texture。**不支持 frames 多帧序列**，验证工具发现 `frames` 直接报错。
- image 类型忽略 `style`（不读文字样式）；角色整体形变与 text 完全共用同一编排。

### 通用规则

- 状态枚举固定为 `fire`（发射）、`walk`（走踏）、`idle`（待机）。
- text 类型每个状态 `text` 必填非空（即使与其它状态相同也必须显式写出）；image 类型每个状态 `image` 必填且文件存在。
- `animation` 数组：`prop` 仅 `scaleX/scaleY/skewX/y`；`type` 仅 `sine`（需 `freq`，可带 `phase` 度数）与 `pulse`（需 `duration`，可 `invert` 反向）；多条目对同一 prop 求和。
- 形变优先级：发射 > 走踏 > 待机，纯函数逻辑在 `src/game/domain.mjs`（`waveValue` / `evaluateStateAnimation` / `selectDragonMotion`），可独立测试。

### 验证工具与打包

- `pnpm validate:character` 全量扫描 `skins/`，逐份校验 schemaVersion / type / states（text 强制文字、image 强制图片文件存在、动画字段合法、拒绝 frames），失败退出非零；已纳入 `pnpm verify`。
- 物料随 `build.files`（`skins/**`，含 JSON 与 PNG）打进 asar，渲染进程以 ES module 导入 JSON + `Assets.load` 加载图片（路径相对文档根 `./skins/<id>/<file>`）。
- 资源目录约定 `skins/<id>/character.json`；未来 Steam DLC 皮肤可在同一目录约定下扩展（Windows 为发布主战场）。

## 技术栈

Electron + PixiJS + uiohook-napi（N-API 全局键盘监听，免 Electron 重编译，预置 macOS/Windows/Linux 二进制）。
