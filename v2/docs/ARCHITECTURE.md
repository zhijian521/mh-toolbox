# V2 架构与边界

## 目录与职责

```text
src/main/                   Electron 窗口、独立 profile、文件保存、对话框和 IPC
src/preload/                只暴露 mhV2 白名单接口
src/renderer/app/           Vue 入口、Hash 路由、桌面布局、类型
src/renderer/components/    弹窗、图标、数字单位组件
src/renderer/features/      角色与设置；后续按业务模块扩展
src/renderer/game-data/     按主题独立维护的梦幻游戏资料，供页面和领域规则引用
src/renderer/domain/        从基线迁入的领域规则，ES 模块工厂
src/renderer/stores/        Pinia 应用状态、完成或回滚后的界面快照
src/renderer/services/      桌面接口及普通数据转换
src/renderer/assets/        独立字体、许可和样式；只保留设计基座
migration/                  不可变初始基线、文件哈希和参考快照
tests/domain/               从基线复制的领域回归用例
tests/isolation.test.mjs    profile、磁盘失败、导出边界与基线完整性
tests/app.electron.cjs      Electron 真实窗口与 IPC 集成流程
scripts/test-electron.mjs   逐个运行 tests/*.electron.cjs，取代固定单文件脚本
```

## 游戏资料集中维护原则

涉及梦幻西游的静态资料统一放在 `src/renderer/game-data/`，按主题拆成独立文件，不散落在 Vue 页面、状态仓库或业务函数中，也不把所有资料堆进一个大文件。

- 门派列表维护在 `schools.js`；各门派的师门技能维护在 `school-skills.js`。
- 辅助技能、人物修炼和召唤兽修炼项目维护在 `character-progress.js`。
- 后续新增或调整装备部位、宝石、特技、游戏等级限制、消耗表等资料时，在同一目录按主题建文件，并将触及的旧资料移入对应文件，禁止再新增散落的游戏资料常量。
- 页面和领域层通过导入引用同一份资料；默认项从资料导出，不在页面重复写死。计算、校验和保存逻辑仍放在领域层。
- 资料定义视为只读；领域实例或编辑表单需要修改时先复制，避免修改全局模板、影响其他角色或实例。
- 提供清晰的字段名称和来源说明；调整资料时记录来源、核对时间和变化内容，保留未知、未记录和用户自定义值。目录整理不代表重新核实或更新游戏数值，不凭空补充资料。
- 用户填写的角色、技能等级、装备档案等运行数据继续由独立 profile 的 `data.json` 保存，不能写回此静态资料目录；不可变迁移基线也不随资料整理修改。

当前先落实角色模块的资料拆分；尚未迁移的领域模块在后续功能迁移或资料调整时按上述原则归拢。

## 状态与事务

`createDomain({ gateway, preferences })` 每次产生独立领域实例。原规则改为显式模块安装，不向 window 写入 D/U/Views/UI，不依赖脚本顺序或当前版本源码。第一阶段保留领域 JavaScript，Vue 组件、IPC 契约和应用状态使用 TypeScript；领域类型将随模块继续收紧。

领域实例持有唯一可写业务状态，位于 Vue 代理之外。Pinia 的 `data` 为已完成操作的普通快照，只供界面读取。`execute()` 调用领域方法，在成功或回滚后发布快照。组件不直接修改快照，完整编辑和快捷编辑均有独立草稿。

所有写入经领域的串行 commit 队列。事务内读取最新状态，修改后落盘，失败恢复整个内存快照。角色资料、养成历史、排序及关联删除保持现有规则。IPC 传递普通对象，避免 Vue 代理无法结构化克隆。

文件保存使用临时文件加 rename；导入、清空、schema 变化前复制旧文件。磁盘已有版本高于保存数据时拒绝降级覆盖。第一阶段数据版本为 6，独立于应用 `0.2.0-alpha.1` 的版本号。

## 桌面入口与构建

- main/preload 保持 CJS，直接由 Electron 加载；Vite 只构建 renderer。
- 开发从固定本机地址 `http://127.0.0.1:5174` 加载；生产加载 `dist/renderer/index.html`。构建使用相对资源地址，路由使用 hash。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。IPC 校验调用者为当前主窗口的主 frame。
- V2 的脚本监听仅覆盖自身目录。所有输出均位于 `v2/dist` 和 `v2/release`。
- 打包使用本工程已安装的 Electron 分发目录，避免打包时重复下载另一份运行时。
- 根目录原有 CI 不作修改；V2 在 `.github/workflows/ci.yml` 中单独一个 job（`working-directory: v2`），依次 `npm ci`、`npm run check`、`npm run build`、`npm run test:electron`。

## 界面

第一阶段以基线风格规范为依据，保留宣纸底、朱砂选中、赭金数值、黛青修炼和内置文楷。使用 Vue 模板渲染，不拼接业务 HTML、不使用 v-html。

