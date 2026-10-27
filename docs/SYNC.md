# 当前版本与 V2 同步记录

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

新数据 schema 先迁移、验证后再允许导入。完整重构验收前再对当前版本做一次全模块对齐。

## 第一阶段期间检测到的待同步变化

以下为开发期间的一次检查结果，最新结果以命令输出为准。当前版本仍在修改，尚未把这些新变化合入 V2：

- 装备规则、导入与界面：`equipment-fields.js`、`equipment-import.js`、`ui-equipment.js`、`views/equipment-import.js`、`views/equipment.js`。
- 当前版本开发热更新：`layout/dev.js`。
- 装备回归：`equipment-fields.electron.cjs`、`equipment-fields.test.cjs`。
- 文档：README、ARCHITECTURE、CHANGELOG、LEDGERS、STYLE_GUIDE、新增 EQUIPMENT_FIELDS。

本批次共 14 项，留待装备与通用组件阶段审核。该记录描述当时的检查结果。

## 2026-10-27 目录调整

- V2 从 `v2/` 提升到仓库根目录，后续安装、开发、检查和构建均在根目录运行。
- 原根目录的完整 V1 工程归档到 `migration/baseline/`，保留原有源码、资源、文档与测试；本机依赖与构建产物同批搬入，随后按需清理（见下节）。
- 初始文本快照移到 `migration/initial-baseline/`，初始采集信息与文件哈希保持不变；状态脚本继续对比归档 V1 与初始基线。
- CI 分别在根目录检查 V2、在 `migration/baseline/` 检查 V1。目录调整不涉及业务规则、数据 schema 或应用数据目录的变更。

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
