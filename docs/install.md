# CipherRoute 三端安装

扩展包三端通用；只有自定义 TLS 需要额外安装本地内核。普通代理无需内核。固定扩展 ID 为 `kejpkbdliekmgpagfceglikahmchoabg`。

| 平台 | CI 产物 | 安装命令 |
| --- | --- | --- |
| Windows x64 | cipher-route-windows-x64.zip | 双击 `Install.cmd` |
| macOS Apple Silicon | cipher-route-macos-arm64.tar.gz | `sh install.sh` |
| macOS Intel | cipher-route-macos-x64.tar.gz | `sh install.sh` |
| Linux x64 | cipher-route-linux-x64.tar.gz | `sh install.sh` |

先解压，在包目录中运行命令。默认同时注册 Chrome 和 Edge；macOS 也可双击 Install.command。高级用户可指定单个浏览器；Unix 另支持 chromium。不要使用 sudo 或管理员运行。包内包含 Rust host、Go httpcloak helper、能力文件及安装脚本，不要求用户安装 Node、Rust、Go、Python。Linux 包不是 GUI 应用，无 GTK/FUSE 依赖；Ubuntu 22.04 是构建基线，不保证任意旧发行版。Linux ARM64 暂未提供。

## 安装步骤

1. 在 Chrome/Edge 扩展页开启开发者模式，加载包含 manifest.json 的扩展目录。
2. 解压对应系统和 CPU 的内核包，运行上表安装命令。固定 ID 已内置，不需手动填写。
3. 在 TLS 配置点击“检测本地内核”和“查看 CA 信息”。核对 SHA256 后，手动将专用根证书导入浏览器实际使用的信任库。程序不会自动安装 CA 或关闭验证；包内不含共享私钥，每台机器独立生成。macOS/Linux 不自动检测信任状态。
4. 模式选择 Chrome/Firefox 预设，HTTP/TLS 协议保持 Auto。Hex、强制协议覆盖、WebSocket 尚不支持。

## 用户目录和权限

- Windows：`%LOCALAPPDATA%\CipherRoute`，浏览器注册写入 HKCU。
- macOS：`~/Library/Application Support/CipherRoute`；注册写入 Chrome、Microsoft Edge 或 Chromium 各自的 NativeMessagingHosts。
- Linux：`~/.local/share/cipher-route`；注册写入 `${XDG_CONFIG_HOME:-~/.config}` 下 google-chrome、microsoft-edge 或 chromium 的 NativeMessagingHosts。

Unix 安装使用新版本目录，避免覆盖仍运行的二进制；旧目录保留，重载扩展后使用新版本。仅允许固定 ID，不使用通配授权，不改变系统代理。Snap/Flatpak 沙箱浏览器未适配。未签名/未公证的 macOS 包可能被 Gatekeeper 阻止；没有 Apple 签名凭据，不承诺免提示安装，也不移除安全标记。

原无固定 ID 的扩展配置不会跨 ID 自动迁移，请先保留原配置。异常退出可能遗留临时捕获数据库和失效代理设置；切换直连或重新启用模式可恢复连接。

## 构建与验证状态

Native packages 工作流提供四平台构建，固定 HTTP Capture commit，执行 JS/Rust/helper 测试，打包依赖许可及 SHA256。当前仅上传 Actions artifacts，不自动发布 Release。可以手动触发；原生安装相关 PR 也会构建。

目前本机已验证 Windows 的测试与构建，以及 macOS/Linux 路径生成逻辑；macOS/Linux 的二进制和实机浏览器验收仍须在对应 runner/机器上执行。不要把构建目标当作已发布安装包。

官方路径参考：
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- https://learn.microsoft.com/microsoft-edge/extensions/developer-guide/native-messaging

## 安装网页

`site/` 是无构建依赖的 GitHub Pages 页面。部署时将 site 目录作为 Pages 静态产物上传。当前未部署，扩展安装按钮的目标为 https://godstealer.github.io/cipher-route/ 。页面仅链接 GitHub Releases 中实际存在的资产，没有包时明确显示尚未发布。基础包不含内核；完整包包含 extension 子目录。浏览器仅下载，不能自动执行本机安装程序或授予 CA 信任。
