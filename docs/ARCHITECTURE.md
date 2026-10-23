# 架构与扩展指南

## 技术栈

- **Electron 38**（主进程 + 渲染进程，contextIsolation 隔离）
- **原生 HTML/CSS/JS**：无框架、无构建步骤，脚本按依赖顺序通过 `<script>` 直载（`file://` 零配置可跑）
- **本地 JSON 存储**：`%APPDATA%/梦幻养老助手/data.json`，原子写（临时文件 + rename）
- **内置字体**：霞鹜文楷屏幕版（OFL 1.1），许可随包分发（`src/renderer/assets/fonts/OFL.txt`）

## 目录结构

```
mh-tool/
├─ build/                        # 打包资源（应用图标）
├─ dist/                         # 打包输出（gitignore）
├─ docs/
│  ├─ STYLE_GUIDE.md             # 界面风格规范（Token/组件/反模式）
│  ├─ ARCHITECTURE.md            # 本文档
│  ├─ CHANGELOG.md               # 更新日志
│  └─ screenshots/               # --screenshot 生成的界面预览
├─ src/
│  ├─ main/                      # 主进程
│  │  ├─ main.js                 # 窗口生命周期与模块装配
│  │  ├─ ipc.js                  # 全部 ipcMain 处理器（数据/备份/窗口）
│  │  ├─ screenshot.js           # --smoke / --screenshot 开发辅助
│  └─ dev.js                  # --dev 开发模式热更新监听
│  ├─ preload/preload.js         # contextBridge API 白名单
│  └─ renderer/
│     ├─ index.html              # 唯一页面（脚本顺序即依赖顺序）
│     ├─ styles.css              # 全部样式（按节分区，见规范）
│     ├─ assets/
│     │  ├─ fonts/               # 霞鹜文楷 + OFL 许可
│     │  └─ images/online-record/  # 快速记录物品图标（59 个）
│     └─ js/
│        ├─ core/                # 无 UI 依赖的基础层
│        │  ├─ util.js           # U：日期/金额/转义等纯函数
│        │  ├─ data.js           # D：状态、常量、领域逻辑、持久化
│        │  └─ ui.js             # UI：Toast/弹窗/表单生成器/SVG 图标库/下拉与日历组件
│        ├─ layout/
│        │  ├─ titlebar.js       # 自绘标题栏（拖拽/最大化/关闭）
│        │  │  └─ dev.js            # 开发模式客户端（热替换/状态快照恢复）
│        │  └─ app.js            # 路由、导航、顶栏、启动引导
│        └─ views/               # 各页面（挂载到全局 Views 命名空间）
```

## 渲染进程分层规则

1. `core` 不得引用 `layout` / `views`；`layout` 不得引用 `views` 的内部细节（只按 `Views.xx` 调用）。
2. 页面一律实现为 `Views.<pageId> = function () { ... }`，往 `#view` 渲染并自行绑定事件。
3. 跨页面共享的状态放 `D.state`；跨页面共享的交互放 `UI`（弹窗/Toast/表单）。
4. 全局命名空间仅四个：`U`（工具）、`D`（数据）、`UI`（组件）、`Views`（页面）。

## IPC API（preload 暴露为 window.mh）

| 方法 | 说明 |
|---|---|
| `loadData()` / `saveData(data)` | 读写本地数据文件 |
| `exportData(data)` / `importData()` | 备份导出 / 导入（覆盖式） |
| `exportJson(data, defaultName)` | 通用 JSON 导出（物品单价等） |
| `info()` | 版本、数据文件路径、平台 |
| `winMin()` / `winMax()` / `winClose()` / `isMaximized()` | 自绘标题栏窗口控制 |
| `onWinState(cb)` | 订阅最大化状态变化 |
| `onDevReload(cb)` / `onDevCss(cb)` | 开发模式热更新通道（仅 `--dev` 时主进程会发送） |

