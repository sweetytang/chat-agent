# 总体设计

## 架构目标

```text
Git Root
├── Makefile / docker-compose.yml / .github/workflows
├── frontend/                 # pnpm workspace
│   ├── apps/web
│   └── packages/api-types
└── backend/                  # uv workspace
    ├── apps/api-server
    └── packages/lui-agent-runtime
```

Git 根只编排，不参与任一语言的依赖解析。前端和后端分别拥有唯一锁文件；跨语言唯一生成关系是后端 OpenAPI 到前端 DTO 类型文件。

## 任务边界

1. `uv-python-workspace-migration` 负责物理移动、工作区配置、运行时拆包、DTO 生成、旧 Prisma 删除、根编排和 CI。
2. `business-code-refactor` 依赖前一个子任务验收通过，负责格式化、死代码清理、超限文件拆分和分级缺陷修复。
3. 父任务不直接实现业务代码，只做跨子任务合同和最终集成验收。

## 跨任务不变量

- 4 个主题文件以当前内容为基线直接迁移。
- MCP V1 开发暂停；结构调整不得改变现有 API、事件、状态机或安全行为。
- HTTP DTO 由后端生成，HTTP 请求与 SSE 客户端继续手写。
- 数据库权威链路始终是 PostgreSQL、SQLAlchemy 和 Alembic。
- 任何行为修复必须有回归测试并与机械改动分批。

## 交付与回滚

- 每个子任务独立检查和提交，迁移提交先于重构提交。
- 迁移失败时反向移动目录并恢复工作区配置，不使用破坏性 Git 重置；主题文件通过迁移前后的差异和内容哈希核对。
- 重构按模块小步提交；单批失败只回退该批，不回退已经验收的工作区迁移。
- 两个子任务完成后从 Git 根执行全量检查，并浏览器验证关键链路。
