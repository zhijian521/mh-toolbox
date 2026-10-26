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
│  │  ├─ equipment-ocr.js        # 图片验证、预处理、识别进程生命周期
│  │  ├─ equipment-ocr-worker.js # 独立进程内的本地 PaddleOCR / ONNX 模型
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
│        │  ├─ data.js           # D：根状态、常量与基础查询
│        │  ├─ storage.js        # D：串行提交、失败回滚与持久化
│        │  ├─ characters.js     # D：角色、养成与变更快照
│        │  ├─ schools.js        # D：官网门派技能静态模板
│        │  ├─ statistics.js     # D：收益与账号统计
│        │  ├─ ledger.js         # D：账本、库存与装备关联
│        │  ├─ export.js         # D：CSV 编码与转义
│        │  ├─ goals.js          # D：目标与进度历史
│        │  ├─ migration.js      # D：备份校验与版本迁移
│        │  ├─ equipment.js      # D：三套装备方案、玉魄、引用与迁移
│        │  ├─ equipment-import.js # D：OCR 文字解析与批量建档
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

- 菜单栏底部的侧栏面板图标控制 200px / 64px 两种宽度，通过 `Views.setSidebarCollapsed` 更新布局，不重建正文或变更业务状态；`mh.sidebarCollapsed` 在本机 localStorage 保存偏好，启动时立即恢复。菜单选中使用淡朱砂底色与深红图文，收起时保持为居中方形。
- 主菜单使用原生按钮，提供菜单名称、悬停提示和当前模块标记；重建菜单后按相同路由恢复焦点。设置页面的内部路由为 `backup`，显示名称统一为「设置」，使用独立调节图标。

- 侧栏「收益」对应 `Views.quick`，「账号」对应 `Views.account`，均默认进入快速记录。
- `transactions` 和 `accountRecords` 是模块内的完整列表，分别声明 `parent: 'quick'` 与 `parent: 'account'`；侧栏不单独渲染这些页面，选中状态跟随父模块。
- 快速页在 `Views._pages` 中通过 `records` 指定列表路由；顶栏据此显示「查看记录」与本模块记账按钮，列表显示「返回快速记录」。
- 总览顶栏仅保留角色筛选；分区入口打开对应的快速记录页。两个列表的筛选状态独立保留，跨页面切换保留收益计时。
- 总览两区时间范围放在 `Views._dashboardRanges`，收益默认本日、账号默认本月；账号首页范围放在 `Views._accountRange`，默认本月。三处共用 `UI.dateRange`，快捷项在前、起止日历在后，切换页面、角色和保存后保留范围。

## IPC API（preload 暴露为 window.mh）

| 方法 | 说明 |
|---|---|
| `loadData()` / `saveData(data, options)` | 读写本地数据文件 |
| `exportData(data)` / `importData()` | 备份导出 / 导入（覆盖式） |
| `exportJson(data, defaultName)` | 通用 JSON 导出（物品单价等） |
| `exportCsv(text, defaultName)` | 导出 UTF-8 BOM CSV，调用系统保存对话框 |
| `info()` | 版本、数据文件路径、平台 |
| `winMin()` / `winMax()` / `winClose()` / `isMaximized()` | 自绘标题栏窗口控制 |
| `onWinState(cb)` | 订阅最大化状态变化 |
| `onDevReload(cb)` / `onDevCss(cb)` | 开发模式热更新通道（仅 `--dev` 时主进程会发送） |
| `equipmentClipboard()` | 读取剪贴板截图，返回 PNG data URL 或空字符串 |
| `recognizeEquipment(image, id)` / `cancelEquipmentOcr(id)` | 本地识别单张图片 / 取消当前窗口的对应请求 |
| `onEquipmentOcrProgress(cb)` | 订阅 `{id, progress}`，返回取消订阅函数 |

## 数据模型（D.state）

