# 梦幻养老助手

梦幻西游养老记录日志桌面应用。Electron + 原生前端，宣纸账本视觉风格，内置霞鹜文楷字体，数据全部本地保存。

## 功能

- **收益**：默认进入快速记录，支持自动计时、在线手动补记、点卡消耗计算、59 种物品掉落速记与手动记账；默认本日，可自选范围统计在线时长与净时薪；模块内管理收益明细和在线记录，支持跨天分摊、编辑联动与计时恢复
- **账号**：装备、召唤兽、点卡充值、游戏币买卖和养成投入快捷记账；默认本月，支持快捷与自定义日期范围，人民币与梦幻币分别汇总，支持最近记录编辑与完整账号记录列表
- **目标**：存钱 / 装备 / 养成目标，进度注入与到期提醒
- **装备**：装备档案 + 更新时间线，购入 / 售出可同步生成账号记录
- **角色**：多角色管理与全局筛选
- **总览**：收益默认本日、账号默认本月，各自支持日 / 周 / 月 / 年 / 全部及自定义日期范围；展示分类排行、趋势与目标进度，可进入对应快速记录页
- **备份**：JSON 导出 / 导入 / 清空

## 开发

```bash
npm install
npm run dev      # 开发模式（热更新：CSS 免刷新 / 页面自动刷新）
npm start        # 普通运行
npm run smoke    # 冒烟自检（启动 1.2s 自动退出）
npm run shots    # 注入示例数据并截图到 docs/screenshots
npm run demo      # 写入一套完整示例数据到本地（覆盖当前数据）
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
