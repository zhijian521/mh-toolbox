# V2 架构与边界

## 目录与职责

```text
src/main/                   Electron 窗口、独立 profile、文件保存、对话框和 IPC，以及装备截图识别的子进程调度
src/preload/                只暴露 mhV2 白名单接口
src/renderer/app/           Vue 入口、Hash 路由、桌面布局、类型
src/renderer/components/    弹窗、图标、数字单位、变更类型、页面错误边界，可聚焦判定 focus.ts，以及 popover / drag-sort / section-nav 组合式函数
src/renderer/features/      按业务模块划分的页面：总览、收益、账号、目标、装备、角色、物价、设置，以及待迁移占位页与页内组件
src/renderer/game-data/     按主题独立维护的梦幻游戏资料，供页面和领域规则引用
src/renderer/domain/        从基线迁入的领域规则，ES 模块工厂
src/renderer/stores/        Pinia 应用状态、完成或回滚后的界面快照
src/renderer/services/      桌面接口及普通数据转换
src/renderer/assets/        独立字体、许可和样式；只保留设计基座
migration/baseline/         原 V1 完整工程，作为迁移参考
migration/initial-baseline/ 不可变初始文本快照
migration/baseline.json     初始快照的采集信息与文件哈希
tests/domain/               从基线复制的领域回归用例
tests/fixtures/             集成流程要读的二进制素材（如装备截图），只留最小必要样本
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

文件保存使用临时文件加 rename；导入、清空、schema 变化前复制旧文件。磁盘已有版本高于保存数据时拒绝降级覆盖。第一阶段数据版本为 7（新增独立集合 `prices`），独立于应用 `0.2.0-alpha.1` 的版本号。

## 错误处理分层

三层，从内到外，职责不重叠：

- **页面级**：`components/ErrorBoundary.vue` 捕获工作区子树在初始化、渲染、事件回调与生命周期里的异常，先上报、再终止冒泡，并把失败页面换成替代界面。它返回 `false` 后全局处理器收不到同一个错误，所以上报写在边界里（`app/error-reporting.ts`）。
- **应用级**：`app/main.ts` 的 `app.config.errorHandler` 与 `unhandledrejection` 覆盖边界之外的部分——应用外壳、侧栏，以及没有被边界接住的异步拒绝，只写日志、不改界面。
- **进程级**：渲染进程经 `window.mhV2.logError` 把文本交给主进程，追加到 `%APPDATA%/mh-tool-v2/logs/main.log`（单文件 1 MB 滚动，保留 3 份）。设置页与启动失败急救面板都能打开该目录。

领域层抛错不走这条链：它由页面接住并显示在表单里，属于正常业务失败，不是渲染缺陷（见 `PAGE_GUIDE.md` 第 4 节）。

## 桌面入口与构建

- main/preload 保持 CJS，直接由 Electron 加载；Vite 只构建 renderer。
- 开发从固定本机地址 `http://127.0.0.1:5174` 加载；生产加载 `dist/renderer/index.html`。构建使用相对资源地址，路由使用 hash。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。IPC 校验调用者为当前主窗口的主 frame。
- V2 主工程位于仓库根目录，脚本仅监听自身源码。所有输出均位于根目录的 `dist/` 和 `release/`。
- 打包使用本工程已安装的 Electron 分发目录，避免打包时重复下载另一份运行时。
- `.github/workflows/ci.yml` 中的 V2 job 在根目录依次执行 `npm ci`、`npm run check`、`npm run build`、`npm run test:electron`；V1 的 legacy job 在 `migration/baseline/` 执行原有检查。

## 本地 OCR 的边界

装备截图识别把「图片 → 文本」锁在主进程侧，渲染层不认识 OCR：

- 渲染层只发 dataURL（`mhV2.recognizeEquipment`），主进程用 `nativeImage` 解码并校验格式/体积/像素后交给子进程，图片不落盘；识别结果只回一段文本。
- 推理跑在 `utilityProcess` 里（`src/main/equipment-ocr-worker.cjs`），一次一张、单张 45 秒超时、空闲 60 秒退出。ONNX 会长时间占满 CPU，放主进程会卡住消息循环与保存；原生库崩溃时也只死子进程。
- 子进程只认「图片 → 文本」，部位、词条、玉魄一律由渲染层的 `parseEquipmentText` 解析——与粘贴导入是同一条链路，所以两处规则不会漂移。
- 三个依赖（`@gutenye/ocr-node`、`onnxruntime-node`、`sharp`）与模型文件走 `asarUnpack`，子进程按 `require.resolve` 取真实路径再动态 `import`。
- `.workbuddy/` 是本地工作数据（探针脚本、截图、记忆），不参与格式化与静态检查。

## 界面与样式

视觉基座、焦点规则、组件契约（`BaseModal`、`BaseSelect`、`BaseDate`、`BaseNumber`、`useDragSort`、`useSectionNav`、`ErrorBoundary`）、页面布局与样式分层，全部见 [界面与样式规范](UI_GUIDE.md)。本文只负责分层、状态、构建与静态检查。

## 静态检查

`npm run check` 依次执行 `format:check`、`lint`、`typecheck` 与领域测试，缺一不可：

