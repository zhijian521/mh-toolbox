# 梦幻养老助手 V2

Electron + Vite + Vue 3 + Pinia 的桌面应用，用于梦幻西游的养成与账本记录。全部页面已从 V1 迁移完成，V1 的初始文本快照保留在 `migration/initial-baseline/`。

## 启动

```bash
npm ci
npm run dev            # 同时起 Vite 与 Electron，Vue/CSS 热更新
```

开发服务只监听 `127.0.0.1:5174`，被占用时直接报错。main/preload 改动会重启 Electron。

```bash
npm run check          # prettier + eslint + vue-tsc + 领域/隔离测试
npm run build          # 生产前端构建，输出 dist/renderer
npm start              # 需先 build
npm run test:electron  # 需先 build；真实窗口与 IPC，用系统临时数据
npm run dist:dir       # 独立 Windows 应用目录
npm run dist           # 安装版与便携版，输出到 release/
```

本机 Electron 集成测试会撞 GPU 崩溃（`exit_code=-1073741819`），用这条代替：

```bash
node_modules/electron/dist/electron.exe --no-sandbox --disable-gpu tests/app.electron.cjs
```

`dev:web` / `preview` 只用于在浏览器里看资源；本地数据能力只经 preload 提供，浏览器打开会提示走桌面入口。

## 已实现

- **总览**：日常收益与账号账本两块，各自日期范围、14 天零轴趋势、最近记录与目标进度。
- **收益/在线**：物品速记、点卡计时（多开按人头分摊）、补记、按天分账，日常产出实时同步成账号里的「游戏收益」。
- **账号**：人民币与梦幻币分账、快捷记账、全部记录弹窗。
- **装备**：三套方案、12 个格子（常规 6 + 灵饰 4 + 玉魄 2）、仓库、结构化属性编辑器、方案改名复制、粘贴文本导入、**截图识别**（本地 OCR，图片不落盘）、记变动同步账号账本。
- **角色**：完整档案、师门/辅助技能增删排序、门派模板、转门派、两类修炼、养成历史与快捷编辑。
- **目标 / 物价 / 设置**：目标进度与记录；卡片式行情与价格流水；JSON 备份导入导出、清空与路径。
- 保存串行执行并失败回滚、未保存关闭确认、弹窗焦点限制、页面级错误边界、启动失败急救面板。

## 数据与隔离

- 应用名 `mh-tool-v2`，appId `com.zhijian.mhtool.v2`。数据在 `%APPDATA%/mh-tool-v2/data.json`，Chromium 状态在 `session/`，日志在 `logs/`。
- V1 数据不会自动读取。要试旧数据就从 V1 导出备份，再在 V2 设置里导入副本。
- 普通保存保留 3 份滚动备份；导入、清空、换版另存事务备份；拒绝低版本覆盖高版本。
- 读取路径永不抛错：坏数据无损降级并保留原文，严格校验只在保存路径。
- 测试全部走系统临时目录，不碰真实数据。

## 代码格式与提交

Prettier 统一格式（4 空格、单引号、分号、尾逗号、100 列、LF）。配置在 `package.json` 的 `prettier` 字段，忽略范围在 `.prettierignore`。

```bash
npm run format        # 格式化源码、配置、脚本、测试与文档
npm run format:check  # 只检查
npm run lint:commits  # 校验提交信息前缀
```

Node 版本见 `.nvmrc`（22.22.2）。提交前缀限定 `feat`/`fix`/`docs`/`style`/`refactor`/`perf`/`test`/`build`/`ci`/`chore`/`revert`，可带 scope。

## 文档

- [架构与边界](docs/ARCHITECTURE.md)：目录职责、状态与事务、错误分层、本地 OCR 边界。
- [界面与样式规范](docs/UI_GUIDE.md)：视觉基座、焦点与键盘、组件契约、列表密度。
- [配色令牌与暗色模式](docs/THEME.md)：令牌体系、切换机制、对比度红线。
- [页面开发指南](docs/PAGE_GUIDE.md)：以角色页为范本的动作清单与反模式。
- [阶段与功能清单](docs/ROADMAP.md)：各模块迁移状态与明确不做的事。
- [验证记录](docs/VALIDATION.md)：每次改动的做法、踩过的坑与验证方式。
- [V1 同步记录](docs/SYNC.md)：归档基线的采集、比对与清理记录。

游戏资料统一放在 `src/renderer/game-data/`，按主题分文件，页面与领域层引用同一份，规则见架构文档的「游戏资料集中维护原则」。

## 归档

`migration/initial-baseline/` 是不可覆盖的初始文本快照，`migration/baseline.json` 记录初次采集的 Git HEAD、未提交状态、数据版本与文件 SHA-256（`tests/isolation.test.mjs` 会校验它）。两者都不参与构建与检查。原先那份可运行的 V1 完整工程 `migration/baseline/` 已在 2026-10-29 移除，历史仍留在 Git 里。

## 许可

本项目源码公开在 [GitHub](https://github.com/zhijian521/mh-toolbox)，采用 [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)，**不是**可以商用的开源许可。

- 可以：运行、复制、修改源码；再发布原版或改后的版本；个人学习、研究与娱乐使用；公益、教育、科研与政府机构使用。
- 不可以：打包出售、收费分发、随硬件或服务捆绑销售，以及其他任何商业用途。

再发布时请一并保留 `LICENSE` 与版权声明，并注明原仓库地址（PolyForm 的 `Required Notice` 行即在许可证开头）。早期提交曾以 MIT 发布，已从 MIT 获得副本的代码不受本次许可变更约束。
