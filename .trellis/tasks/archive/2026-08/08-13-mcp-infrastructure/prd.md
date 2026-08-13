# MCP stdio 沙箱与对象存储

## Goal

为受控 stdio MCP 提供独立 Docker 容器沙箱，为二进制 Tool Result 提供私有 S3/MinIO 存储与生命周期管理。

## Requirements

- 实现 `StdioSandboxOrchestrator` port、fake adapter 和最小权限 Docker 编排代理。
- 代理只接受批准定义 ID，限制镜像、标签、网络、卷、权限和容器操作范围。
- stdio container 默认 non-root、read-only、tmpfs、无网络、无 bind/Docker socket、cap-drop ALL，并限制 CPU/内存/PID/时长。
- 实现代理双向流到 MCP custom transport、健康检查、idle/异常/强制终止和孤儿清理。
- 实现 `ObjectStorage` port、S3-compatible adapter、本地 MinIO、私有 bucket、鉴权预签名 URL、7 天保留和幂等清理。

## Acceptance Criteria

- [ ] stdio 不能在宿主机直接执行，普通用户不能改变容器安全配置。
- [ ] 代理不能管理白名单外镜像或非 MCP 容器。
- [ ] 沙箱资源/网络/挂载限制与异常清理通过测试。
- [ ] 二进制对象不进入 PostgreSQL/SSE，归属校验与过期清理生效。
- [ ] Docker/S3 不可用时返回受控错误，不做不安全降级。

## Dependencies

- 等待 `08-13-mcp-core-host` 的 definition、transport/storage ports、limits 和 audit 合同稳定。

## Out of Scope

- Kubernetes adapter、任意宿主机路径挂载、普通用户自定义镜像/命令。
