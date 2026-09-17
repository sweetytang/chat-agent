# 实施步骤: MCP 模块极简重构

## Phase 1: 核心配置与后端数据模型重构
- [ ] 步骤 1.1: 在 `backend/apps/api-server/app/core/config.py` 中新增配置项 `enable_local_mcp` 和 `allowed_local_commands`。
- [ ] 步骤 1.2: 编写并应用 Alembic 数据库迁移脚本：移除旧的 4 张表，新建 `user_mcp_servers` 表。
- [ ] 步骤 1.3: 更新 `backend/apps/api-server/app/db/models.py` 中的 SQLAlchemy 实体定义。

## Phase 2: 安全校验与 API 瘦身
- [ ] 步骤 2.1: 实现 `app/modules/mcp/security.py` 中的 `validate_stdio_command` 方法。
- [ ] 步骤 2.2: 重构 `app/modules/mcp/router.py` 与 `app/modules/mcp/schemas.py`：
  - 支持全量导入/保存 `mcpServers` JSON 配置；
  - 提供单表 CRUD 接口；
  - 接入 `validate_stdio_command` 校验。
- [ ] 步骤 2.3: 彻底清理旧的 Service/Router 冗余代码。

## Phase 3: 运行时动态加载与降级
- [ ] 步骤 3.1: 重构 `app/modules/mcp/agent/runtime.py`：基于 `user_mcp_servers` 动态并发加载可用工具。
- [ ] 步骤 3.2: 结合 `tool_rules` 应用工具开关与审批权限。
- [ ] 步骤 3.3: 支持单服务故障告警降级，在流中发出 `mcp.warning` 事件并通知前端。

## Phase 4: 前端纯 JSON 编辑器改造
- [ ] 步骤 4.1: 移除 `frontend/apps/web/src/modules/mcp/components/McpSettings/AddServerForm.tsx` 等可视化表单。
- [ ] 步骤 4.2: 改造 `McpSettings` 弹窗与 `AddServerPanel.tsx`，全面支持纯 JSON 编辑、保存与错误反馈。
- [ ] 步骤 4.3: 更新前端 API 客户端和类型定义。

## Phase 5: 验证与验收
- [ ] 步骤 5.1: 编写/更新后端 MCP 单元测试与端到端测试。
- [ ] 步骤 5.2: 验证全量回归测试通过，更新任务文档。
