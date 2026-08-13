# 通用 MCP 插件系统

## Goal

为 `lui-agent` 增加通用 MCP 插件系统：用户可通过前端接入外部 MCP Server，FastAPI 后端作为 MCP Host 管理 MCP Client、连接、工具发现与调用，并把已授权的 MCP Tools 接入现有 Agent、HITL、run、事件和持久化链路。

前后端分别建立独立 `mcp` 模块。现有 `graph`、`runs` 与 UI 仅依赖稳定接口，不直接解析 MCP 协议、管理连接或拼装路由。

## Background

- 当前系统是带用户账号与 PostgreSQL 持久化的 Web 应用，不是单用户桌面程序。
- FastAPI 是唯一业务入口；LangGraph 只负责进程内 Agent 编排。
- 当前工具是后端静态注册的 LangChain tools，尚无动态发现、MCP Client 生命周期或动态工具路由。
- 当前工具事件与人工审核已存在：`tool.call`、`tool.approval_required`、`tool.result` 和 interrupt resume。
- MCP Python SDK 2.0.0 已发布且支持 Python 3.14；实现必须锁定已验证版本，不能混用主分支与旧版 API。

## Requirements

### R1. 版本与能力边界

- V1 只支持 Streamable HTTP 与受控 stdio，不兼容已废弃 HTTP+SSE。
- V1 只消费 MCP Tools。可以展示 Server capabilities，但 Resources、Prompts、Sampling、Elicitation 必须标注为“已发现但当前版本不支持”。
- V1 远程认证只支持无认证、静态 Bearer Token、自定义静态 Header；不实现 OAuth 2.1。

### R2. 用户、管理员与配置所有权

- 用户角色为 `USER / ADMIN`；公开注册只能创建 `USER`，管理员由部署配置或后台脚本授予。
- 用户可管理仅自己可见的私有 Streamable HTTP 配置。
- 管理员可发布共享 Streamable HTTP 与共享 stdio 定义；普通用户只能为自己启用或停用，不能修改连接、凭据、镜像、命令、挂载、网络或安全策略。
- 所有权限由后端强制校验；前端隐藏或禁用操作不是安全边界。

### R3. 凭据与网络安全

- 静态 Bearer/Header 和 stdio 敏感环境变量使用部署级主密钥应用层加密入库，数据库不存明文。
- API 永不回传明文；编辑留空表示保留，只有显式清除才删除。日志、错误、测试结果和审计禁止记录凭据。
- 普通用户配置的远程地址默认禁止回环、私网、链路本地、云元数据等目标；DNS 解析和重定向后的实际地址都必须重新校验。
- 企业内网目标只能由管理员加入服务端白名单。

### R4. Server、Client 与连接状态

- Server 状态统一为 `DISABLED / CONNECTING / CONNECTED / DEGRADED / ERROR`，由 Host 产生。
- 开启 Server 时连接并发现工具；支持手动重连/刷新、低频自动刷新和 tools-list-changed 通知。
- 工具临时消失后停止暴露但保留启用偏好；同一远端身份重新出现后可恢复。
- Client/Session 以“用户 + Server”为隔离单元；同一用户可跨 run 复用，空闲回收，进程重启后按需重建。
- 连接失败保持用户启用选择，展示脱敏错误并按有上限的指数退避重试。

### R5. 工具发现、命名与 Schema

- Server 与 Tool 采用两级启用；首次发现的工具默认关闭。管理员可提供共享工具推荐默认值，用户保留自己的实际选择。
- 内部工具名匹配 `^[A-Za-z_][A-Za-z0-9_-]{0,63}$`，包含稳定 Server/Tool 短标识；非法字符、超长名称和归一化碰撞必须确定性转换与消歧。
- MCP 模块维护内部名与 `(server_id, remote_tool_name)` 的双向 Mapper。Server 展示名变化不得改变身份，任何执行都必须经过 Mapper、所有权、启用、Schema 和审核校验。
- 保存原始 MCP `inputSchema`，执行前按原始 Schema 校验；模型只接收针对当前 Provider/模型的安全兼容投影。
- 无法无歧义投影的工具标记 `INCOMPATIBLE` 并禁止启用；禁止静默删减关键约束。Provider/模型切换时重新评估。

