# V1 归档记录

## 现状

工作区里**不再有 `migration/` 目录**。2026-10-29 起，V1 的完整工程与初始文本快照都只存在于 Git 历史中：

```bash
# 看有哪些文件
git ls-tree -r --name-only e51908c:migration/initial-baseline

# 取任意一个文件
git show e51908c:migration/initial-baseline/src/renderer/js/core/data.js
```

`e51908c` 是删除前的最后一次提交，它完整保留了 `migration/` 的全貌。

## 迁移起点

- 采集时间：2026-10-26T05:46:13Z（Asia/Shanghai 13:46）。
- 采集时的 Git HEAD：`99c6b8661e903b376f2a7d3b7e499d979184d5e2`，另有 14 处未提交改动与 18 个未跟踪文件一并纳入。
- 规模：89 个文本文件，数据 schema 为 6。
- 角色、养成、保存、迁移及相关领域规则从该快照转换为独立 ES 模块；基线领域用例复制到 `tests/domain/`。
- 基线之后的 V1 改动不自动进入 V2，V2 的重构也不回写 V1。

## 移除过程

| 日期       | 提交      | 内容                                                                                                                                                                                                                      |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-29 | `e51908c` | 删除可运行的 V1 完整工程 `migration/baseline/`（180 文件 33 MB）、`scripts/migration-status.mjs` 与 `migration:status` 脚本；摘掉 CI 的 `legacy` job（它的 `test:electron` 在 runner 上从未通过）                         |
| 2026-10-29 | 本次提交  | 删除剩余的 `migration/initial-baseline/` 与 `migration/baseline.json`（90 文件 1.2 MB）；`tests/isolation.test.mjs` 去掉逐文件 SHA-256 校验，保留「源码不得引用 `window.D/UI/Views/U`、不得跨三层以上相对路径」的隔离断言 |

判断依据是先测后删：移走 `baseline/` 时 `npm test` 124 项全过；移走 `initial-baseline/` 或 `baseline.json` 会立刻 `not ok 123` 报 `ENOENT`（`tests/isolation.test.mjs` 曾直接读它们）。所以删除必须与测试改写同批进行，否则门禁必红。

## 早期清理记录

迁移提交 `51ea939` 之后清理过本机冗余目录，共释放约 1.28 GB，其中前两项随归档删除一并消失：

| 已删除                             | 规模           | 性质                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------- |
| `migration/baseline/node_modules`  | 8553 文件 698M | 归档 V1 的依赖，被 `migration/baseline/.gitignore` 忽略 |
| `migration/baseline/dist`          | 81 文件 554M   | 归档 V1 的打包产物，同样被忽略                          |
| `dist/`                            | 26M            | V2 前端构建产物，被根 `.gitignore` 忽略                 |
| `.runtime/probe.cjs`、空目录 `v2/` | 2K             | 历史临时探针与迁移残留                                  |

V2 产物重建：根目录 `npm run build` 重建 `dist/renderer`；`npm start`、`npm run test:electron` 与 `npm run dist*` 都依赖它，删除后需先 build。
