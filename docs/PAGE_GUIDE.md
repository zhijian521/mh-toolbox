# 新增页面与模块指南

八个页面（总览、收益、账号、目标、装备、角色、物价、设置）都已接完，本指南是**新增页面或改造现有页面**时的固定动作清单：角色页与装备页是两个完整范本，动手前先读它们的文件，不要另起一套写法。

| 职责                       | 范本文件                                                                     |
| -------------------------- | ---------------------------------------------------------------------------- |
| 页面骨架、列表、删除确认   | `features/characters/CharactersPage.vue`                                     |
| 单条记录展示与操作入口     | `features/characters/CharacterCard.vue`                                      |
| 完整草稿表单               | `features/characters/CharacterEditor.vue`                                    |
| 单项快捷编辑               | `features/characters/QuickEditor.vue`                                        |
| 记录列表（筛选、分页）     | `features/characters/CharacterHistory.vue`                                   |
| 子表单与拖动排序           | `features/characters/SkillEditor.vue`                                        |
| 页面 + 子组件 + 组合式函数 | `features/income/`（`IncomePage.vue` ＋ 四块面板 ＋ `use-live-sessions.ts`） |

## 1. 领域层先就位

- 规则已经在 `src/renderer/domain/` 里，页面只调用，不重算。可用方法见 `domain-contract.d.ts`。
- 新增或改签名必须同步 `domain-contract.d.ts`，否则 `tests/domain/domain-contract.test.mjs` 会红。
- 读取路径（`normalize`）不允许抛错；严格校验只留在交互式保存路径。
- 游戏数值放 `src/renderer/game-data/`，页面里不写死门派、技能、部位等资料。

## 2. 接入路由与菜单

- `app/navigation.ts`：在 `sections` 里加一项（`title` / `icon` / `path`）。
- `app/main.ts`：在 `routes` 里补一条显式路由，否则菜单点了没有组件可渲染。

> 早期用 `pending: true` 把未完成的页面映射到占位页，全部页面迁移完成后这套机制已删除（2026-10-28）。

## 3. 页面骨架

- 顶部用 `PageHeader`：`title`、`description`，操作按钮放 `#actions` 插槽。
- 主体容器用 `.page-content`；无数据时用 `.empty` 加 `AppIcon`，不要只留一片空白。
- 列表 `v-for` 的 `:key` 用实体 `id`，不要用下标。
- 不要再给页面套一层 `try/catch` 或 `errorCaptured`：工作区外层的 `ErrorBoundary` 已经把渲染异常换成替代界面（见 `UI_GUIDE.md`），页面内叠加兜底反而吞掉统一的恢复入口。
- **页面超过 600 行就按块拆**，不要靠注释分区硬撑：一块界面一个子组件（props 只传状态，读取领域走自己的 `useApplication()`），一套共享时钟或派生状态抽成 `use-xxx.ts`。范本是收益页（原来 1450 行，拆完 552 行）。拆的时候样式跟着块走——`<style scoped>` 不会穿透子组件内部，`.card` 这类基座各自留一份。

## 4. 状态读写

- 只经 `useApplication()`：读 `app.data` / `app.characters`，写 `app.execute((domain) => domain.xxx())`。
- 不允许直接改 `app.data`——它是已完成操作的普通快照，改了不会落盘也不回滚。
- 保存失败会整份回滚并抛错：组件把 `message` 显示在表单里，**不要清空草稿**，让用户能重试。

## 5. 弹窗与表单

- `BaseModal` 宽度三档：默认 470、`medium` 760（完整档案）、`wide` 880（记录列表）。
- 传 `dirty` 才会在关闭时弹未保存确认；`busy` 期间禁止关闭，两者都由弹窗负责，页面不要自己再写一套。
- 表单用 `<fieldset :disabled="app.busy">` 整体锁定，不要逐个按钮禁用。
- 草稿用 `reactive` 深拷贝 + `JSON.stringify(draft) !== initial` 判脏，保存时 `plain()` 去代理再交给领域。
- 编辑已有记录且该模块有历史时，提供变更日期与本次说明。

## 6. 输入控件

- 数字一律 `BaseNumber`：留空表示未记录，`0` 是明确零值。不要再用 `Number()` 自行转换。
- 弹窗里只调一个数、需要大号输入时用 `NumberStepper`（快捷编辑、速记单价）：空值语义与 `BaseNumber` 相同，两侧按钮的步进量由 `step` 给，小数用 `decimal`。
- 下拉用 `BaseSelect`、日期用 `BaseDate`（`min`/`max` 控制范围），编辑态与输入框共用焦点外观。
- `BaseSelect` / `BaseDate` 的 `label` 仅供读屏；外层 `<label>` 的可见文字不要和它重复写两遍。
- 普通按钮 `.btn`，主操作 `.btn.primary`，纯图标按钮 `.icon-button` 且必须有 `aria-label`。

## 7. 样式

组件契约与焦点规则的完整说明在 `docs/UI_GUIDE.md`；这里只列动手时最容易漏的几条。

- 基座类只能来自 `assets/styles.css`：`.btn`、`.icon-button`、`.text-button`、`.actions`、`.hint`、`.error`、`.empty`、`.page-content`、`.form-grid`、`.footer-hint`、`.popover`、`.danger`、`.positive`、`.drag-handle` 及拖动契约类。
- 专有样式写进该组件的 `<style scoped>`；只有出现在两个以上组件、或属于元素级默认外观时才提到基座。
- `:deep()` 只用于命中子组件内部节点，且要写明理由；其余选择器不得依赖它。
- 颜色与尺寸从 `:root` 变量取值，新增字面值前先确认没有对应变量。

## 8. 测试与门禁

- 领域规则补 `tests/domain/*.test.cjs`，`npm test` 直接跑。
- 交互流程补 `tests/*.electron.cjs`，由 `scripts/test-electron.mjs` 逐个执行，运行前必须先 `npm run build`。
- 提交前跑 `npm run check && npm run build && npm run test:electron`；只改文档时至少跑 `npx prettier --check .`。

## 9. 文档同步

- `docs/VALIDATION.md`：追加一节，写日期、范围与检查结果表格；若本次对照过 V1 实现，把来源 commit 与适配结论写在同一节里。
- `docs/ARCHITECTURE.md`：目录职责或分层发生变化时才改，不要往里堆页面细节。

## 10. 反模式

- 在组件里重写领域规则。例如删除确认的记录数量要调 `characterRemovalSummary`，不要自己遍历 `state` 数一遍。
- 用 `v-html` 或拼 HTML 字符串渲染业务内容。
- 在组件里直接修改 `app.data` 或领域 `state`。
- 在页面写死游戏资料，或复制一份门派、技能名单。
- 让 `normalize` 抛错，把坏数据变成打不开的档。
- 为一个组件的专有外观去改基座样式表。

## 提交

前缀限定 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`，可带 scope（如 `refactor(角色): ...`）。一行标题写清做了什么，正文只说为什么与影响面。提交前可跑 `npm run lint:commits` 自查，CI 会校验本次带来的全部提交。
