# 通用 MCP 插件系统技术设计

## 1. 总体架构

```text
React / src/modules/mcp
  ├─ 用户设置、管理员控制台、对话工具选择器、审计与媒体展示
  └─ typed API contracts
                │
                ▼
FastAPI / app/modules/mcp
  ├─ API + RBAC + ownership
  ├─ definition / activation / tool catalog / audit repositories
  ├─ MCP Host（Client pool、状态机、刷新、配额）
  ├─ Tool Mapper + Schema projector + policy evaluator
  ├─ Run tool snapshot / LangChain adapter
  └─ ports
      ├─ MCP SDK 2.x Streamable HTTP adapter
      ├─ Sandbox stdio transport → 最小权限编排代理 → Docker Engine
      └─ ObjectStorage → S3 / MinIO
                │
                ▼
现有 runs / interrupts / graph / SSE / checkpoints
```

FastAPI 仍是唯一业务 Host。MCP SDK 只处理协议；Docker/S3 SDK 只存在于适配层；LangGraph 不拥有 MCP Client、配置或权限。

## 2. 目录边界

```text
apps/lui-agent/backend/app/modules/mcp/
├── router.py                 # 用户 API
├── admin_router.py           # 管理员 API
├── schemas.py                # API DTO
├── models.py                 # ORM models
├── repository.py
├── service.py                # 配置、启用、版本、一致性
├── authz.py                  # 角色与资源归属
├── crypto.py                 # 凭据 envelope
├── network_policy.py         # URL/DNS/redirect SSRF 校验
├── host/
│   ├── manager.py            # Client pool、idle eviction、shutdown
│   ├── state.py              # Server 状态机
│   ├── client.py             # MCP SDK 2.x adapter
│   ├── discovery.py          # tools/list + notifications
│   └── limits.py
├── tools/
│   ├── mapper.py
│   ├── schema.py
│   ├── policy.py
│   ├── snapshot.py
│   ├── langchain.py
│   └── result.py
├── sandbox/
│   ├── port.py
│   ├── transport.py          # 编排代理流 → MCP Client transport
│   └── docker_proxy.py
├── storage/
│   ├── port.py
│   ├── s3.py
│   └── cleanup.py
└── audit.py

apps/lui-agent/frontend/src/modules/mcp/
├── components/
│   ├── McpSettings/
│   ├── McpServerCard/
│   ├── McpToolRow/
│   ├── ThreadToolPicker/
│   ├── McpAdminPanel/
│   ├── McpAuditList/
│   └── McpMediaResult/
├── services/mcpApi.ts
├── store/mcp.ts
├── hooks/
├── domain/
├── constants/
├── types/
└── index.ts
```

对现有模块的修改只允许是依赖注入与适配：`factory.py` 注册路由/lifespan，`runs` 请求 MCP tool snapshot，`graph` 接收普通 LangChain tools，前端 shell 挂载入口与媒体 renderer。

## 3. 核心数据模型

- `users.role`：`USER / ADMIN`。
- `mcp_server_definitions`：所有权、scope、transport、展示信息、HTTP URL 或 stdio 镜像/启动策略、加密凭据、状态配置、security_version、soft-delete。
- `mcp_user_servers`：用户对私有/共享 Server 的启用状态、运行状态、错误、最后连接/刷新时间。
- `mcp_tools`：server_id、remote_name、内部名、描述、原始 input/output schema、annotations、compatibility、presence/version。
- `mcp_user_tools`：用户启用与审核覆盖。
- `mcp_thread_tools`：对话级 override（inherit/enable/disable）。
- `mcp_run_tool_snapshots`：run 冻结的工具身份、Schema hash、security_version、审核策略和路由信息。
- `mcp_binary_objects`：user/run/tool_call、对象键、mime、size、expires_at、状态。
- `mcp_audit_events`：append-only actor/action/target/status/metadata/timing/size。
- `mcp_network_allowlist`、`mcp_sandbox_policies`：管理员控制面。

连接对象、MCP Session 与容器 attach stream 不入库；数据库只保存可重建状态。

## 4. 配置与权限模型

`scope=PRIVATE` 只能是 HTTP 且 owner 为当前用户；`scope=SHARED` 只能由管理员维护。普通用户对共享定义只有 activation 与允许范围内的 tool preference。

凭据采用版本化 envelope：`key_id + nonce + ciphertext + algorithm`。读取 DTO 只返回 `credential_configured` 与脱敏提示。主密钥缺失或解密失败时配置进入 ERROR，禁止连接。

管理员授权依赖数据库 role；部署脚本只执行显式邮箱/用户 ID 提权，不复用公开注册接口。

## 5. Streamable HTTP 与 SSRF

HTTP adapter 使用 MCP Python SDK 2.x `Client` 或等价稳定 API，并注入受控 `httpx.AsyncClient`。每次初始连接、DNS 重新解析和重定向都执行网络策略：

