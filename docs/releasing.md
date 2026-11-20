# 发布到 GitHub

准备发布时，先检查：

1. 确认仓库名、简介、作者署名和许可证信息。
2. 运行 `npm run generate:icon` 生成应用图标。阅读并更新 `CHANGELOG.md`，提升 `package.json` 与 `package-lock.json` 中的版本号。
3. 运行 `npm ci`、`npm test`、`npm run test:desktop` 和 `npm audit`；审查依赖安全告警，不要为了清零告警而未经验证地强制降级打包工具。
4. 在 Windows 10/11 上分别构建并实际安装测试：`npm run build:installer` 和 `npm run build:installer:general`。
5. 检查安装、卸载、升级、托盘退出、提醒、备份恢复和本机数据保留情况。
6. 对安装包计算 SHA-256，并和安装包一起发布到 GitHub Releases。
7. 分开检查两版安装包的应用标识、快捷方式、文件名和用户数据目录；确认各版能并行安装运行。
8. 发布前检查提交与安装包中没有个人日程、JSON 备份、日志、密钥或签名证书。

当前安装包没有配置代码签名证书。公开分发前可再评估签名、图标和 Windows SmartScreen 提示。

GitHub Actions 会在 Windows runner 上安装锁定依赖，运行单元测试和两版隔离数据桌面测试。安装包仍需在发布前手动构建与实机验证。