| 集合 | 字段要点 |
|---|---|
| `characters` | id, name, level, school, server, pinned, sortOrder；progress（schoolSkills[]、auxiliarySkills[]：name/level；training、petTraining；qianyuanPills、potentialFruits、note）；growthHistory[]（id/date/createdAt/source/sourceName/note/changes[]）；equipmentSets[3]（name、slots：部位→装备 ID）、activeEquipmentSet、viewedEquipmentSet、pendingEquipmentSlots、soulJade（unlocked、attribute、level） |
| `transactions` | id, ledger(earnings/account), recordType(money/item), characterId, date, kind, currency(cash/reserve/rmb), amount, category, minutes, note, fee, channel；物品包含 itemName/quantity/unitPrice/status/saleId；结算包含 itemRecordId/saleQuantity；装备关联包含 equipmentId/gearAction |
| `sessions` | id, characterId, mode(range/duration/legacy), source(timer/manual/legacy), date, startAt/endAt（本地时间对应的时间戳）, minutes, accounts, cardPrice, cost（万）, note, createdAt |
| `activeSession` | 未结束的 id, characterId, startAt, accounts, cardPrice, createdAt；开始即落盘，普通重启等待用户恢复 |
| `goals` | id, characterId（`all` 或角色 ID）, pinned, sortOrder, type(money/gear/progress), title, target, tracking（null 或 category/key）, current, unit, status, deadline, doneAt, baseProgress, logs[]（id/date/delta/note） |
| `equipment` | id, characterId, slot, name, level, attributes, special, gems, status；截图录入含 ocrText（识别原文）；玉魄含 jade（base、extra1、extra2、dustLevel、holes、enchantments[]、durability） |
| `gearLogs` | id, equipmentId, characterId, date, action, amount, note |
| `itemPrices` | 物品 id → 单价（**单位: 梦幻币**，与网页版单价文件互通） |
| `quickSettings` | accounts(在线角色数), cardPrice(梦幻币/点) |

角色养成历史由 `applyCharacter` 在串行提交内比较最新档案生成，与档案一起持久化和失败回滚；普通编辑、养成保存、复制共用此入口。`changes[]` 保存分区、项目名称、前后值、单位及类型（提升/调低/补录/清空/新增/移除/调整），技能按名称比较，重排不产生记录。首次建档不生成变更，昵称、服务器和长期备注不参与比较。编辑表单的日期与本次说明通过独立参数传入，不写入当前养成值；复制只记录目标变化并快照来源名称。历史归角色所有，随备份深拷贝保留、随角色删除，装备/记账操作不写入养成历史。

`views/character-history.js` 负责只读日期时间线，提供全部或单个角色、统一日期范围和每页 12 次变更的分页；筛选局限在弹窗，不修改全局角色筛选。

> 金额约定：游戏币流水和物品参考单价用「万」，人民币流水用「元」；itemPrices 用原始「梦幻币」。双账本与结算细则见 [LEDGERS.md](LEDGERS.md)。数据版本为 schemaVersion: 5。

共享账本列表和筛选位于 `views/records.js`，收益表单位于 `transactions.js`，账号快速记录、快捷表单预设和账号表单位于 `account.js`；金额、库存与装备关联在 `core/ledger.js`，统计在 `statistics.js`，CSV 编码在 `export.js`。

目标领域位于 `core/goals.js`。`characterId: 'all'` 动态涵盖全部角色，单角色筛选仍展示全体目标；目标页和总览共用 `D.goalsFor` 与纯读取的 `D.goalSummary`，不缩小全体目标的计算范围。跟随目标的 `target` 是每个角色的门槛，`tracking` 指向辅助/师门技能、人物/召唤兽修炼、等级、乾元丹或潜能果；进度逐个封顶再汇总，未知值保持 null，只有存在成员且全部达标才完成，调低、清空或新增角色会重新判断。状态与当前值从档案即时派生，存储的 `status/current/logs` 仅用于手动累计模式。`D.saveGoalGrowth` 在同一提交中调用 `applyCharacter` 更新指定项目并生成角色养成记录，任一校验或落盘失败全部回滚；养成目标历史筛选原始角色记录，删除目标不删除档案及养成记录。存钱和装备目标沿用手动流水及完成/恢复操作。