1. 只允许 `https`；开发环境可显式允许公网 `http`。
2. 解析所有 A/AAAA 地址，任一地址落入禁止网段则拒绝，除非精确命中管理员白名单。
3. 禁止自动跟随未经复核的重定向；逐跳校验 scheme、host 与解析地址。
4. 连接使用已验证目标，降低 DNS rebinding 窗口；白名单保留审计。
5. 静态 Header 仅注入目标 MCP 请求，不允许覆盖 Host、Content-Length、MCP 协议头等保留字段。

## 6. stdio 沙箱 transport

FastAPI 不调用本地 `stdio_client(command=...)`。`SandboxStdioTransport` 向最小权限编排代理请求创建带专用标签的容器，并把代理提供的双向 stdin/stdout 流适配成 MCP SDK transport。

编排代理只接受高层 `approved_definition_id + user_id + limits`，自行从只读批准清单解析镜像 digest、entrypoint、环境与策略；不接受任意 Docker create payload。代理只能查询/终止自己创建且标签匹配的容器。

默认容器策略：镜像 digest 固定、non-root、read-only、tmpfs、cap-drop ALL、no-new-privileges、private PID/cgroup namespace、pids/memory/cpu 限制、network none、无 bind mount、无 Docker socket。管理员批准的卷与出站通过命名策略引用，而不是自由文本。

## 7. Client 生命周期与状态机

Host pool key 为 `(user_id, server_id, security_version)`。同一用户可复用，跨用户绝不复用。引用计数归零后进入 idle，超时关闭；应用 lifespan 关闭全部 Client/容器。

状态转换：

```text
DISABLED → CONNECTING → CONNECTED
                 ├──→ DEGRADED → CONNECTED
                 └──→ ERROR ──retry──→ CONNECTING
CONNECTED ─disable/security revoke─→ DISABLED
```

连接成功后读取 capabilities 与 tools。刷新由手动请求、低频调度、MCP notification 触发；同一 user/server 合并并发刷新。

## 8. Tool Mapper、Schema 与选择

内部名由不可变 server short ID、tool stable ID 和可读 slug 组成，最终长度不超过 64。数据库唯一约束是内部名；Mapper 同时维护 forward/reverse 索引。

工具目录保存原始 Schema。Schema projector 对当前 Provider 的受支持子集做保真映射；无法保真则 `INCOMPATIBLE`。工具调用顺序：

```text
内部名 → reverse map → run snapshot → ownership/enable/presence
→ security_version → original-schema validation → HITL policy → MCP call
```

单次 run 的工具数量先受配额约束；超出时要求用户缩小集合，不做不透明随机裁剪。

## 9. Run、HITL 与事件

run 创建事务内生成 tool snapshot。MCP tools 适配为普通 LangChain tool definitions，但 handler 只生成受控执行请求。默认 policy 触发现有 interrupt；批准后按 snapshot 路由。

事件继续使用版本 1 的 `tool.call / tool.approval_required / tool.result`，data 增加可选 `tool_id`、`server_id`、`server_name`、`content_blocks`、`is_error`，由公共 decoder 统一处理。若合同无法保持兼容则升级事件版本，禁止组件直接读取未类型化字段。

安全版本不一致、工具消失、Client 不可用、Schema 无效均变成稳定 ToolMessage/业务错误，使模型可解释失败且 run 可继续或明确终止。

## 10. Tool Result 与对象存储

结果解码器区分 text、structured、image、audio、resource link、embedded/unknown。若有 output schema，structured content 也需校验。

二进制先校验 MIME、解码后大小与系统上限，再上传私有 bucket；事件/消息只保存对象 ID 和元数据。下载接口验证 thread/run 归属后签发短期 URL。清理任务按 `expires_at` 幂等删除对象并更新状态。

## 11. 审计与可观测性

审计事件在关键状态变更事务内追加；连接/调用等运行事件使用独立追加写。字段采用 allowlist，禁止把任意 request/response dump 进 metadata。

结构化日志只使用 ID、状态、耗时、字节数和错误码。指标至少包含连接状态、刷新/调用成功率、延迟、超时、活跃 Client/容器、对象字节和配额拒绝。

## 12. 兼容、发布与回滚

- 锁定 `mcp>=2.0,<2.1` 起步，升级前跑 adapter contract tests；如 SDK API 验证不通过，回退到已锁定小版本，不在业务层散落兼容分支。
- 数据库迁移先增加 nullable/default 字段与新表；功能开关默认关闭，不影响现有静态 tools。
- 分阶段开启：管理员/测试用户 → 私有 HTTP → 共享 HTTP → stdio 沙箱 → 全量。
- 关闭 MCP 功能开关会停止新 MCP snapshot 与 Client 创建，但保留配置、审计和历史回放；现有内置 tools 不受影响。

## 13. 关键技术依据

- 官方 Python SDK 2.0.0 支持 Python 3.14，并提供统一 Client、Streamable HTTP 与自定义 transport。
- MCP Tool 定义包含 input/output schema 与不可信 annotations；Tool Result 支持 text、image、audio、resource link、embedded resource 和 structured content。
- Docker 提供 read-only、cap-drop、network、memory、PID、security-opt 等容器限制；本设计通过最小权限代理收敛其控制面。
- S3 兼容预签名 URL 只作为短期访问能力，应用仍先校验业务资源归属。
