# 通用 MCP 插件系统实施计划

## 交付顺序

### 阶段 1：核心合同（`08-13-mcp-core-host`）

1. 增加用户角色、管理员初始化脚本和后端 RBAC。
2. 建立 MCP definition、activation、tool catalog、preference、snapshot、audit、allowlist/policy 数据模型与迁移。
3. 实现凭据加密 envelope、脱敏 DTO、SSRF/redirect 校验。
4. 锁定 MCP Python SDK 2.x，完成 Streamable HTTP adapter contract tests。
5. 实现 Host pool、状态机、刷新、idle eviction、limits 与应用 lifespan。
6. 实现 Tool Mapper、Schema projector、兼容状态、原始 Schema 校验与基础 API。
7. 验证角色越权、凭据泄漏、SSRF、同名/非法工具、状态机与审计。

### 阶段 2A：基础设施（`08-13-mcp-infrastructure`）

依赖：阶段 1 的 definition、Host transport port、limits 和审计合同稳定。

1. 定义编排代理协议与 `StdioSandboxOrchestrator` port。
2. 实现只接受批准定义 ID 的最小权限 Docker 编排代理与 fake adapter。
3. 实现 sandbox stdio 双向流 transport、容器健康/回收/强制终止。
4. 增加 MinIO 本地服务、S3-compatible `ObjectStorage`、对象元数据与授权下载。
5. 实现 7 天对象清理任务和容器孤儿清理。
6. 验证非 MCP 容器不可操作、镜像/网络/挂载不可越权、资源限制与对象归属。

### 阶段 2B：Agent 与 HITL（`08-13-mcp-agent-integration`）

依赖：阶段 1 的 Mapper、tool catalog、policy 和 snapshot 合同稳定；媒体端到端测试依赖阶段 2A 对象存储。

1. 在 run 创建时解析用户默认/对话覆盖并持久化 tool snapshot。
2. 把 MCP Tools 适配为 LangChain tools，现有 graph 只接收统一 tool list。
3. MCP 默认审核接入现有 interrupt approve/edit/reject/resume。
4. 扩展兼容业务事件与公共 decoder，持久化来源 Server、结果 blocks 与错误。
5. 处理 security version、工具消失、Schema、配额、协议/执行错误。
6. 验证快照冻结、旧 interrupt 拒绝、同名路由、二进制结果和 run 隔离。

### 阶段 3：前端（`08-13-mcp-frontend`）

依赖：阶段 1 API/DTO 与阶段 2 事件/媒体合同稳定。

1. 建立 `src/modules/mcp/` types、API、store、domain、hooks。
2. 实现普通用户 MCP 设置页、Server 折叠卡、两级 Switch、状态/刷新/错误。
3. 实现来源标签、风险/未知/不兼容提示和内部名复制。
4. 实现当前对话工具选择器和默认/覆盖差异。
5. 实现管理员共享 HTTP/stdio、白名单、沙箱、审核下限、配额和系统审计界面。
6. 实现个人审计、image/audio/structured/resource-link 结果展示和过期状态。
7. 验证响应式、浅深主题、键盘/读屏、角色权限和错误态。

### 阶段 4：总集成与发布

1. 使用 fake MCP Server 覆盖 Streamable HTTP、stdio、工具变化、Schema、错误与多内容结果。
2. PostgreSQL + MinIO + fake 编排代理执行确定性集成测试。
3. 可选 Docker 真机测试只验证代理/容器边界，主测试不依赖宿主机 Docker。
4. 复跑现有 auth/thread/run/checkpoint/HITL/前端测试，确认内置 tools 无回归。
5. 按功能开关执行管理员测试用户 → HTTP → stdio 的渐进启用与回滚演练。

## 验证命令

```bash
cd apps/lui-agent/backend && uv sync && uv run ruff check . && uv run mypy app && uv run pytest
cd apps/lui-agent/frontend && pnpm format:check && pnpm lint && pnpm test && pnpm build
git diff --check
```

基础设施集成测试另行使用项目 Compose 启动 PostgreSQL、MinIO、fake MCP Server 与编排代理；真实外部 MCP、真实模型和 Docker daemon 冒烟测试不得成为默认测试前提。

## 风险与回滚点

- 数据迁移：每个子任务的迁移独立可验证；新表回滚不删除已有用户/会话数据。
- SDK：所有 MCP SDK 调用封装在 adapter；版本升级失败只回滚 adapter/锁文件。
- Agent：MCP 功能开关关闭后 run 继续使用现有内置 tools。
- stdio：代理不可用时共享 stdio 显示 ERROR，不降级为宿主机执行。
- 对象存储：不可用时二进制工具结果返回受控错误，不内嵌 base64 兜底。
- 前端：MCP 页面可隐藏，现有聊天、审核、分支和历史不受影响。

## Review Gates

- 每个子任务单独完成 `trellis-implement → trellis-check → spec update → commit → archive`。
- 阶段 1 合同评审通过前，不启动依赖子任务。
- 总任务仅在四个子任务完成、AC1–AC15 全部验证后归档。
