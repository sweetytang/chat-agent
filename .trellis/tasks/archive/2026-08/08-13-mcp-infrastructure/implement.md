# MCP stdio 沙箱与对象存储实施计划

1. orchestrator/proxy 协议与 fake adapter。
2. Docker 代理白名单、标签与容器安全参数。
3. stdio 双向流、健康、回收、强停与孤儿清理。
4. MinIO Compose、S3 adapter、对象元数据和授权下载。
5. 7 天清理任务与失败重试。
6. 权限、资源隔离、不可用降级和集成测试。

回滚：禁用 stdio 与媒体结果；绝不回退为宿主机执行或 base64 入库。