`BaseModal` 负责背景 inert、键盘焦点循环、焦点返回、保存中禁止关闭，以及原弹窗中央的未保存确认。默认宽度 470px，`medium` 档 760px 用于角色新增/编辑，`wide` 档 880px 用于养成记录。完整编辑使用 fieldset 锁定草稿。列表以角色 ID 为 key，更新不重建整页。

输入与文本域获得焦点时为赭金描边加 1px 淡金外晕，不使用额外外框；按钮、链接与折叠标题仍用 1px 赭金虚线轮廓。下拉与日期触发器复用输入的焦点外观，不叠加虚线轮廓。

下拉与日期输入已迁移为自有组件：`BaseSelect` 负责下拉（可选搜索、方向键与首尾跳转、外点关闭），`BaseDate` 负责日历（月切换、最小/最大日期、今天与清空、方向键与 PageUp/PageDown），两者共用 `components/popover.ts` 的定位与关闭逻辑，弹层 Teleport 到 body 并按视口翻转。关闭键与 Tab 在 window 捕获阶段拦截，早于 `BaseModal` 的 Escape 处理，避免在弹窗内按 Escape 先触发未保存确认。辅助技能建议仍使用浏览器原生 datalist，保留输入自由文本的能力；分区导航滚动跟随与更多键盘细节列入后续组件工作。

数字输入统一用 `BaseNumber`：外观仍是 `type="number"`（保留数字键盘、`min`/`max`/`step` 与表单语义），但用 CSS 隐藏原生步进箭头，改为悬停或聚焦时在右侧浮现一对极窄的上下箭头按钮（`tabindex="-1"`，不进入 Tab 序列，`aria-label` 为「增加 1」「减少 1」）。组件内部保存用户输入的原始字符串，避免输入中途被数值化打断；空值时仅保留上加、减号禁用，值为 `min` 时减号禁用。改动数字显示格式时只动这一个组件。

养成记录弹窗的筛选区使用固定宽度（角色 180px、日期范围 150px、自定义日期各 165px），不随弹窗宽度拉伸。每条变更压缩为单行网格：日期、角色、组别与项目、变化前后数值、变化类型、说明图标；同一条记录只在首个变更行渲染日期，其余行留空占位以保持列对齐。备注与「复制自」来源合并为行尾图标，悬停或聚焦时以原生提示展示全文，不再单独占行。后续若新增变更字段，并入该行网格而不是再加一行。

拖动排序逻辑集中在 `components/drag-sort.ts` 的 `useDragSort()`，角色卡片与技能行共用：调用方提供当前的键顺序 `keys()` 与落位回调 `onMove()`，组合式函数只维护拖动状态、插入提示（`is-dragging`、`drop-before`、`drop-after`）与正文边缘自动滚动。落位回调同时给出按下标算好的 `from`/`to` 与相对位置 `targetKey`/`position`：按下标移动的列表（技能行）直接 `splice`，按「移动到某项前后」持久化的列表（角色、目标卡片）把 `targetKey` 与 `position` 交给领域方法。`axis` 决定插入提示的判定轴，纵向卡片用 `y`，双列技能行按从左到右的阅读顺序用 `x`；`moveBy()` 把方向键换算成相邻项的前后落位，键盘操作与拖动共用同一套落位计算。拖动入口统一是六点握把图标按钮：角色卡片在顶部操作区最左侧，技能行放在「移除」按钮右侧。

## 样式分层

样式分两层，`src/renderer/assets/styles.css` 只放设计基座，其余跟随各自组件：

- 基座：`@font-face`、`:root` 变量、`body` 与滚动条、元素级重置与表单基线（含数字框去箭头、占位符与禁用态）、跨页复用的工具类（`.btn`、`.icon-button`、`.text-button`、`.actions`、`.hint`、`.error`、`.empty`、`.page-content`、`.form-grid`、`.footer-hint`、`.popover` 及拖动契约 `.drag-handle`/`.is-dragging`/`.drop-before`/`.drop-after`），以及共用断点里仅关乎基座的两条规则。
- 组件层：页面与组件的专有类写进该 `.vue` 的 `<style scoped>`。新增类先判断它只服务一个组件，是则直接写在组件内；只有出现在两个以上组件、或属于元素级默认外观时才提到基座。
- 跨组件命中要显式穿透：scoped 只能命中子组件根节点，所以技能行改写 `BaseNumber` 内部输入框时写 `.skill-row :deep(.number-field) > input`，快捷弹窗改写 `NumberValue` 加粗数值时写 `.quick-context-current :deep(.number-value b)`。其余选择器不得依赖 `:deep()`。
- 颜色与尺寸仍从 `:root` 变量取值；少量半透明描边与阴影沿用既有字面值，新增字面值前先确认没有对应变量。
- 弹层（`BaseSelect`、`BaseDate`）用 Teleport 挂到 body，作用域属性随组件节点保留，因此它们的样式仍写在各自组件的 scoped 块里，不需要提到基座。
