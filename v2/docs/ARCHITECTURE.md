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
src/renderer/assets/        独立字体、许可和样式
migration/                  不可变初始基线、文件哈希和参考快照
tests/domain/               从基线复制的领域回归用例
tests/isolation.test.mjs    profile、磁盘失败、导出边界与基线完整性
tests/app.electron.cjs      Electron 真实窗口与 IPC 集成流程
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
- 根目录原有 CI 不作修改；V2 的本地检查由自己的 npm scripts 提供，后续可单独接入 CI。

## 界面

第一阶段以基线风格规范为依据，保留宣纸底、朱砂选中、赭金数值、黛青修炼和内置文楷。使用 Vue 模板渲染，不拼接业务 HTML、不使用 v-html。

`BaseModal` 负责背景 inert、键盘焦点循环、焦点返回、保存中禁止关闭，以及原弹窗中央的未保存确认。完整编辑使用 fieldset 锁定草稿。列表以角色 ID 为 key，更新不重建整页。

下拉与日期输入已迁移为自有组件：`BaseSelect` 负责下拉（可选搜索、方向键与首尾跳转、外点关闭），`BaseDate` 负责日历（月切换、最小/最大日期、今天与清空、方向键与 PageUp/PageDown），两者共用 `components/popover.ts` 的定位与关闭逻辑，弹层 Teleport 到 body 并按视口翻转。关闭键与 Tab 在 window 捕获阶段拦截，早于 `BaseModal` 的 Escape 处理，避免在弹窗内按 Escape 先触发未保存确认。辅助技能建议仍使用浏览器原生 datalist，保留输入自由文本的能力；分区导航滚动跟随与更多键盘细节列入后续组件工作。
