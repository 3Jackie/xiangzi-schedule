# 0.1.0 本机验证记录

验证日期：2026-11-20。环境：Windows，OS build 10.0.26200，Node.js 24.18.0，Electron 44.11.5，electron-builder 26.18.1。

## 已通过

- `npm test`：15 项核心测试，包括分类校验、重复日期、闰日与跨年、跨午夜提醒、备份编号校验及中英文文案。
- `npm run test:desktop`：教学版 23 项、通用版 40 项界面检查。覆盖日程创建与编辑、完成状态、跨月搜索、周视图、分类增删改、取消删除、备份恢复和语言切换。
- 两版分别完整退出并重新启动，验证日程和各自的分类从磁盘恢复；通用版还验证了英文设置在重启后保留。
- 桌面测试使用临时目录，没有读写用户实际日程。
- JavaScript 文件的语法检查通过；`npm audit` 返回 0 个已报告漏洞。
- 两版 Windows x64 NSIS 安装包构建成功。
- 检查两版 `app.asar`：入口分别为 `src/main-special.cjs` 和 `src/main-general.cjs`；全部应用源码和图标与本次源码一致；仅包含应用文件、许可证和说明，没有打入日程、备份或凭据文件。
- 两版可执行文件的产品名称均为「巷子日程」，版本均为 0.1.0.0。

## 本次构建位置

旧预览窗口仍在运行，因此本次使用独立输出目录。默认构建命令的输出目录仍是 `dist/special` 和 `dist/general`。

```powershell
npm run build:installer -- --output dist/verified/special
npm run build:installer:general -- --output dist/verified/general
```

| 版本 | 本次安装包 |
| --- | --- |
| 教学版 | `dist/verified/special/巷子日程-教学版-0.1.0-Setup.exe` |
| 通用版 | `dist/verified/general/巷子日程-通用版-0.1.0-Setup.exe` |

发布时把两个安装包和 `dist/verified/SHA256SUMS.txt` 放到同一个 GitHub Release。校验文件以最后一次构建的产物为准，名称对应发布附件的文件名。

## 发布前仍需人工验收

- 实际安装、同机并装、卸载和升级；检查快捷方式、默认安装目录和数据保留。
- Windows 通知实际显示、点击通知、托盘退出和睡眠恢复后的行为。本次自动测试验证了提醒时间计算，没有等待并验收真实系统通知。
- 当前安装包尚未配置代码签名。

README 只介绍通用版，附带通用版中文月历、周历、分类管理和英文界面的实际截图；所有截图使用隔离目录中的虚构数据。
