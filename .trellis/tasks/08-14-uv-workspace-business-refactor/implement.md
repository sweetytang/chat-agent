# 总体执行计划

## 执行顺序

- [ ] 审核并批准本父任务及两个子任务的最终规划。
- [ ] 启动并执行 `08-14-uv-python-workspace-migration`，完成检查、规范更新和独立提交。
- [ ] 确认迁移子任务所有验收项通过后，启动 `08-14-business-code-refactor`。
- [ ] 完成业务重构的分批检查、规范更新和独立提交。
- [ ] 父任务执行最终集成：根命令、双锁文件、DTO 漂移、数据库迁移、前后端全量检查和关键浏览器链路。
- [ ] 确认 4 个主题文件完整保留，MCP V1 未被扩展，然后归档父任务树。

## 最终质量门禁

```bash
make install
make check
make test
make build
make db-migrate
make check-api-types
```

- GitHub Actions 前端与后端工作流通过。
- 浏览器验证登录、线程列表与历史、发送/停止、审批恢复、主题切换和 MCP 设置页面。
- `rg` 确认不存在旧 `apps/lui-agent` 运行路径、Prisma/Better SQLite 依赖和失效根脚本。

## 停止条件

- 迁移检查未通过时不得进入业务重构。
- 用户主题改动无法逐项对应到新路径时立即停止移动并恢复该批。
- 发现会改变公共合同但不属于已批准缺陷策略的修改时返回规划阶段。
