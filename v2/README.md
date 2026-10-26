# 梦幻养老助手 V2

独立的 Electron + Vite + Vue 3 重构工程。当前完成第一阶段：工程隔离、源码基线、角色模块和设置页。

## 启动

在本目录运行，不在仓库根目录安装或启动：

```powershell
cd E:\zhijian\mh-tool\v2
npm ci
npm run dev
```

`npm run dev` 同时启动 Vite 和 Electron；Vue/CSS 使用热更新，main/preload 变化会重启 V2。开发服务仅监听 `127.0.0.1:5174`，占用时直接报错。

```powershell
npm run check          # TypeScript + 领域/隔离测试
npm run build          # 生产前端构建
npm run test:electron  # 需先 build；真实 Electron 交互，使用系统临时数据
npm start              # 需先 build；启动生产前端
npm run dist:dir       # 独立 Windows 应用目录
npm run dist           # 安装版与便携版，输出到 release/
npm run migration:status # 只读检查当前版本相对基线的文本变化
```

`dev:web` / `preview` 仅供浏览器检查资源；本地数据能力只通过 Electron preload 提供。浏览器直接打开会明确提示使用桌面入口。

## 代码格式

使用 Prettier 统一格式：4 空格缩进（Tab 键插入 4 个空格）、单引号、分号、尾逗号、100 列换行和 LF 换行。

```powershell
npm run format        # 格式化源码、配置、脚本、测试和文档
npm run format:check  # 只检查格式
```

EditorConfig 定义 V2 的基础编辑规则，Prettier 通过上述命令统一格式，不依赖特定编辑器。迁移基线 `migration/`、依赖锁文件、依赖目录、构建产物和测试输出不参与格式化。

## 已实现

- 原有宣纸账本色板、霞鹜文楷字体、侧栏收起和窗口控制。
- 角色完整档案：基础信息、师门/辅助技能增删排序、门派模板、转门派保留/替换选择、两类修炼、其他养成、备注和变更日期说明。
- 单项快捷编辑、未记录与明确 0 的区别、养成历史、角色/日期筛选及每页 12 次变更分页。
- 角色新增、编辑、删除关联记录、拖动排序与方向键排序。
- 设置：数据统计、完整 JSON 备份导入预览、导出、清空前备份、应用数据路径。
- 保存串行执行、失败回滚、保留表单草稿、未保存关闭确认、弹窗焦点限制与返回。

总览、收益、账号、目标、装备及 OCR 页面将在后续阶段迁移。全部菜单可点击，尚未迁移的菜单标记「待迁移」并进入独立占位页。相应数据与业务规则已经保留在 domain 层，用于备份兼容及关联处理，并不表示这些页面已经完成。

## 隔离边界

- 所有源码、依赖、资源、脚本、文档、测试与输出均在 `v2/` 内；运行时不引用 `../src`。
- 应用名称 `mh-tool-v2`，Windows appId 为 `com.zhijian.mhtool.v2`，快捷方式为「梦幻养老助手 V2」。
- 数据：`%APPDATA%/mh-tool-v2/data.json`；Chromium 缓存/偏好：其 `session/` 子目录；日志：其 `logs/` 子目录。
- 当前版本的数据不会自动读取或复制。需要测试已有数据时，从当前版本导出备份，再在 V2 设置中导入副本。
- 导入、清空、数据版本迁移前备份只保存在 V2 目录。导出入口阻止写入已知的当前版本应用数据目录。
- 测试使用系统临时目录，不使用上述真实应用数据。
- 两版共享仓库的 Git 暂存区。提交本次工作时仅暂存 `v2/`，不要批量暂存外层的正在开发内容。

## 后续维护

梦幻游戏资料统一放在 `src/renderer/game-data/`，按主题分文件维护；页面和领域层引用同一份资料。门派列表、门派技能和角色修炼等资料已拆分，新增或调整资料遵循架构文档中的「游戏资料集中维护原则」。

先阅读 [架构](docs/ARCHITECTURE.md)、[阶段与功能清单](docs/ROADMAP.md)、[同步记录](docs/SYNC.md) 和 [验证记录](docs/VALIDATION.md)。

初始基线为 `migration/baseline.json`，包含采集时 Git HEAD、未提交状态、数据版本和实际文件 SHA-256。`migration/baseline/` 是不可覆盖的文本参考快照，包含当时尚未提交的装备改动，不作为运行代码。二进制资源在工程中独立保存。

当前版本继续优化时，运行 `npm run migration:status`，审核相关差异后适配到 Vue/领域层，再更新同步记录。该命令不会自动同步文件。