### R6. 工具作用域、快照与审核

- 用户级启用集合是新对话默认值；每个对话可临时覆盖且不修改默认值。
- run 启动时冻结 Server、Tool、Mapper、Schema 与审核策略快照；配置变化只影响后续 run。
- interrupt 恢复沿用原 run 快照；安全版本变化后不得继续执行旧审核请求。
- MCP 工具默认每次调用都走现有 HITL。管理员可为共享工具设最低审核等级；普通用户只能保持或提高严格度。
- Tool annotations 仅用于风险提示，不可信且不能自动免审。

### R7. 调用结果与对象存储

- V1 原生处理 text、structured content、image、audio。
- image/audio 等二进制不得以内嵌 base64 长期写入 PostgreSQL 或 SSE；转存私有 S3 兼容对象存储。
- 本地使用 MinIO，生产可接 AWS S3 或其他兼容服务；后端校验资源归属后签发短期预签名 URL。
- 对象关联用户、run、tool call、媒体类型、大小和过期时间，默认保留 7 天并异步清理；管理员可收紧。
- resource link 只展示元数据，Host 不自动抓取；embedded resource 与未知类型明确降级，不得使 run 崩溃。

### R8. 受控 stdio 容器沙箱

- stdio MCP 只能运行在独立受限容器，FastAPI 禁止直接在宿主机启动插件命令。
- MCP 模块依赖 `StdioSandboxOrchestrator` 抽象，V1 提供 Docker Engine 编排代理适配器；FastAPI 不持有无限权限 Docker Socket。
- 普通用户不能指定镜像、命令、参数、环境、网络、挂载和权限。管理员只能选择预批准镜像和策略。
- 默认非 root、只读根文件系统、仅临时可写目录、无外网、无宿主机路径/Docker Socket 挂载、最小 capabilities，并限制 CPU、内存、PID、时长和并发。
- 受控出站和专用数据卷必须由管理员逐项批准；容器异常或 Client 回收时清理完整实例。

### R9. 配额、失败隔离与一致性

- 部署配置定义连接/调用超时、用户/Server 并发、结果字节数、Server 数、run 工具数、stdio 容器数和资源硬上限。
- 管理员可收紧共享定义限制；普通用户不能放宽系统或管理员限制。
- 超时、超限、截断、协议错误和工具错误产生稳定脱敏业务结果，不能拖垮 Host 或影响其他用户。
- 共享定义删除采用先停用后软删除；新 run 立即禁用，已开始调用可在原超时内收尾。
- 连接、凭据、镜像、命令、Schema、审核下限或沙箱策略变化会递增安全版本，使旧 interrupt 失效；仅展示信息变化不失效。
- 管理员可在安全事件中强制终止关联 Client、容器和活跃 run。

### R10. 审计

- MCP 审计日志追加写，业务 API 不可修改；只允许按保留策略清理。
- 记录配置/权限/白名单/镜像/沙箱变更，以及连接、刷新、调用、审核、结果状态、耗时和字节数。
- 只记录参数键名、必要标识与脱敏摘要，不默认保存完整参数/结果，绝不记录凭据。
- 用户只能查看自己的事件，管理员可查看系统级事件；默认保留 90 天。

### R11. 前端交互

- 普通用户 MCP 设置页支持私有 Server、共享 Server 启用、状态、重试、工具开关与个人审计；聊天页提供当前对话工具选择器。
- 管理员额外管理共享 HTTP/stdio、可信镜像/沙箱、网络白名单、审核下限、配额和系统审计。
- Server 使用卡片/折叠面板；顶级 Switch 控制 Server，展开后工具逐项 Switch。
- 工具显示原名、描述、来源 Server 标签和风险标签；来源标签可定位到 Server。风险未知时必须明确显示。
- 普通用户可复制自己可见工具的内部名；协议详情、容器信息和系统日志仅管理员可见。

### R12. 模块边界

