# 界面与样式规范

本文承接 `ARCHITECTURE.md` 里的界面部分：视觉基座、组件契约、页面布局与样式分层。新增页面先读 `PAGE_GUIDE.md` 的流程清单，再按本文核对具体做法。

## 视觉基座

第一阶段以基线风格规范为依据，保留宣纸底、朱砂选中、赭金数值、黛青修炼和内置文楷。使用 Vue 模板渲染，不拼接业务 HTML、不使用 `v-html`。

## 焦点与键盘

输入与文本域获得焦点时为赭金描边加 1px 淡金外晕，不使用额外外框；按钮、链接与折叠标题仍用 1px 赭金虚线轮廓。下拉与日期触发器复用输入的焦点外观，不叠加虚线轮廓。

Tab 序列的判定集中在 `components/focus.ts`：`BaseModal` 的焦点循环与下拉、日历的 Tab 接力共用同一份规则，排除禁用元素、`[inert]` 子树（弹窗打开时应用外壳整体 inert）与 `tabIndex < 0` 的元素。两处各写一套会立刻出问题——`tabindex="-1"` 的 `BaseNumber` 加减箭头也会被算作可聚焦，越过弹窗边界绕回时会停在减号上。

## 组件契约

### BaseModal

负责背景 inert、键盘焦点循环、焦点返回、保存中禁止关闭，以及原弹窗中央的未保存确认。默认宽度 470px，`medium` 档 760px 用于角色新增/编辑，`wide` 档 880px 用于养成记录这类记录列表。完整编辑使用 fieldset 锁定草稿。列表以实体 ID 为 key，更新不重建整页。焦点循环的可聚焦判定来自 `focus.ts`，与弹层共用，不要在这里另写一份选择器。

### BaseSelect 与 BaseDate

`BaseSelect` 负责下拉（可选搜索、方向键与首尾跳转、外点关闭），`BaseDate` 负责日历（月切换、最小/最大日期、今天与清空、方向键与 PageUp/PageDown），两者共用 `components/popover.ts` 的定位与关闭逻辑，弹层 Teleport 到 body 并按视口翻转。关闭键与 Tab 在 window 捕获阶段拦截，早于 `BaseModal` 的 Escape 处理，避免在弹窗内按 Escape 先触发未保存确认。

Tab 的语义是「收起弹层并继续前进一格」，与原生下拉一致：焦点直接落到触发器后面的控件，Shift+Tab 落到前面，不经过触发器本身。弹层 Teleport 到 body，在文档顺序里位于整个应用之后，所以必须 `preventDefault` 自己接管——否则浏览器从正在卸载的节点出发算下一格，实际落点取决于卸载时机。越过两端时不自己绕回，焦点留在触发器上，交给 `BaseModal` 的焦点循环处理。

两者的 `label` 属性只供读屏使用，外层 `<label>` 负责可见文字，不要两处都写一遍。辅助技能建议仍使用浏览器原生 datalist，保留输入自由文本的能力。

### BaseNumber

数字输入统一用 `BaseNumber`：外观仍是 `type="number"`（保留数字键盘、`min`/`max`/`step` 与表单语义），但用 CSS 隐藏原生步进箭头，改为悬停或聚焦时在右侧浮现一对极窄的上下箭头按钮（`tabindex="-1"`，不进入 Tab 序列，`aria-label` 为「增加 / 减少 + 步长」）。组件内部保存用户输入的原始字符串，避免输入中途被数值化打断；空值时仅保留加号，值为 `min` 时减号禁用。改动数字显示格式时只动这一个组件。

`step` 是 prop 而不是写死的属性：允许小数的字段（存钱目标的金额、进度变化）必须传 `:step="0.1"`，否则输入 `250.5` 会被浏览器判成 step 不匹配，`requestSubmit` 连 `submit` 事件都不触发——表单看起来「点了没反应」，且没有任何报错。上下箭头按同一个步长走，并收一次浮点尾数。

### 拖动排序 `useDragSort`

逻辑集中在 `components/drag-sort.ts`，角色卡片与技能行共用：调用方提供当前的键顺序 `keys()` 与落位回调 `onMove()`，组合式函数只维护拖动状态、插入提示（`is-dragging`、`drop-before`、`drop-after`）与正文边缘自动滚动。落位回调同时给出按下标算好的 `from`/`to` 与相对位置 `targetKey`/`position`：按下标移动的列表（技能行）直接 `splice`，按「移动到某项前后」持久化的列表（角色、目标卡片）把 `targetKey` 与 `position` 交给领域方法。`axis` 决定插入提示的判定轴，纵向卡片用 `y`，双列技能行按从左到右的阅读顺序用 `x`；`moveBy()` 把方向键换算成相邻项的前后落位，键盘操作与拖动共用同一套落位计算。拖动入口统一是六点握把图标按钮：角色卡片在顶部操作区最左侧，技能行放在「移除」按钮右侧。