- 格式交给 Prettier，风格规则一律不进 ESLint，避免两套格式化互相改写。
- `eslint.config.js` 按运行环境分组：渲染层用浏览器全局，`src/main`、`src/preload` 与 `electron-builder.config.cjs` 是 CJS 加 Node 全局，`scripts`、`tests` 是 Node 且允许 `console`。`tests/*.electron.cjs` 额外补上浏览器全局，因为断言体通过 `executeJavaScript` 在渲染进程求值。
- Vue 只启用 `flat/essential`；`flat/recommended` 里的缩进、属性换行等规则与 Prettier 冲突，不启用。
- `migration/**` 整目录忽略：V1 工程与不可变初始快照均不参与 V2 的静态检查或格式化，初始快照由哈希测试单独校验。
- 领域安装函数签名统一是 `install(D, U, gateway, localStorage)`，多数模块只用到其中一两个参数，未用形参加 `_` 前缀，由 `argsIgnorePattern` 放行；不要为了消警告删掉形参，位置一旦错位就会到运行时才暴露。

## 类型检查

`tsconfig.json` 的 `checkJs` 仍为 `false`，领域层的 `.js` 逐个纳管：要纳管的文件在首行写 `// @ts-check`，用 JSDoc 标注参数与返回值即可，`vue-tsc --noEmit` 会按注释逐文件校验。目前 16 个模块**已全部纳管**：`characters`、`create-domain`、`data`、`equipment`、`equipment-fields`、`equipment-import`、`export`、`goals`、`growth`、`ledger`、`migration`、`online`、`schools`、`statistics`、`storage`、`util`。

渲染层另有一份窄化的类型定义 `src/renderer/app/types.ts`：`Domain` 接口只声明界面实际调用的方法，`AppData` 的集合用 `RecordEntry` 而不是 `any[]`，因此页面里拼错成员名会直接报错。完整领域成员仍以契约文件为准，两者分工见下节。

### 领域契约 `domain-contract.d.ts`

13 个模块用 `Object.assign(D, {...})` 把约 140 个成员平铺到同一个对象上，模块之间靠 `this.*` 互调，因此单独给某个模块开 `@ts-check` 会立刻报一片 `Property 'xxx' does not exist on type` 与参数隐式 `any`。解决办法是先有一份契约：`src/renderer/domain/domain-contract.d.ts` 用真正的 `interface Domain`、`interface DomainState` 声明全部成员，各模块的 JSDoc 直接写 `@type {Domain}`、`@param {Domain} D`。

- 这个文件必须是**不含 `import`/`export` 的全局声明文件**，否则不是全局作用域。反过来，在 `.d.ts` 里写 JSDoc `@typedef` 当作类型声明是不生效的（`TS2304: Cannot find name 'Domain'`），必须是 `interface`。
- 每个纳管模块的固定写法：`/** @typedef {Partial<Domain> & ThisType<Domain>} XxxMixin */`，`install` 标 `@param {Domain} D`，`Object.assign(D, /** @type {XxxMixin} */ ({ ... }),)`。
- `Object.assign` 的实参是普通对象字面量，拿不到上下文类型，**每个方法的参数都要单独写 JSDoc**，否则一片 `TS7006`。
- JS 文件里不能用 TS 断言 `x as T`（`TS8016`），只能用 `/** @type {T} */ (x)`。默认参数表达式里的 `this` 也拿不到 `@this` 标注（`TS2683`），默认值要挪进函数体。
- 契约只写形状，不追求完整类型：方法参数多为 `any`，先让成员名与关键返回类型受检，再逐块收紧。`Domain` 里 `any` 的提示在 `eslint.config.js` 中对 `domain/*.d.ts` 关掉了，因为这是全领域层唯一的兜底集中地。
- 契约与实现的一致性由 `tests/domain/domain-contract.test.mjs` 守卫：它从 `.d.ts` 解析出成员名，与 `Object.keys(createDomain())`、`Object.keys(createDomain().state)` 双向比对，漏声明或残留已删成员都会让测试失败。**新增领域方法时必须同步补契约**，否则要么测试红，要么纳管模块报「属性不存在」。

纳管顺序的教训：先有契约再开 `@ts-check`，一次只推一个模块。平铺的 `Object.assign` 混入模型会让 `this` 上的方法互相引用无法推断，多个未纳管模块一起开会产出大量与真实缺陷无关的报错，掩盖真正的问题。

`lib` 已提到 `ES2023`，因为装备词条解析用了 `Array.prototype.findLastIndex`。`target` 同步改为 `ES2023`，与 Electron 38 内置的 Chromium 140 一致。

#### 用 PowerShell 批量改动的陷阱

纳管过程中曾用 `Get-Content -Raw` + `Set-Content` 往返给四个模块批量插入 `// @ts-check`，结果 `vue-tsc` 报出 171 项 `TS1005`/`TS1002`/`TS1128` 等**语法**错误。原因是 PowerShell 5.1 的 `Get-Content` 对无 BOM 的 UTF-8 中文按 GBK 解码，写回时把注释与中文字面量全部损坏。批量改动领域 `.js` 请用编辑工具或 `node` 脚本，不要走 PowerShell 文本往返；一旦写坏用 `git checkout -- <file>` 还原，不要试图修补乱码。
