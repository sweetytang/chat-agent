# MCP stdio 沙箱与对象存储设计

FastAPI 通过最小权限编排代理而非 Docker Socket 控制容器。代理从只读批准清单解析 definition，拒绝自由 Docker payload，只允许专用标签容器。双向 attach stream 被适配为 MCP SDK custom transport。

对象存储通过 `ObjectStorage` port；S3 adapter 使用私有 bucket，对象元数据保存在 PostgreSQL，下载前校验 user/run/tool_call 归属再签发短期 URL。清理任务按 expires_at 幂等执行。

默认测试使用 fake orchestrator/storage；Docker daemon 与 MinIO/S3 真机属于独立集成测试。
