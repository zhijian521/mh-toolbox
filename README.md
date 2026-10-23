# 梦幻养老助手

梦幻西游养老记录日志桌面应用。Electron + 原生前端，宣纸账本视觉风格，内置霞鹜文楷字体，数据全部本地保存。

## 功能

- **快速记录**：在线计时、点卡消耗自动计算、59 种游戏物品掉落速记（左键记录 / 右键改价），单价可与网页版互通导入导出
- **收益记录**：收入 / 支出、现金 / 储备、活动分类、用时与时薪、筛选与汇总
- **目标**：存钱 / 装备 / 养成目标，进度注入与到期提醒
- **装备**：装备档案 + 更新时间线，购入 / 售出可同步生成收益记录
- **角色**：多角色管理与全局筛选
- **总览**：日 / 周 / 月 / 年统计、分类排行、趋势与目标进度
- **备份**：JSON 导出 / 导入 / 清空

## 开发

```bash
npm install
npm start        # 开发运行
npm run smoke    # 冒烟自检（启动 1.2s 自动退出）
npm run shots    # 注入示例数据并截图到 docs/screenshots
npm run dist     # 打包安装版 + 便携版（输出 dist/）
```

## 文档

| 文档 | 说明 |
|---|---|
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | 界面风格规范（色板 / 字体 / 组件 / 反模式） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构、目录、IPC API、数据模型、扩展指南 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 更新日志 |
| docs/screenshots/ | 界面预览（`npm run shots` 生成） |

## 数据与许可

- 用户数据保存在本机 `%APPDATA%/梦幻养老助手/data.json`，不上传任何服务器。
- 内置字体：[霞鹜文楷屏幕版 LXGW WenKai Screen](https://github.com/lxgw/LxgwWenKai-Screen)（OFL 1.1），许可文本见 `src/renderer/assets/fonts/OFL.txt`。