### 分区导航 `useSectionNav`

长表单的分区导航集中在 `components/section-nav.ts`：调用方只提供分区键，`register(key)` 收回 `:ref` 回调、`go(key)` 滚动到分区并把标题 `h3` 聚焦、`active` 供导航按钮标记 `aria-current`。角色档案弹窗是当前唯一使用者，后续按分区组织的编辑页直接复用。

`active` 同时跟随手动滚动：滚到哪个分区，高亮就切到哪个分区，滚到底时固定为最后一段。实现上有两个坑——`scroll` 事件不冒泡，所以监听挂在 window 的捕获阶段；元素首次 `register` 时可能还没挂进弹窗，`parentElement` 为空，因此滚动宿主按需解析而不是一次探死。`register` 对同一 key 返回同一个闭包，避免模板重渲染时反复卸载/挂载；`active` 用取值器暴露而不是直接返回 ref，否则模板拿到的是未解包的 Ref。

### 错误边界 `ErrorBoundary`

工作区外层是 `components/ErrorBoundary.vue`：页面在初始化、渲染或事件回调里抛错时，失败页面被换成替代界面（错误摘要、技术细节、`重开此页面`、`返回角色页`），侧栏与已保存数据不受影响。

- `onErrorCaptured` 返回 `false` 终止冒泡，全局 `app.config.errorHandler` 因此收不到同一个错误，**上报必须由边界自己调用** `app/error-reporting.ts` 的 `reportRendererError`。漏掉这一步就等于错误彻底没有记录。
- 失败状态按 `resetKey`（当前传 `route.path`）重置，切走再回来是重新挂载，不会卡在替代界面。
- 替代界面渲染后焦点落在面板上，键盘用户不会掉回文档开头。
- 边界只覆盖工作区；应用外壳与侧栏的异常仍由全局处理器兜底（只写日志，界面上无提示）。
- 新增页面不要自己再包一层 `try/catch` 或 `errorCaptured`：重复兜底会让错误停在页面内部，反而拿不到统一的替代界面。

## 页面布局

顶部用 `PageHeader`（`title`、`description`、`#actions` 插槽），主体容器用 `.page-content`，无数据时用 `.empty` 加 `AppIcon`。完整清单见 `PAGE_GUIDE.md`。

页面不需要自己处理「渲染失败」：工作区外层已有错误边界，未捕获的异常会被换成替代界面而不是白屏，见上面的组件契约。

## 记录列表的密度

养成记录弹窗的筛选区使用固定宽度（角色 180px、日期范围 150px、自定义日期各 165px），不随弹窗宽度拉伸。每条变更压缩为单行网格：日期、角色、组别与项目、变化前后数值、变化类型、说明图标；同一条记录只在首个变更行渲染日期，其余行留空占位以保持列对齐。备注与「复制自」来源合并为行尾图标，悬停或聚焦时以原生提示展示全文，不再单独占行。后续若新增变更字段，并入该行网格而不是再加一行。

## 样式分层

样式分两层，`src/renderer/assets/styles.css` 只放设计基座，其余跟随各自组件：

- 基座：`@font-face`、`:root` 变量、`body` 与滚动条、元素级重置与表单基线（含数字框去箭头、占位符与禁用态）、跨页复用的工具类（`.btn`、`.icon-button`、`.text-button`、`.actions`、`.hint`、`.error`、`.empty`、`.page-content`、`.form-grid`、`.footer-hint`、`.popover` 及拖动契约 `.drag-handle`/`.is-dragging`/`.drop-before`/`.drop-after`），以及共用断点里仅关乎基座的两条规则。
- 组件层：页面与组件的专有类写进该 `.vue` 的 `<style scoped>`。新增类先判断它只服务一个组件，是则直接写在组件内；只有出现在两个以上组件、或属于元素级默认外观时才提到基座。
- 跨组件命中要显式穿透：scoped 只能命中子组件根节点，所以技能行改写 `BaseNumber` 内部输入框时写 `.skill-row :deep(.number-field) > input`，快捷弹窗改写 `NumberValue` 加粗数值时写 `.quick-context-current :deep(.number-value b)`。其余选择器不得依赖 `:deep()`。
- 颜色与尺寸仍从 `:root` 变量取值；少量半透明描边与阴影沿用既有字面值，新增字面值前先确认没有对应变量。
- 弹层（`BaseSelect`、`BaseDate`）用 Teleport 挂到 body，作用域属性随组件节点保留，因此它们的样式仍写在各自组件的 scoped 块里，不需要提到基座。
