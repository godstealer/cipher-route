# CipherRoute

独立的 Chrome / Edge 代理切换扩展，后续通过 HTTP Capture 内核提供按情景配置 TLS 的能力。

## 开发与加载

需要 Node.js 20+，首期没有 npm 依赖。

```sh
npm test
npm run build
```

在 `chrome://extensions` 或 `edge://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，加载本项目的 `dist/extension`。点击 CipherRoute，打开“管理配置”。安装本身不会改变代理设置；点击情景或“保存并启用”后才生效。

组合模式默认不选择 TLS 配置，普通模式直接使用浏览器代理 API，无需运行 HTTP Capture，也无需安装 CA；只需配置可用的代理服务器。TLS 参数关闭后保留但不参与转发。保存后点击“保存并启用”才能更新当前代理。

内置 HTTP Capture 示例情景指向 `127.0.0.1:8080`，需要自行启动 HTTP Capture 监听。此情景只是连接已有代理，并未自动启用 TLS 预设。浏览器扩展不需要修改系统代理。选择“释放控制权”清除本扩展的覆盖，不强行覆盖其他扩展或系统原有设置。

## 已实现

- Manifest V3 后台、快捷弹窗、情景管理页面。
- HTTP / HTTPS / SOCKS5 代理切换；直连、跟随系统、释放控制权。
- 精确域名和 `*.example.com` 子域匹配，PAC 按域名分流；未匹配走直连，本机绕过。
- 本地配置保存、输入校验、编辑后待应用提示、代理策略冲突检测。
- TLS 浏览器预设 / 版本 / ClientHello Hex 配置保存。
- Native Messaging 能力探测接口；没有本地 host 时显示真实错误。

## 明确未完成

TLS 自定义转发尚未接通。打开“自定义 TLS”的情景目前**拒绝启用**，不会把保存配置误报为 TLS 已生效。

后续：本地 host、受限授权、CA 信任引导、按情景路由到 HTTP Capture 的发送引擎、连接池隔离、WS/SSE/gRPC 兼容验证。Firefox、代理认证、规则订阅、配置导入导出暂未支持。

HTTPS 类型指连接代理本身使用 TLS，不表示修改目标站点的 ClientHello。SOCKS5 认证不能直接通过当前浏览器配置实现。

验证范围：Node 自动化测试与扩展构建。真实浏览器安装、浏览器流量出口及 TLS 端到端验证单独验收。

最新验证：17 项核心与控制器测试通过；4 项 httpbin 网络测试通过。真实扩展安装与浏览器出口仍待验收。

## 独立配置与组合模式（v2）

- **代理配置**：名称、HTTP / HTTPS / SOCKS5、地址、端口。
- **TLS 配置**：独立保存预设、版本和 ClientHello Hex，可在多个模式中复用。
- **组合模式**：引用一个代理，可选一个 TLS 配置，并设置域名匹配规则。默认不选 TLS，无需 HTTP Capture 或 CA。
- 代理或 TLS 资源修改不会立即改变正在使用的模式，需要重新应用；已生效模式会提示配置变更。
- 被模式引用的配置不能直接删除；删除当前模式先释放代理控制。
- v1 配置读取时转换为 v2，保存时持久化新结构；原来关闭的 TLS 草稿保留为独立资源，不自动启用。
- TLS 内核仍未接入，选择 TLS 的模式可保存但拒绝启用。界面预览使用模拟代理 API，不代表实际流量验证。


## httpbin 实际网络测试（手动运行）

需要 curl 和可用代理，默认使用 `http://127.0.0.1:9000`。可通过环境变量 `CIPHER_ROUTE_TEST_PROXY` 指定其他 HTTP、HTTPS 或 SOCKS5 代理地址。本次仅实测本地 HTTP 代理。

```sh
npm run test:live
```

脚本使用核心模块解析组合模式、生成代理配置并执行生成的 PAC，再通过 curl 访问 httpbin，断言查询参数、测试请求头和 URL。覆盖全局 HTTP、全局 HTTPS、域名命中代理和未命中直连。网络测试不自动进入 CI，不修改浏览器或系统代理。

Windows 本次 HTTPS 遇到 `CRYPT_E_NO_REVOCATION_CHECK`，使用以下显式选项后测试通过；默认测试不降低吊销检查要求，仍保留 CA 和主机名验证，不使用 `--insecure`：

```powershell
$env:CIPHER_ROUTE_REVOCATION_BEST_EFFORT = '1'
npm run test:live
```

此选项仅用于 curl 测试，不改变扩展或浏览器证书策略。2026-10-14：4/4 网络用例通过，代理和直连出口 IP 相同。该测试不覆盖 Chrome 扩展安装、后台 service worker 或真实浏览器代理 API；不能替代扩展端到端验收。


## 下载与安装（无需开发环境）

从 https://github.com/godstealer/cipher-route/releases 下载 `cipher-route-0.1.0.zip`，解压到固定目录。Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，选择解压后包含 `manifest.json` 的目录。不要选择 ZIP 文件。安装后保留此目录。

打开扩展的“管理配置”，先添加可用代理地址，再建立组合模式引用它。TLS 配置选择“关闭 · 浏览器原生 TLS”，保存并启用。示例 8080 不会自动启动代理；请改成你实际监听的端口。该包适用于 Windows、macOS、Linux 的 Chrome / Edge，无需 Node、Rust、Go 或 HTTP Capture。

## TLS 库与安装边界

| 部分 | 本版本实际使用 | 是否额外安装 |
| --- | --- | --- |
| 普通代理下的 HTTPS | Chrome / Edge 自身的 TLS 实现；扩展仅调用 chrome.proxy | 无额外 TLS 库或 CA 要求 |
| HTTPS 类型的代理连接 | 浏览器自身的 TLS 实现 | 代理证书需符合浏览器信任策略 |
| 自定义 ClientHello / Chrome / Firefox TLS 预设 | 仅配置保存，尚未实现转发 | 本包未包含可用自定义 TLS 内核 |
| wreq / httpcloak / rustls | 本扩展未链接、未捆绑这些库 | 不需要为本版本安装它们 |

后续计划复用 HTTP Capture 发送引擎，但目前没有可安装的 CipherRoute Native Messaging host，也没有捆绑 CA。不要把“配置可保存”理解为握手已改变。如果使用的外部代理本身解密 HTTPS，它可能有自己的 CA 要求，那是该代理的行为。

本次发布是开发预览：核心测试和 curl 网络测试已通过，真实浏览器扩展出口验收仍待完成。ZIP 是已解压扩展包，不是应用商店签名的 CRX，也不是桌面安装程序。
