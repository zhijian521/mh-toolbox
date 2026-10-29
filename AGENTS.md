# 本仓库协作约定（AI 代理必读）

本文件由 2026-10-27 的一次会话复盘产生。那次 P0 任务本身完成了，但耗时远超预期（约 100 分钟，其中约 45 分钟是可避免的环境试错与空等）。以下是已经踩过的坑和对应的固定做法，**开工前先读，不要重新发现**。

## 一、环境硬约束（不要去试，直接按此假设工作）

以下是本机实测确认过的现象。除测试子进程那条是间歇性的、需先试后降级外，其余都按固定做法处理，**不要换一种写法重试**——重试只会浪费时间。

| 现象                                           | 事实                                                                                   | 正确做法                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test` 偶发 `spawn EPERM`               | 沙箱对带管道 stdio 的子进程有间歇限制，**不是必然失败**                                | **先直接跑 `npm test`**。2026-10-27 实测 92 项全过，`node --test <单文件>` 同样可用；只有确实报 EPERM 时才改写成探针脚本，放 `%TEMP%` 不进仓库 |
| `npx prettier --write <新建文件>` 报 `EPERM`   | 子进程无法写入由 write 工具刚创建的文件                                                | 格式化改用 `--check` 定位，用 `edit` 工具按 Prettier 风格手改；或一次性申请更宽权限后统一跑一次                                                |
| `node -e "...writeFileSync"` 报 `EPERM`        | 同上，子进程写不了工作区                                                               | 用 `edit`/`write` 工具改文件，**永远不要用 node/PowerShell 脚本改仓库文件**                                                                    |
| `Rename-Item` / `Remove-Item` 报"访问被拒绝"   | 子进程无权限操作工作区文件                                                             | 不要绕过。留下说明，让用户或更宽权限会话处理                                                                                                   |
| `npm run build` 报 esbuild `spawn EPERM`       | Vite 需要子进程                                                                        | 需要真实构建时一次性申请权限，不要反复试                                                                                                       |
| `npx electron` 报 `Cannot find module`         | 环境变量 `ELECTRON_RUN_AS_NODE=1`，Electron 被当成 Node 运行                           | 先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`，再调用 `node_modules\electron\dist\electron.exe`                                                    |
| Electron 脚本 `require('electron')` 返回字符串 | 在 Electron 外部解析到的是 npm 包的路径导出                                            | 脚本必须**由 Electron 自己执行**，此时 `require('electron')` 才是内置模块                                                                      |
| Electron GUI 应用 `console.log` 无输出         | GUI 子系统不接 stdout                                                                  | 验证脚本的结果**写文件**，不要指望终端输出                                                                                                     |
| `Get-Content` 读中文源码变乱码                 | PowerShell 5.1 按 GBK 解码无 BOM 的 UTF-8                                              | **读文件一律用 `read` 工具**，搜内容用 `grep` 工具，不要用 `Get-Content`/`Select-String` 读中文文件                                            |
| `npm run test:electron` 报 GPU / renderer 崩溃 | 本机会话里 Chromium GPU 进程反复崩溃（`exit_code=-1073741819`），窗口加载 `ERR_FAILED` | 改用 `node_modules/electron/dist/electron.exe --no-sandbox --disable-gpu tests/app.electron.cjs`，用例本身是通过的                             |

> 用 PowerShell `Get-Content -Raw` + `Set-Content` 往返改源码曾经把 6 个领域模块的注释和中文全部写坏，产生 171 条假的语法错误。**禁止用于源码编辑。**

## 二、调度：子代理是并行的，不要空等

- `spawn_teammate` / `subagent` 之后**立刻去做自己那份独立工作**，不要马上 `wait_agent` 阻塞。
- `wait_agent` 一次设 8–10 分钟，超时后先 `list_agents` 看状态，**不要连续多次长超时等待**。那次会话有约 35 分钟是纯空等。
- 正确形态：派 2 个子代理审计 A/B → 自己同时读关键文件并写 C → 三方都完成后汇总。
- 需要汇总结果才能继续时，才用 `wait_agent`。

## 三、验证方式（替代跑不了的测试）

1. **领域/纯函数**：写 `%TEMP%\probe.cjs`，`require` 目标模块，断言后打印 `PASS/FAIL` 与汇总，`process.exit(fail?1:0)`。
2. **主进程纯逻辑**（如 data-store、logger）：同上，用 `fs.mkdtempSync` 造临时目录。
3. **Electron 端到端**：脚本由 `electron.exe` 执行，`app.setPath('appData', 临时目录)`，用 `executeJavaScript` 断言 DOM，**结果 `fs.appendFileSync` 写文件**。
4. 静态门禁随时可跑：`npx prettier --check .`、`npx eslint .`、`npx vue-tsc --noEmit`（这三个只读，不受上面的写限制）。
5. 收尾清理：`app.exit()` 前不要 `rmSync` 整个 profile（Windows 上 `lockfile` 会被占用报 `EBUSY`），交给系统临时目录清理。

## 四、开工前的固定动作

- V2 位于仓库根目录；先读本文件与 `docs/ARCHITECTURE.md`（约定密度最高）。V1 归档（完整工程与初始文本快照）已从工作区移除，需要查阅时从 git 历史取，起点头绪见 `docs/SYNC.md`。
- 写页面或迁移模块前读 `docs/PAGE_GUIDE.md`：以角色页为范本的固定动作清单与反模式。
- 读代码用 `read`/`grep`/`glob` 工具；**不要用 shell 的 cat/grep/find**。
- 改动前列表计划（`todo_write`），按文件独占切分并行任务，写清各自可写的文件范围。
- 汇报结论必须带 `文件:行号` 证据，不要只给判断。

## 五、已知的 V2 领域层约定（改动前必读）

- 每个 `src/renderer/domain/*.js` 首行 `// @ts-check`，固定写法：`/** @typedef {Partial<Domain> & ThisType<Domain>} XxxMixin */`、`install` 标 `@param {Domain} D`、`Object.assign(D, /** @type {XxxMixin} */ ({...}),)`。
- `Object.assign` 内每个方法都要单独写 JSDoc，否则 `TS7006` 一片。
- `.js` 里不能用 TS 断言 `x as T`，只能 `/** @type {T} */ (x)`。
- **新增领域方法必须同步补 `domain-contract.d.ts`**，否则契约漂移测试会红。
- 读取路径（`normalize`）**不允许抛错**：坏数据应无损降级并保留原文，严格校验只留交互式保存路径。这条是数据安全底线，见 `tests/domain/frozen-fidelity.test.mjs`。

## 六、游戏资料集中维护

- 梦幻西游相关的静态资料统一放在 `src/renderer/game-data/`，按主题分文件维护，例如门派列表、门派技能、辅助技能、修炼项目、装备资料和游戏数值表。
- 每类资料只维护一个来源，页面、Pinia 仓库和领域逻辑通过导入使用；不要复制名单或在组件内写死默认门派。
- 数据文件只定义资料及必要的派生常量，业务计算、校验、保存和界面交互逻辑留在各自模块。
- 共享资料视为只读模板，需要修改时先复制；不要将用户填写的数据写回静态资料文件。
- 调整资料时注明来源及核对时间，不能凭空补全游戏数据；更新对应测试，不修改不可变的迁移基线。
- 当前角色资料已经集中管理；尚未迁移模块在新增功能或调整游戏资料时，将触及的旧资料一并归拢到此目录。

详细说明见 `docs/ARCHITECTURE.md` 的「游戏资料集中维护原则」及 `src/renderer/game-data/README.md`。
