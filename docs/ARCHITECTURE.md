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
│        │  ├─ equipment.js      # D：三套装备方案、玉魄、引用与迁移
│        │  ├─ online.js         # D：在线记录、参数快照、跨日点卡结算
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

### 记账模块导航

- 侧栏「收益」对应 `Views.quick`，「账号」对应 `Views.account`，均默认进入快速记录。
- `transactions` 和 `accountRecords` 是模块内的完整列表，分别声明 `parent: 'quick'` 与 `parent: 'account'`；侧栏不单独渲染这些页面，选中状态跟随父模块。
- 快速页在 `Views._pages` 中通过 `records` 指定列表路由；顶栏据此显示「查看记录」与本模块记账按钮，列表显示「返回快速记录」。
- 总览顶栏仅保留角色筛选；分区入口打开对应的快速记录页。两个列表的筛选状态独立保留，跨页面切换保留收益计时。
- 总览两区时间范围放在 `Views._dashboardRanges`，收益默认本日、账号默认本月；账号首页范围放在 `Views._accountRange`，默认本月。三处共用 `UI.dateRange`，快捷项在前、起止日历在后，切换页面、角色和保存后保留范围。

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
| `characters` | id, name, level, school, server；progress（schoolSkills[]、auxiliarySkills[]：name/level；training、petTraining；qianyuanPills、potentialFruits、note）；equipmentSets[3]（name、slots：部位→装备 ID）、activeEquipmentSet、viewedEquipmentSet、pendingEquipmentSlots、soulJade（unlocked、attribute、level） |
| `transactions` | id, ledger(earnings/account), recordType(money/item), characterId, date, kind, currency(cash/reserve/rmb), amount, category, minutes, note, fee, channel；物品包含 itemName/quantity/unitPrice/status/saleId；结算包含 itemRecordId；装备关联包含 equipmentId/gearAction |
| `sessions` | id, characterId, mode(range/duration/legacy), source(timer/manual/legacy), date, startAt/endAt（本地时间对应的时间戳）, minutes, accounts, cardPrice, cost（万）, note, createdAt |
| `activeSession` | 未结束的 id, characterId, startAt, accounts, cardPrice, createdAt；开始即落盘，普通重启等待用户恢复 |
| `goals` | id, characterId, type(money/gear/progress), title, target, current, unit, status, deadline, logs[] |
| `equipment` | id, characterId, slot, name, level, attributes, special, gems, status；玉魄含 jade（base、extra1、extra2、dustLevel、holes、enchantments[]、durability） |
| `gearLogs` | id, equipmentId, characterId, date, action, amount, note |
| `itemPrices` | 物品 id → 单价（**单位: 梦幻币**，与网页版单价文件互通） |
| `quickSettings` | accounts(在线角色数), cardPrice(梦幻币/点) |

> 金额约定：游戏币流水和物品参考单价用「万」，人民币流水用「元」；itemPrices 用原始「梦幻币」。双账本与结算细则见 [LEDGERS.md](LEDGERS.md)。数据版本为 schemaVersion: 4。

共享账本列表和筛选位于 `views/records.js`，收益表单位于 `transactions.js`，账号快速记录、快捷表单预设和账号表单位于 `account.js`；金额、结算和装备关联逻辑集中在 `core/data.js`。

角色养成的归一化、验证、保存和关联删除位于 `core/data.js`，卡片与分区编辑位于 `views/characters.js`。`progress` 是版本 4 的可选字段，旧档案默认未记录；空值存为 `null`，明确填写的 0 原样保存。人物五项修炼与召唤兽四项修炼独立记录，师门和辅助技能使用可增删的名称/等级列表。新建、编辑和删除写入失败时回滚内存；基础档案编辑保留养成与装备信息，JSON 备份直接携带养成字段。

在线数据逻辑位于 `core/online.js`，表单、恢复提示和列表位于 `views/online.js`；`quick.js` 负责首页和计时显示。`onlineRecords` 与 `transactions` 都归属收益模块，通过内部页签切换。`D.saveSession` 同步生成每日点卡流水，`D.earningsStats` 按独立在线时长计算净时薪，活动用时不重复累计。

装备领域逻辑位于 `core/equipment.js`，在 `data.js` 之后加载。`views/equipment.js` 负责全部角色的独立装备卡片、角色仓库与属性卡；装备页不使用全局角色筛选，方案和格子事件限定在各自卡片内，进出仓库保留列表滚动位置。三套方案只引用装备 ID，当前使用和正在查看分别保存；资产 `status` 保留旧在用值兼容历史买卖，界面穿戴状态由方案引用推导。售出、删档和部位/角色变更清理引用，撤销出售只恢复持有。命魂之玉修炼存于角色，阴阳玉魄分别为独立装备资产。装备相关保存使用 `D.commitEquipment`，写入失败整体回滚内存。

## 如何新增一个页面

1. `src/renderer/js/views/xxx.js`：实现 `Views.xxx = function () {...}`；
2. `index.html` 在 `layout/app.js` 之前加 `<script>`；
3. `layout/app.js` 的 `Views._pages` 注册 `{ id, t, icon, sub }`（图标用 `UI.icon` 已有条目或先在 `core/ui.js` 补）；
   模块内二级页面增加 `parent`，父模块通过 `records` 指向记录列表，无需新增侧栏菜单。
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
npm run shots      # 注入示例数据截图到 docs/screenshots（不落盘）
npm run demo      # 写入完整示例数据到本地（覆盖当前数据）
npm test           # 记账领域回归测试
npm run test:electron # 隔离数据的真实 Electron 流程检查
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

- 游戏币显示走 `U.fmtMoney`（万/亿自动换算）；可能含人民币的金额走 `U.fmtAmount(value, currency)`。
- `source='quick'` 的物品速记归收益账本（金币直接记实际收入）；自动或手动在线记录通过 `sessionId` 关联 `source='online'` 的每日点卡成本。
- 界面禁止 emoji 图标；`✕`/`✓` 为约定排版符号。
- 样式 Token 全部在 `styles.css :root`，改风格先改 `docs/STYLE_GUIDE.md`。