`D.orderedGoals` 按置顶组优先、组内 sortOrder、创建时间排列，新目标放到普通组首位，编辑不重排；总览同样优先置顶。`D.saveGoalOrder` 在提交队列内读取最新目标，通过相邻目标 ID 保存前后位置，置顶和普通组不能跨组拖动；从自动排序拖动时先按可见 ID 顺序排列对应位置，再移动目标，隐藏目标保留相对顺序。保存失败整体回滚，排序字段随备份及重启保留。`Views.goalBindOrdering` 仅在本次网格绑定拖放、方向键和边缘滚动，不重复绑定全局事件；拖放取消或结束清理插入线和滚动帧。每个角色进度直接展示，页面统一滚动。

角色养成的归一化、验证、保存、排序和关联删除位于 `core/characters.js`，卡片与统一档案编辑位于 `views/characters.js`。未记录值存为 `null`，明确填写的 0 原样保存；人物五项修炼与召唤兽四项修炼独立记录。师门和辅助技能使用可增删、调整顺序的名称/等级列表，技能区达到 580px 时每行两项，否则单列；顺序随档案及备份保存。`D.orderedCharacters` 按置顶组优先、组内 sortOrder 升序排列；新角色加入普通组首位，置顶切换加入目标组首位，组内调整使用 `D.saveCharacterOrder` 串行提交并支持失败回滚；编辑已有档案不计算新角色位置。

卡片顶部操作依次为置顶、排序、养成记录、复制养成、删除、编辑档案。统一编辑器用分区配置显式组织基础信息、师门技能、人物修炼、召唤兽修炼、辅助技能和其他养成，标题下固定导航定位并聚焦分区标题。切换门派后如已有师门技能，须明确选择保留或替换，再允许保存或补齐模板。统一表单只采集一次草稿，通过 `D.saveCharacter` 一次提交全部信息，共用领域校验；保存期间由 `UI.formModal` 锁定全部控件，失败整体回滚、恢复原禁用状态并保留草稿。`UI.openModal` 支持 `returnFocus` 回调，重建页面后按稳定角色 ID 恢复操作焦点；角色异步回调仅在当前仍为角色页时重建卡片，删除则刷新当前页面。

复制预览调用纯函数 `D.characterCopyChanges` 计算所选项目的变更，实际保存由 `D.copyCharacterProgress` 在提交队列内读取最新来源并重新计算。默认跳过未记录项：修炼逐项合并，技能按来源顺序排列，同名空等级保留目标等级，目标独有技能追加保留，明确的 0 正常复制；关闭跳过后完整覆盖所选项目。师门技能仅支持相同门派，无变更时不提交，写入失败整体回滚。

在线数据逻辑位于 `core/online.js`，表单、恢复提示和列表位于 `views/online.js`；`quick.js` 负责首页，`quick-timer.js` 负责计时，`quick-items.js` 负责物品目录、速记、单价与设置。每秒 tick 仅计算当前时段，历史统计在页面渲染及筛选变化时刷新，非收益首页不扫描历史。`onlineRecords` 与 `transactions` 都归属收益模块，通过内部页签切换。`D.saveSession` 同步生成每日点卡流水，`D.earningsStats` 按独立在线时长计算净时薪，活动用时不重复累计。

装备领域逻辑位于 `core/equipment.js`，在 `data.js` 之后加载。`views/equipment.js` 负责角色装备卡片与浮卡，`equipment-warehouse.js` 负责仓库，`equipment-modals.js` 负责选择、编辑和方案弹窗。装备按 ID 建索引，仓库一次构建当前角色的方案引用索引；装备页不使用全局角色筛选，方案和格子事件限定在各自卡片内，进出仓库保留列表滚动位置。三套方案只引用装备 ID，当前使用和正在查看分别保存；资产 `status` 保留旧在用值兼容历史买卖，界面穿戴状态由方案引用推导。售出、删档和部位/角色变更清理引用，撤销出售只恢复持有。命魂之玉修炼存于角色，阴阳玉魄分别为独立装备资产。装备相关保存使用 `D.commitEquipment`，写入失败整体回滚内存。

