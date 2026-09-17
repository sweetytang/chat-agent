# 架构设计: MCP 模块极简重构

## 1. 架构总览

```
[前端: JSON 编辑器 (mcpServers)] 
             │
             │ PUT /api/mcp/config (全量同步) 或 CRUD
             ▼
   [API: /api/mcp/servers] ──▶ 检查 ENABLE_LOCAL_MCP & validate_stdio_command
             │
             ▼
   [DB: user_mcp_servers]  (单表维护 Server 配置 & tool_rules)
             │
             │ 运行时动态加载: load_mcp_snapshots(user_id)
             ▼
   [McpHost / SDK] ──并发探测 (带超时 & 优雅降级) ──▶ [外部 MCP Services]
             │
             ▼ (动态生成 LangChain StructuredTools)
   [AgentDriver / LangGraph]
```

## 2. 详细设计

### 2.1 后端表结构变动
- 迁移：`drop table mcp_user_tools, mcp_tools, mcp_user_servers, mcp_server_definitions;`
- 新建：`user_mcp_servers` 表
- 关键字段：
  - `id`: UUID
  - `user_id`: UUID
  - `name`: String(255)
  - `transport`: String(32) ('sse', 'streamable_http', 'stdio')
  - `endpoint`: Text (可为空)
  - `command`: String(255) (可为空)
  - `args`: JSON (默认 [])
  - `process_env`: JSON (默认 {})
  - `request_headers`: JSON (默认 {})
  - `enabled`: Boolean (默认 True)
  - `tool_rules`: JSON (默认 {})

### 2.2 核心安全校验方法 (`validate_stdio_command`)
位置：`backend/apps/api-server/app/modules/mcp/security.py`
```python
def validate_stdio_command(command: str, args: list[str]) -> None:
    settings = get_settings()
    if not settings.enable_local_mcp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="当前系统配置未开启本地 (stdio) MCP 功能"
        )
    # 根命令检查
    cmd_base = os.path.basename(command).lower()
    if cmd_base in {"bash", "sh", "zsh", "cmd.exe", "powershell", "sudo"}:
        raise HTTPException(status_code=400, detail="禁止直接使用系统 Shell 作为启动命令")
    if settings.allowed_local_commands and cmd_base not in settings.allowed_local_commands:
        raise HTTPException(
            status_code=400, 
            detail=f"命令 {cmd_base} 不在系统允许的启动器列表中 ({settings.allowed_local_commands})"
        )
    # 参数防注入检查
    for arg in args:
        if any(char in arg for char in [";", "&&", "||", "`", "$("]):
            raise HTTPException(status_code=400, detail="命令行参数包含非法注入字符")
```

### 2.3 运行时适配 (`app/modules/mcp/agent/runtime.py`)
- 从 `user_mcp_servers` 捞出 `user_id` 下所有的 `enabled=True` 记录；
- 异步并发建立 client 连接并执行 `list_tools()`；
- 结合 `server.tool_rules`，如果该工具在规则中被标记为 `enabled: false` 则排除；若包含 `require_approval` 则设置 `snapshot.approval_required`；
- 连接超时的单项捕获异常，将异常放入警告列表，不影响其他工具加载；
- 在事件流开启前，如果存在离线警告，通过 `timeline_recorder.record(..., "mcp.warning", ...)` 通知前端。

### 2.4 前端清理
- 删除 `AddServerForm.tsx`，精简 `McpSettings` 弹窗；
- 将现有 `AddServerPanel.tsx` 改为纯 JSON 配置模式，支持查看、编辑、导入/导出标准 `mcpServers` 结构；
- 简化 API 请求层，调用后端的统一配置接口。
