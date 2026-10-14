# CipherRoute 本地 TLS 内核

## 当前能力

已接入 HTTP Capture capture-core + transport-httpcloak。浏览器流量经本地解密代理，使用 httpcloak Chrome/Firefox 预设重新连接目标，随后经模式所选上游代理转发。HTTP Capture 使用 rustls 接收下游 TLS；上游浏览器预设由 Go httpcloak helper 提供。普通模式仍直接使用浏览器代理 API，不启动 host。

当前支持 Chrome/Firefox 预设、auto/latest/指定浏览器版本，HTTP/TLS 协议必须 Auto。版本目录由 helper 的能力文件提供，UA 不会被修改；auto 遇到目录不支持的 UA 版本会报错，不自动降级。当前不支持 Hex 模板、强制 HTTP/TLS 版本、WebSocket。后续再扩展这些能力，不静默绕过预设。

## Windows 安装

本次本地构建包 `dist/cipher-route-native-windows-x64.zip` 包含开发构建的 host、httpcloak helper 和安装脚本，不包含私钥、测试数据或用户配置。尚未发布到 GitHub。扩展使用 `dist/extension` 的最新内容。

1. 在 Chrome / Edge 加载或重新加载最新扩展，扩展固定 ID 为 `kejpkbdliekmgpagfceglikahmchoabg`，无需复制。
2. 解压本地内核包，进入该目录，在 PowerShell 执行：

```powershell
.\install-windows.ps1 -Browser Chrome
# Edge 使用 -Browser Edge
```

脚本仅注册当前用户的 Native Messaging host，不需要管理员，不安装 CA。文件复制到 `%LOCALAPPDATA%\CipherRoute\native`。注册只允许固定 CipherRoute ID，不开放通配授权。旧版未固定 ID 的扩展需要重新加载固定 ID 版本并重新运行安装脚本。旧 ID 下的本地配置不会自动迁移，请先保留原扩展及配置；确认新版本后再移除旧版本。

3. 打开 TLS 配置，点击“检测本地内核”，查看可用版本。
4. 点击“查看 CA 信息”，核对文件路径及 SHA256，然后自行将这张专用根证书导入客户端信任库。不要分享 `capture-ca.key`。启用解密会让本地代理看到 HTTPS 明文，请只信任自己生成的 CA。程序不会自动安装证书或关闭验证。
5. 在组合模式选择代理和 Chrome/Firefox TLS 配置，协议保持 Auto，然后“保存并启用”。未信任 CA 时浏览器会拒绝代理证书，请先完成信任；不要绕过浏览器安全警告。

## 生命周期与数据

使用持久 Native Messaging 端口。prepare 启动独立环回临时端口；浏览器设置成功且持久化后 commit，关闭旧实例；失败 abort 并恢复旧设置。切换普通模式或释放控制权时停止内核。浏览器关闭导致 stdin EOF 后，host 停止实例并退出。异常崩溃时浏览器可能仍指向失效端口，失败不回退直连；请手动切换直连或重新启用模式。

本地内核 CA 保存于安装配置的 dataDir/certificates。每个实例的临时捕获数据库保存在 sessions 下，正常停止时删除；异常终止可能留下数据，清理前应先关闭 host。未实现崩溃残留清理与无捕获转发模式。端口只监听 127.0.0.1。

## 构建

本次开发依赖相邻目录 `http-capture` 的源码，参考 commit `7d3c9919ad91f580062468a345526df73a569226`，使用其中 capture-core 及 vendor/h2。native/Cargo.lock 锁定 Rust 依赖。不声称已经完成独立、可移植的 CI 二进制发布流程。

```sh
cargo build --manifest-path native/Cargo.toml --locked
cargo test --manifest-path native/Cargo.toml --locked
```

将 http-capture-httpcloak 可执行文件及同名 .json 能力清单放在 host 旁边。已实现 macOS/Linux 当前用户安装及四平台构建工作流，其他平台二进制和实机验收仍待执行，见 [三端安装](install.md)。

## 验证

- 23 项 JS 回归测试通过（含 native 两阶段切换/存储失败回滚及普通模式不启动 host）。
- Rust Native Messaging 帧解析测试通过。
- Firefox 148、Chrome 152 经原生消息 prepare/commit 启动的代理访问 https://httpbin.org/get 成功，UA 保持 CipherRoute-test；curl 指定专用 CA，使用 Windows 尽力吊销检查，不使用 insecure，不修改系统信任库。
- 停止后临时端口不再接受连接。
- tls.peet.ws 指纹回显连接超时，尚未完成指纹对比。
- 真实 Chrome/Edge 扩展安装、CA 信任及浏览器流量端到端验收仍待完成；上述网络测试以独立测试客户端代替浏览器。

固定 ID 通过 manifest.key 公钥实现，适用于目前的已解压安装方式。公钥公开，生成过程未将私钥落盘或打包；若未来上架商店，需按商店分配的公钥和 ID 重新核对授权，不能假定商店 ID 一定相同。