- 后端 MCP 业务代码集中在 `app/modules/mcp/`，协议 SDK、Docker 编排代理与对象存储通过该模块内端口/适配器聚合。
- 前端 MCP 页面、组件、服务、store、types、hooks、domain 与样式集中在 `src/modules/mcp/`。
- `runs`、`graph`、App shell 只依赖 MCP 模块公开接口，不复制协议 DTO、Mapper、状态机或鉴权逻辑。

## Acceptance Criteria

- [ ] AC1：普通用户可管理私有 HTTP MCP，并启用管理员共享 HTTP/stdio；越权 API 均被拒绝。
- [ ] AC2：静态凭据加密入库且从数据库、API、日志、错误和审计中均无法读出明文。
- [ ] AC3：SSRF 防护覆盖 URL、DNS 解析和重定向；只有管理员白名单可访问内网目标。
- [ ] AC4：Server 状态、连接、刷新、重试与工具消失/恢复行为可观察且不会丢失偏好。
- [ ] AC5：同名、非法和超长工具获得稳定唯一内部名，双向 Mapper 可精确路由。
- [ ] AC6：只有启用且 Schema 兼容的工具进入模型；执行前按原始 Schema 校验。
- [ ] AC7：用户默认与对话覆盖生效；run/interrupt 使用冻结快照，安全版本变化会拒绝旧恢复。
- [ ] AC8：MCP 工具默认走 HITL，并产生现有统一工具事件；普通用户不能降低管理员审核下限。
- [ ] AC9：text/structured/image/audio 结果正确展示；二进制通过私有对象存储与短期授权 URL 访问并按 7 天清理。
- [ ] AC10：stdio 只在独立受限容器运行，编排代理不能操作白名单外镜像或非 MCP 容器。
- [ ] AC11：配额、超时、连接/工具错误不会影响其他用户或使服务崩溃。
- [ ] AC12：审计追加写、按角色隔离、默认 90 天，且不保存凭据或完整敏感载荷。
- [ ] AC13：普通用户和管理员 UI 权限、卡片/折叠、两级 Switch、来源定位、风险标签与内部名复制符合要求。
- [ ] AC14：V1 对 HTTP+SSE、OAuth、Resources、Prompts、Sampling、Elicitation 给出明确未支持行为，不出现半成品入口。
- [ ] AC15：前后端 MCP 代码集中在独立模块，现有 run/graph/UI 通过稳定接口集成。

## Out of Scope

- V1 不支持旧 HTTP+SSE transport。
- V1 不支持 OAuth 2.1、个人身份授权、Token 刷新/撤销、动态客户端注册。
- V1 不支持 Resources、Prompts、Sampling、Elicitation。
- V1 不支持 Kubernetes stdio 编排适配器。
- V1 不允许普通用户创建或修改 stdio 运行定义、访问任意宿主机文件或扩大容器网络/权限。

## V2 待实现能力

- MCP OAuth 2.1：个人授权、回调、动态客户端注册、Token 加密存储、刷新和撤销。
- Resources：发现、读取、订阅、内容类型和访问授权。
- Prompts：发现、参数化选择和对话注入边界。
- Sampling：模型选择、费用、授权与审核策略。
- Elicitation：表单、安全数据与中断恢复交互。
- Kubernetes stdio 沙箱：Pod/Job、NetworkPolicy、SecurityContext、配额和清理策略。

## Child Tasks

1. `08-13-mcp-core-host`：角色、配置、Streamable HTTP Client、发现、Mapper、Schema、状态和审计基础。
2. `08-13-mcp-infrastructure`：Docker 编排代理/stdio transport、S3/MinIO、对象元数据与清理。
3. `08-13-mcp-agent-integration`：动态工具、run 快照、HITL、事件、结果和错误隔离。
4. `08-13-mcp-frontend`：普通用户/管理员页面、对话选择器、状态、审计和媒体结果。

依赖顺序：核心合同先完成；基础设施与 Agent 集成随后可并行；前端在 API/事件合同稳定后完成；总任务最后执行跨子任务验收。

## Open Questions

无阻塞性产品决策。