截图录入的解析和事务保存位于 `core/equipment-import.js`，队列、预览裁剪与可编辑草稿位于 `views/equipment-import.js`。最多 30 张、单张 16 MB / 1600 万像素，仅接受 PNG/JPEG/WebP/BMP。主进程再次校验图片，独立 utilityProcess 使用 sharp 放大原始彩色像素，再用 Guten OCR 的 PP-OCRv4 检测、中文识别模型和 ONNX CPU 推理读取文字。保留半透明背景与彩字，避免整图反色丢失文字；模型直接从随包 npm 资源加载，不走 CDN、不依赖语言包或显卡。识别超时 45 秒、空闲 60 秒释放，取消、关窗与刷新清理当前请求；渲染进程按请求 ID 过滤进度，关闭时退订并取消。空文字返回明确失败，不能显示已识别；图片不写入装备数据，原文保留至档案；缺失值保持空白，玉魄遵循现有校验。稀有装备名误读只在已知部位、等级和名称同时匹配时纠正，其他名称按原文填写。批量保存只补方案空位，同角色完整字段相同的档案复用，不新增财务流水。打包解包生产依赖，使 ESM、ONNX 原生库和模型从真实路径加载，并排除 Windows x64 以外的 ONNX 二进制。

## 写入、导入与交互边界

- 新 UI 写入调用领域方法或 `D.commit(change, options)`，同步变更函数在队列中读取最新状态。所有提交共用串行队列，写入失败整体恢复快照，后续操作继续执行。不要在队列外修改状态再调用 persist。
- `D.replaceState` 先校验并归一化，再事务替换；拒绝单价文件、重复 ID 和未来版本。导入、清空和示例覆盖前保存本地副本，写入失败不改变计时状态。
- 版本 5 新增成交数量和目标历史基础进度。从版本 4 升级前复制 `data.json.before-inventory-时间戳.bak`；保存仍使用完整 JSON 和原子替换。
- 下拉与日期保留触发按钮和无障碍名称；Esc 优先关闭浮层。弹窗统一关闭回调、焦点限制和返回。自定义表单调用 `UI.watchForm`，未保存确认居中覆盖原弹窗，下层内容临时 inert；原 dialog 切换为带明确标题和说明的 alertdialog，焦点限制在确认操作内。继续编辑或 Esc 恢复原语义、交互与焦点，保存中阻止关闭。
- CSV 复用 `Views.filteredRecords`，导出全部匹配记录，不受 50 条分页限制，带 BOM、单位与公式防护。
- `scripts/test.cjs` 自动发现 `.test.cjs` 和 `.electron.cjs`，共享加载器/隔离窗口在 `tests/helpers`；CI 使用 Windows / Node 22 执行语法、领域和真实窗口测试。

## 如何新增一个页面

1. `src/renderer/js/views/xxx.js`：实现 `Views.xxx = function () {...}`；
2. `index.html` 在 `layout/app.js` 之前加 `<script>`；
3. `layout/app.js` 的 `Views._pages` 注册 `{ id, t, icon, sub }`（图标用 `UI.icon` 已有条目或先在 `core/ui.js` 补）；
   模块内二级页面增加 `parent`，父模块通过 `records` 指向记录列表，无需新增侧栏菜单。
4. 样式：按 `STYLE_GUIDE.md` 写入 `styles.css` 对应分区（新页面在文件尾部新增一节）；
5. 验证：`npm run check`、`npm test`、`npm run test:electron`。UI 截图使用隔离测试窗口，避免覆盖日常数据。

## 如何新增快速记录物品

在 `views/quick-items.js` 的 `QUICK_ITEMS` / `QUICK_UNSET` 数组加一行（图标放 `assets/images/online-record/`），无需其他改动。

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

- 应用启动命令共用 `scripts/electron.cjs`，将 Electron 的 stdout/stderr 按 UTF-8 解码后交给 Node 输出，避免 Windows GBK 控制台显示中文乱码；保留启动参数、退出码与 Ctrl+C 终止行为，不修改系统代码页。Electron 使用 `windowsHide: false`，避免 Windows 将应用主窗口一起隐藏。
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
