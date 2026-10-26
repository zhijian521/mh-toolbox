# 当前版本与 V2 同步记录

## 初始基线

- 日期：2026-10-26（Asia/Shanghai）。
- Git HEAD、精确采集时刻、未提交状态和每个文件哈希：见 `migration/baseline.json`。
- 采集了 89 个文本文件，包含当时的未提交装备/结构化属性/OCR 改动，数据版本为 6。
- 角色、养成、保存、迁移及相关领域规则从该快照转换为独立 ES 模块；基线领域用例复制到 `tests/domain/`。
- 基线之后的当前版本修改不自动进入 V2，也不因 V2 重构回写当前版本。

## 同步操作

在 `v2/` 中运行 `npm run migration:status`。命令逐项列出相对于初始基线的文本修改、新增和删除，只读、不覆盖、不修改基线。

处理一个差异时：记录来源文件/提交及功能意图，适配到 Vue 组件或领域模块，迁移相应回归用例，验证后在本记录追加条目。由于初始基线固定，已处理文件仍可能出现在差异输出中，须结合本记录判断是否还有后续变化。

新数据 schema 先迁移、验证后再允许导入。完整重构验收前再对当前版本做一次全模块对齐。

## 第一阶段期间检测到的待同步变化

以下为开发期间的一次检查结果，最新结果以命令输出为准。当前版本仍在修改，尚未把这些新变化合入 V2：

- 装备规则、导入与界面：`equipment-fields.js`、`equipment-import.js`、`ui-equipment.js`、`views/equipment-import.js`、`views/equipment.js`。
- 当前版本开发热更新：`layout/dev.js`。
- 装备回归：`equipment-fields.electron.cjs`、`equipment-fields.test.cjs`。
- 文档：README、ARCHITECTURE、CHANGELOG、LEDGERS、STYLE_GUIDE、新增 EQUIPMENT_FIELDS。

本批次共 14 项，留待装备与通用组件阶段审核。根目录开发流程可继续进行。
