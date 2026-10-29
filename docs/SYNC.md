# V1 初始快照记录

## 初始基线

- 日期：2026-10-26（Asia/Shanghai）。
- Git HEAD、精确采集时刻、未提交状态和每个文件哈希：见 `migration/baseline.json`。
- 采集了 89 个文本文件，包含当时的未提交装备/结构化属性/OCR 改动，数据版本为 6。
- 初始文本快照位于 `migration/initial-baseline/`，内容与 `migration/baseline.json` 均原样保留，**不可修改**——`tests/isolation.test.mjs` 会逐文件校验 SHA-256。
- 角色、养成、保存、迁移及相关领域规则从该快照转换为独立 ES 模块；基线领域用例复制到 `tests/domain/`。
- 基线之后的当前版本修改不自动进入 V2，也不因 V2 重构回写当前版本。
- 归档的对照比对已取消：原先能运行的 V1 完整工程 `migration/baseline/` 与 `npm run migration:status` 在 2026-10-29 一并移除，见下节。要查 V1 实现细节请直接读 `migration/initial-baseline/`，它保存了迁移起点时的完整文本。

## 2026-10-29 移除可运行的 V1 归档

删除了 `migration/baseline/`（180 个跟踪文件，33 MB）与 `scripts/migration-status.mjs`、`package.json` 的 `migration:status` 脚本，同时摘掉 `.github/workflows/ci.yml` 里针对它的 `legacy` job。

理由：全部页面已迁移完成，该归档只用于文本比对；而 legacy job 的 `npm run test:electron` 在 GitHub runner 上始终失败，近三次运行（`40795059789`、`40707646788`、`40698563973`）都是 `v2:success` 加 `legacy:failure`，属于纯噪音。

**保留的部分**：`migration/initial-baseline/` 与 `migration/baseline.json` 原样未动，哈希校验测试仍在跑。实测确认门禁未受影响——移走 `baseline/` 后 `npm test` 124 项全过；移走另两者会立刻 `not ok 123` 报 `ENOENT`。

Git 历史里仍可找回被删的归档（`git show <commit>:migration/baseline/<path>`），只是不再出现在最新提交。

## 2026-10-27 归档依赖与构建产物清理

迁移提交 `51ea939` 之后清理本机冗余目录，共释放约 1.28 GB：

| 已删除                             | 规模           | 性质                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------- |
| `migration/baseline/node_modules`  | 8553 文件 698M | 归档 V1 的依赖，被 `migration/baseline/.gitignore` 忽略 |
| `migration/baseline/dist`          | 81 文件 554M   | 归档 V1 的打包产物，同样被忽略                          |
| `dist/`                            | 26M            | V2 前端构建产物，被根 `.gitignore` 忽略                 |
| `.runtime/probe.cjs`、空目录 `v2/` | 2K             | 历史临时探针与迁移残留                                  |

前两项随 2026-10-29 删除归档一并消失，此表仅作历史记录。

V2 产物重建：根目录 `npm run build` 重建 `dist/renderer`；`npm start`、`npm run test:electron` 与 `npm run dist*` 都依赖它，删除后需先 build。
