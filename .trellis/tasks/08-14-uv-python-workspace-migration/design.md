# 双工作区迁移设计

## 目标目录

```text
.
├── .github/workflows/
│   ├── frontend.yml
│   └── backend.yml
├── Makefile
├── docker-compose.yml
├── frontend/
│   ├── package.json
│   ├── pnpm-workspace.yaml
│   ├── pnpm-lock.yaml
│   ├── apps/web/
│   └── packages/api-types/
│       ├── package.json
│       └── src/openapi.d.ts
└── backend/
    ├── pyproject.toml
    ├── uv.lock
    ├── .venv/
    ├── apps/api-server/
    │   ├── pyproject.toml
    │   ├── app/
    │   ├── migrations/
    │   └── tests/
    └── packages/lui-agent-runtime/
        ├── pyproject.toml
        ├── src/lui_agent_runtime/
        └── tests/
```

不创建空的 `frontend/packages/ui`、`utils`、后端 worker 或 db 包；新增包必须由真实职责驱动。

## 工作区所有权

| 边界 | 权威配置 | 锁文件 | 环境 |
| --- | --- | --- | --- |
| 前端 | `frontend/pnpm-workspace.yaml`、`frontend/package.json` | `frontend/pnpm-lock.yaml` | `frontend/node_modules` 与 pnpm store |
| 后端 | `backend/pyproject.toml` | `backend/uv.lock` | `backend/.venv` |
| 全栈 | 根 `Makefile`、`docker-compose.yml` | 无 | 只调用两个工作区 |

前端根 package 只提供聚合脚本；Web 保留应用依赖和构建配置。后端根是虚拟工作区项目，统一 Python `>=3.14` 和开发工具；API 应用通过 `tool.uv.sources` 的 `workspace = true` 依赖 `lui-agent-runtime`。

## 运行时包边界

```text
lui-agent-runtime
├── events      # BusinessEvent 与稳定业务事件转换
├── graph       # LangGraph 创建、流式适配与协议
└── tools       # 工具调用/结果抽象与默认工具
```

运行时包可以依赖 LangChain/LangGraph，但不能导入 API 应用的 FastAPI、SQLAlchemy、配置、数据库或认证模块。仅测试运行时本身的用例随包迁移；HTTP 与持久化集成测试留在 API 应用。

## HTTP DTO 数据流

```text
Pydantic/FastAPI app.openapi()
  → 离线 OpenAPI JSON
  → frontend/packages/api-types/scripts/generate_types.py
  → frontend/packages/api-types/src/openapi.d.ts（提交入库）
  → Web 通过 import type 使用
```

- 生成命令由根 Makefile 编排，不启动端口。
- `api-types` 是纯类型 pnpm workspace member，不包含运行时代码。
- 鉴权刷新、错误处理、请求路径和 SSE 事件仍由 Web 现有代码负责。
- `check-api-types` 重新生成后检查 Git 差异，防止后端契约更新但类型未同步。

## CI 数据流

- `frontend.yml` 使用原生 `paths` 触发：`frontend/**`、根 Makefile 和自身工作流；冻结安装后运行格式检查、lint、测试与构建。
- `backend.yml` 使用原生 `paths` 触发：`backend/**`、DTO 生成相关前端文件、根 Makefile、Compose 和自身工作流；运行 uv 检查、测试、迁移与 DTO 漂移。
- 后端 Schema 变化但未更新类型时，后端工作流失败；更新后的生成文件属于 `frontend/**`，自然触发前端工作流。
- 不添加部署 job、环境凭据或第三方路径过滤 Action。

## 迁移策略

1. 记录当前 Git 状态和 4 个主题文件的差异/哈希。
2. 只做物理目录移动并修正路径，先恢复原有测试和构建。
3. 建立 pnpm/uv 工作区和新锁文件，再验证依赖图。
4. 提取运行时包并迁移对应测试。
5. 建立 DTO 类型包和生成检查。
6. 删除 Prisma/SQLite 与确认无用的根 Node 资产。
7. 更新 Makefile、Compose、编辑器和 CI，执行全量回归。

目录移动和运行时抽取不与业务简化混合；若发现逻辑缺陷，只修复阻断迁移验证的问题，并遵循回归测试策略。

## 兼容与回滚

- API URL、端口、环境变量名、数据库迁移版本、HTTP/SSE payload 和前端别名保持不变。
- `.env` 与本地数据库卷不删除；Python 环境移至 `backend/.venv` 并由 uv 校验/重建。
- 迁移批次可通过反向移动恢复旧路径；配置文件使用小步补丁恢复，不使用 `git reset --hard`。
- Prisma/SQLite 已由用户确认废弃，删除后只通过 Git 历史恢复，不提供运行时兼容。
