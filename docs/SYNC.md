# V1 归档与同步记录

## 初始基线

- 日期：2026-10-26（Asia/Shanghai）。
- Git HEAD、精确采集时刻、未提交状态和每个文件哈希：见 `migration/baseline.json`。
- 采集了 89 个文本文件，包含当时的未提交装备/结构化属性/OCR 改动，数据版本为 6。
- 初始文本快照现位于 `migration/initial-baseline/`，内容与 `migration/baseline.json` 均原样保留。
- 角色、养成、保存、迁移及相关领域规则从该快照转换为独立 ES 模块；基线领域用例复制到 `tests/domain/`。
- 基线之后的当前版本修改不自动进入 V2，也不因 V2 重构回写当前版本。

## 同步操作

在仓库根目录运行 `npm run migration:status`。命令读取 `migration/baseline/` 中的归档 V1，逐项列出相对于初始 `migration/baseline.json` 的文本修改、新增和删除，只读、不覆盖、不修改基线。

处理一个差异时：记录来源文件/提交及功能意图，适配到 Vue 组件或领域模块，迁移相应回归用例，验证后在本记录追加条目。由于初始基线固定，已处理文件仍可能出现在差异输出中，须结合本记录判断是否还有后续变化。

新数据 schema 先迁移、验证后再允许导入。

## 2026-10-27 归档依赖与构建产物清理

迁移提交 `51ea939` 之后清理本机冗余目录，共释放约 1.28 GB：

| 已删除                             | 规模           | 性质                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------- |
| `migration/baseline/node_modules`  | 8553 文件 698M | 归档 V1 的依赖，被 `migration/baseline/.gitignore` 忽略 |
| `migration/baseline/dist`          | 81 文件 554M   | 归档 V1 的打包产物，同样被忽略                          |
| `dist/`                            | 26M            | V2 前端构建产物，被根 `.gitignore` 忽略                 |
| `.runtime/probe.cjs`、空目录 `v2/` | 2K             | 历史临时探针与迁移残留                                  |

全部位于忽略范围内，删除不改变任何已跟踪文件：`migration/status` 的文本比对与 `migration/baseline.json` 的初始哈希校验均不受影响，归档仍保留源码、资源、文档、测试与锁文件。

重建方式：

- 归档 V1 依赖：在 `migration/baseline/` 执行 `npm ci` 即可按归档内的 `package-lock.json` 复原（Node 22，锁文件随归档保留、本次未改动）；其构建产物由该目录的 `npm run dist` / `npm run shots` 重新生成。
- V2 产物：根目录 `npm run build` 重建 `dist/renderer`；`npm start`、`npm run test:electron` 与 `npm run dist*` 都依赖它，删除后需先 build。