## 数据模型（D.state）

| 集合 | 字段要点 |
|---|---|
| `characters` | id, name, level, school, server |
| `transactions` | id, characterId, date, kind(income/expense), currency(cash/reserve), amount(**单位: 万**), category, minutes, note, source?/itemId?（source='quick' 为快速记录生成） |
| `goals` | id, characterId, type(money/gear/progress), title, target, current, unit, status, deadline, logs[] |
| `equipment` | id, characterId, slot, name, level, attributes, special, gems, status |
| `gearLogs` | id, equipmentId, characterId, date, action, amount, note |
| `itemPrices` | 物品 id → 单价（**单位: 梦幻币**，与网页版单价文件互通） |
| `quickSettings` | accounts(在线角色数), cardPrice(梦幻币/点) |

> 金额双单位约定：transactions.amount 用「万」；itemPrices 用「梦幻币」（×10000 换算）。

## 如何新增一个页面

1. `src/renderer/js/views/xxx.js`：实现 `Views.xxx = function () {...}`；
2. `index.html` 在 `layout/app.js` 之前加 `<script>`；
3. `layout/app.js` 的 `Views._pages` 注册 `{ id, t, icon, sub }`（图标用 `UI.icon` 已有条目或先在 `core/ui.js` 补）；
4. 样式：按 `STYLE_GUIDE.md` 写入 `styles.css` 对应分区（新页面在文件尾部新增一节）；
5. 验证：`npm run smoke` + `npm run shots`，截图确认。

## 如何新增快速记录物品

在 `views/quick.js` 的 `QUICK_ITEMS` / `QUICK_UNSET` 数组加一行（图标放 `assets/images/online-record/`），无需其他改动。

## 开发与打包

```bash
npm install
npm run dev        # 开发模式（推荐）：热更新
npm start          # 普通运行（无热更新）
npm run smoke      # 冒烟：启动 1.2s 自动关闭
npm run shots      # 注入示例数据截图到 docs/screenshots
npm run dist       # 打包安装版 + 便携版到 dist/
```

### 热更新（`npm run dev`）

- `src/renderer` 下 **CSS** 变更 → 免刷新直接替换样式，不丢任何状态；
- `src/renderer` 下 **JS / HTML** 变更 → 页面自动刷新，并恢复所在页、角色筛选与计时中的快速记录（快照 10 分钟内有效）；
- `src/main` / `src/preload` 变更 → 终端提示手动重启（`Ctrl+C` 后重新 `npm run dev`），避免自动重启产生游离进程。

- 网络不佳时设置镜像：`ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR`（npmmirror）。
- 便携版偶发被杀毒软件锁文件：删旧文件重跑 `npx electron-builder --win portable`。

## 提交信息规范

格式：`<type>: <简短描述>` —— type 用英文小写，冒号后跟一个空格，描述简明扼要（建议不超过 50 字），可用中文。

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档变更 |
| `style` | 界面 / 样式调整（不影响逻辑） |
| `refactor` | 重构（既非新功能也非修复） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建、依赖、工具链等杂项 |

补充规则：

- 可选 scope 限定影响范围：`feat(quick): 支持数量累计`、`fix(titlebar): 双击还原失效`
- 详细说明写在正文（标题空一行之后），一个提交只做一件事
- 示例：`feat: 新增装备更换记录`、`fix: 修复目标进度重复注入`、`docs: 补充提交信息规范`

## 已知约定

- 金额显示统一走 `U.fmtMoney`（万/亿自动换算）。
- `source='quick'` 的交易由快速记录生成：物品点击 → 物品掉落收入；结束游戏 → 点卡支出（小时 × 点卡价 × 6 × 角色数）。
- 界面禁止 emoji 图标；`✕`/`✓` 为约定排版符号。
- 样式 Token 全部在 `styles.css :root`，改风格先改 `docs/STYLE_GUIDE.md`。
