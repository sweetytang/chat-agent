# PRD: MCP 模块架构极简重构 (mcp-architecture-simplification)

## 1. 背景与目标
当前项目是一个远程 Web 项目，原有的 MCP 模块采用重型 4 表设计（`mcp_server_definitions`, `mcp_user_servers`, `mcp_tools`, `mcp_user_tools`），存在过度设计、维护成本高、多表连接性能差等问题。
本次重构目标：
1. 废弃公共模板概念，全量转为用户个性化自定义；
2. 架构极简化：从 4 张表收敛为 1 张表 `user_mcp_servers`，工具开关与审批规则使用 `tool_rules` JSON 字段维护；
3. 本地 MCP (`stdio`) 安全管控：增加 `ENABLE_LOCAL_MCP` 环境变量，并封装独立的命令安全校验方法；
4. 运行时动态工具拉取与异常优雅降级：内存缓存动态工具 Schema，若某个远程 MCP 连接失败，通过 `mcp.warning` 提示前端而不阻断正常对话；
5. 前端交互统一：移除所有可视化添加表单，全面采用业界标准的 `mcpServers` JSON 编辑器。

---

## 2. 需求规格与设计

### 2.1 后端数据模型 (`user_mcp_servers`)
- `id: UUID` (主键)
- `user_id: UUID` (外键关联 users.id, 级联删除)
- `name: str` (服务标识/别名)
- `transport: str` (`sse` | `streamable_http` | `stdio`)
- `endpoint: str | None` (远程 URL)
- `command: str | None` (stdio 命令)
- `args: list[str]` (stdio 命令行参数，JSON 存储)
- `process_env: dict[str, str]` (stdio 环境变量，JSON 存储)
- `request_headers: dict[str, str]` (远程 HTTP Header，如 Authorization，JSON 存储)
- `enabled: bool` (服务级启用状态，默认 True)
- `tool_rules: dict[str, Any]` (工具级开关与审批规则，默认 `{}`)
  - 格式：`{"tools": {"tool_name": {"enabled": bool, "require_approval": bool}}}`

### 2.2 本地 MCP 安全策略
- 新增配置项：`ENABLE_LOCAL_MCP: bool = False`（从环境变量读取，默认 False）；
- 新增配置项：`ALLOWED_LOCAL_COMMANDS: list[str] = ["npx", "uvx", "node", "python", "python3"]`；
- 封装独立命令校验方法 `validate_stdio_command(command: str, args: list[str]) -> None`：
  - 若 `ENABLE_LOCAL_MCP` 为 False，直接抛出 `403/400` 错误；
  - 校验 `command` 是否包含危险 Shell 注入符，是否在允许的根程序列表中；
  - 校验 `args` 中是否含有管道符 `|`, `;`, `&&` 等注入攻击字符。

### 2.3 运行时与对话集成
- 会话启动时，动态获取当前用户 `enabled=True` 的 MCP 服务列表；
- 并发探测拉取 tools 并缓存；如果个别服务离线，生成 `mcp.warning` 事件通知前端，并记录警告日志，剩余服务正常执行；
- 彻底清理旧的 `mcp_tools`, `mcp_user_servers`, `mcp_user_tools` 引用与冗余代码。

### 2.4 前端体验
- 移除 `AddServerForm.tsx` 等可视化表单；
- `McpSettings` 统一使用 JSON 编辑器导入与编辑配置；
- 点击保存时一次性校验并全量同步保存。

---

## 3. 验收标准
- [ ] 数据库完成迁移，仅保留 `user_mcp_servers` 表，旧表安全移除；
- [ ] 环境变量 `ENABLE_LOCAL_MCP=false` 时，阻止配置 `stdio` 类型的 MCP 服务；开启时经过安全校验可配置；
- [ ] MCP 工具动态发现正常，大模型能够基于配置的 `user_mcp_servers` 正确调用工具；
- [ ] 单个 MCP 服务离线时，前端收到警告提示，不打断整体对话流；
- [ ] 前端纯 JSON 编辑器操作流畅，导入导出保存正常；
- [ ] 后端自动化单测（API 测试、运行时测试）全量通过。
