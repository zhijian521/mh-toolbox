# V1 归档记录

工作区里**不再有 `migration/` 目录**。2026-10-29 起，V1 的完整工程与初始文本快照只存在于 Git 历史中，`e51908c` 是删除前最后一次提交：

```bash
git ls-tree -r --name-only e51908c:migration/initial-baseline   # 有哪些文件
git show e51908c:migration/initial-baseline/src/renderer/js/core/data.js
```

**迁移起点：** 采集于 2026-10-26T05:46:13Z（Asia/Shanghai 13:46），当时 V1 的 HEAD 为 `99c6b8661e903b376f2a7d3b7e499d979184d5e2`，另有 14 处未提交改动与 18 个未跟踪文件一并纳入，共 89 个文本文件、数据 schema 6。角色、养成、保存、迁移的领域规则从该快照转成独立 ES 模块，基线用例复制到 `tests/domain/`。

**两条不会变的口径：** 基线之后的 V1 改动不自动进入 V2，V2 的重构也不回写 V1。哪天删了哪个目录、释放多少空间属于一次性记账，值不再复现——需要时看 `git log --diff-filter=D -- migration/` 与对应提交正文。
