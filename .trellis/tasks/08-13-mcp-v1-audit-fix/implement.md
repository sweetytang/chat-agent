# MCP V1 全面审核与修复实施计划

1. 建立 `/api/mcp/servers` 真实数据库回归测试，修复 enum/迁移漂移并验证现有库与空库。
2. 审核并重构 MCP repository/service/API，补 CRUD、幂等开关、权限、状态、刷新和错误映射。
3. 实现可注入 MCP HTTP client、工具发现/catalog 同步、Mapper 与 Schema 执行校验。
4. 将用户启用工具解析为 run 快照并接入 graph；完善默认 HITL、安全版本和错误事件。
5. 审核 stdio 沙箱、对象存储和结果标准化，补缺失测试和受控不可用行为。
6. 完善前端创建表单、两级开关、状态/风险/错误/刷新交互并修复重复请求。
7. 执行后端 MCP、数据库迁移与核心回归，执行前端 lint/type/test/build。
8. 使用本地 PostgreSQL 和浏览器走通登录、空列表、创建、启用、发现、工具切换和错误恢复。
9. 执行 Trellis 全量检查，修复全部问题，更新必要规范并归档。

## 验证命令

```bash
cd apps/lui-agent/backend && uv run alembic upgrade head && uv run pytest
cd apps/lui-agent/frontend && pnpm lint && pnpm test && pnpm build
git diff --check
```

## Review Gates

- 数据库真实回归由红转绿后才进入 Host/Agent 修复。
- API contract tests 通过后才调整前端。
- 所有 V1 验收项有自动化测试或浏览器证据后才归档。
