# 架构与实施清单

## 分工

扩展负责情景、浏览器代理、域名规则和用户授权。本地 host 负责生命周期和控制协议；HTTP Capture 的 capture-core、transport-api 与 httpcloak 引擎承担 TLS 解密及上游连接。

首期不复制 HTTP Capture 源码，不直接暴露它的开发控制 token，不修改现有工程。后续需在 HTTP Capture 增加按情景选择引擎的入口；不能假设现有默认抓包路径自动遵循手动发包 TLS 配置。复用前核查各依赖许可证及发布要求。

## 控制协议（设计，尚无 host 实现）

Native Messaging host 名称：`io.cipherroute.host`。仅允许安装时绑定的扩展 ID。请求 `{version:1,type:"capabilities"}`，响应需包含 `version:1`。后续增加 activate/deactivate，返回仅环回监听地址、应用配置版本以及实际可用预设。浏览器普通网页不能调用控制端。

流量走本地代理监听，不通过 Native Messaging 搬运正文。TLS 模式需客户端信任 CA；浏览器到本地代理与代理到网站是两段 TLS。配置变化需隔离/重建上游连接，防止沿用旧 TLS 会话。按规则未命中流量的处理必须明确；TLS 模式失败不静默降级为浏览器握手。

## 优先级

- [x] 扩展情景管理、代理切换和域名 PAC。
- [x] 独立 TLS 开关，新情景默认关闭；关闭时仅浏览器代理转发，不调用本地内核，不要求 CA。
- [x] TLS 参数保存、未实现能力阻止启用；旧版非 browser 预设保持开启语义，避免静默降级。
- [x] 状态探测和本地内核协议边界。
- [ ] Chrome/Edge 真实安装与代理出口验收。
- [ ] 本地 host 与 HTTP Capture 按情景转发接口。
- [ ] CA 安装引导与信任状态。
- [ ] 实际握手回显及版本能力列表。
- [ ] 原始头序、多连接隔离、WS/SSE/gRPC 和大正文验证。
- [ ] Firefox 适配、认证代理、导入导出与订阅。

参考：https://developer.chrome.com/docs/extensions/reference/api/proxy

参考：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

## 独立配置与组合模式（v2）

- **代理配置**：名称、HTTP / HTTPS / SOCKS5、地址、端口。
- **TLS 配置**：独立保存预设、版本和 ClientHello Hex，可在多个模式中复用。
- **组合模式**：引用一个代理，可选一个 TLS 配置，并设置域名匹配规则。默认不选 TLS，无需 HTTP Capture 或 CA。
- 代理或 TLS 资源修改不会立即改变正在使用的模式，需要重新应用；已生效模式会提示配置变更。
- 被模式引用的配置不能直接删除；删除当前模式先释放代理控制。
- v1 配置读取时转换为 v2，保存时持久化新结构；原来关闭的 TLS 草稿保留为独立资源，不自动启用。
- TLS 内核仍未接入，选择 TLS 的模式可保存但拒绝启用。界面预览使用模拟代理 API，不代表实际流量验证。

## 组合模式回归测试

运行 `npm test`。当前 17 项通过，覆盖旧配置迁移（含 80 字名称及关闭的 TLS 草稿）、共享资源、各模式独立域名规则、未引用 TLS 修改不影响普通模式、引用失效拒绝保存且不覆盖旧配置、重新加载和派生数据重建。测试中发现并修复了旧配置长名称追加 TLS 后超长的问题。

上述为核心与控制器自动化测试，浏览器代理 API 使用模拟对象；不等于真实浏览器流量出口或 TLS 端到端测试。

## TLS 配置完善（2026-10-14）

TLS 编辑器区分浏览器主版本和 TLS 协议版本。支持保存跟随 UA、内核最新支持版本、指定版本三种策略，以及上游 HTTP auto/h1/h2、TLS auto/1.2/1.3。自定义 Hex 仅检查编码和长度，完整 ClientHello 结构必须由后续内核验证；不是原始握手直接重放。

浏览器原生预设作为普通代理生效，不应用自定义协议字段，不要求本地 host 或 CA。Chrome/Firefox/custom 配置仍拒绝激活。内核检测只检查控制协议连通性，不表示转发能力已接通。

已核查 HTTP Capture 的 crates/transport-api、browser-profiles 和 transport-httpcloak：有 TlsProfile、浏览器版本目录和发送引擎能力接口。下一步仍需实现受扩展 ID 限制的 Native Messaging host、模式与代理实例映射、CA 信任流程、失败回滚和真实浏览器握手验收。未将这些能力标为完成。

自动化测试：21 项通过；新增原生 TLS 资源可启用和协议字段保存/校验测试。界面新增字段尚未进行真实浏览器交互验收。
