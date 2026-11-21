# 巷子日程 · 特殊版 0.2.0

本版本在 Windows 特殊版基础上加入安卓应用与私人云同步。固定主题仍然是「教学 / 教研 / 休息」，与通用版的安装、数据、同步库隔离。

## 安装与第一次使用

1. 先在原 Windows 特殊版中导出一份 JSON 备份。
2. 更新 Windows 特殊版到 0.2.0，保留原安装位置。旧版 0.1.0 不具备云同步功能。
3. 将 `XiangziSchedule-Special-0.2.0.apk` 传到安卓手机，允许此次安装来源后安装。最低 Android 8，系统 WebView 需要保持更新。
4. 按下方说明部署自己的云端服务，在电脑「云同步 → 首次使用」中填写 HTTPS 地址和建库口令，创建私人日程库。
5. 在电脑点击「显示配对码」，将完整配对码传到自己的手机，粘贴到手机「云同步」中，选择「配对并合并日程」。原有手机和电脑日程会合并。
6. 此后两端打开应用时会自动同步，也可点击「立即同步」。保存后约 1.5 秒尝试上传，打开状态下每 30 秒检查；网络不可用时本机仍可编辑。

## 同步内容与冲突

- 同步日期主题、日程名称、时间、备注、完成状态、提醒设置、重复日程及删除操作。
- 相同日程的不同字段同时修改会尽量合并。同一字段同时修改时保留带「冲突副本」的另一个版本，在云同步设置中提示核对。
- 一端删除、另一端同时修改时保留修改后的日程并提示，防止直接丢失编辑内容。
- 同一日期主题同时修改时采用刚读取到的云端主题，另一主题保留在核对提示中，可手动改回。
- 提醒是否已在某台设备弹出属于本机状态，不会使另一台设备的提醒失效。
- 同步以设备上次成功同步的共同版本为合并基础，更新使用云端版本号比较交换，避免整份数据盲目覆盖。
- 当前每个日程库最多同步 1 MB 的原始 JSON；超出时保留本机数据并提示，不会截断上传。

## 安卓提醒的范围

手机「提醒」按钮可打开通知与准时提醒授权。允许通知之后，如果系统继续限制准时提醒，请再次进入授权页面开启。拒绝准时提醒时改用系统非精确闹钟，可能延迟。

已同步到手机的日程由 Android 本地闹钟提醒；应用关闭后仍可接收这些本地提醒，重启或时区变化时会重新安排。部分手机的省电限制、强行停止、禁止通知会影响提醒，需要在系统中允许应用运行。最多预排接下来 400 个提醒，每次提醒和重新打开应用会补排后续提醒。

**本版没有安卓后台云端拉取或服务端推送。** 电脑新修改的日程，需要在手机打开应用并成功同步后，才会成为手机上的本地提醒。云同步不会唤醒被系统停止的应用。

## 私人云端部署

使用自己名下的 Cloudflare 账号部署 Worker 与 D1；不需要将自己的日程放到公开 GitHub。首次账号注册、邮箱验证、授权需要本人完成。配置时只选择自己同意的套餐；本项目没有绑定支付方式或购买服务的脚本。

```powershell
npm ci
npx wrangler login
node scripts/deploy-cloud.cjs
```

部署脚本会创建或复用名为 `xiangzi-personal-sync` 的 D1 数据库，应用建表迁移，设置随机建库口令，部署 Worker 并验证健康接口。生产配置 `cloud/wrangler.production.json` 不进入 Git。Windows 下建库口令使用当前 Windows 用户的 DPAPI 加密保存在 `~/.config/xiangzi-schedule/cloud-setup.dpapi`。不要把口令、配对码或签名私钥提交到仓库。

如果希望手动部署：创建 D1，将其 UUID 填入本地生产配置，运行迁移，设置至少 24 位的 `SETUP_TOKEN` secret，再部署。仓库内的全零 database_id 仅供本地开发，不能作为线上配置。

```powershell
npx wrangler d1 create xiangzi-personal-sync
# 将返回的 UUID 写入本地生产配置
npx wrangler d1 migrations apply DB --remote --config cloud/wrangler.production.json
npx wrangler secret put SETUP_TOKEN --config cloud/wrangler.production.json
npx wrangler deploy --config cloud/wrangler.production.json
```

Windows 上可在本机取出建库口令后仅粘贴到自己的电脑应用，不要发送到聊天或截图中：

```powershell
Add-Type -AssemblyName System.Security
$file = Join-Path $env:USERPROFILE '.config\xiangzi-schedule\cloud-setup.dpapi'
$plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json).setup | Set-Clipboard
```

建库口令只用于首次建立日程库，另一台设备用配对码连接即可。

## 密钥和数据保存

- 日程在设备上使用 AES-256-GCM 加密，日程库编号作为附加认证数据。每次上传使用新的随机 IV。
- 配对码内包含一份随机 256 位主密钥。加密密钥和接口认证令牌通过带不同标签的 HKDF-SHA256 分别派生。服务端只保存认证令牌的哈希、版本号、更新时间和日程密文，不保存解密主密钥。
- Windows 同步凭据使用 Electron safeStorage（Windows DPAPI）保存，提交日志用于恢复状态与共同版本的中断写入；原有 `plans.json` 格式不变。
- 安卓本机数据和配对凭据使用 Android Keystore 中的 AES 密钥加密并使用 AtomicFile 写入，默认关闭系统云备份／设备迁移，以免迁移不可用的 Keystore 密文。
- JSON 导出的日程备份是明文文件，不包含同步密钥；请自行保管。导入前保留本机副本。卸载手机应用会失去本机日程和密钥，应先同步／导出，并在另一台已配对设备保留配对码。
- 任何持有配对码的人都能读写该日程库。遗失所有设备和配对码后，无法通过云端解密恢复。配对码泄露时需要建立新的私人日程库，并在自己的服务中移除旧库；「断开本机配对」不会删除云端数据或撤销其他设备。

## 构建与验收

```powershell
npm test
npm run test:desktop
npm run test:mobile
npm run build:android:assets
# JDK 17、Android SDK 36、Gradle 8.13
gradle -p android assembleDebug
```

正式版使用独立签名证书。GitHub Actions 从仓库 Secrets 中读取签名材料，私钥不进入源码。当前本机的签名材料加密备份位于 `~/.config/xiangzi-schedule/android-signing.dpapi`，只能由当前 Windows 用户解密；保留该备份及其恢复条件，以便后续版本持续使用同一证书。

自动检查包含：核心数据校验、加解密与篡改检测、两个设备的真实 SQLite 服务同步、并发合并与删除、桌面界面和重启恢复、320–768 像素手机布局和编辑、安卓模拟器中的真实 WebView/Keystore/重建恢复，以及 APK 签名验证。实际手机品牌的通知、省电与跨网络连通性仍需装机后验收。
