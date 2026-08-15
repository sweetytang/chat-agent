# 双工作区迁移执行计划

## 1. 基线与保护

- [ ] 记录 `git status`，保存 4 个主题文件的 staged diff 与内容哈希。
- [ ] 运行现有前端测试/build 与后端测试/迁移检查；记录任何既有失败。
- [ ] 搜索所有旧路径、根 Node、Prisma、SQLite、Makefile、Compose、VS Code 和 CI 引用。

回滚点：尚未移动文件，任何基线阻断先解决或明确记录。

## 2. 物理目录迁移

- [ ] 创建顶层 `frontend/`、`backend/` 布局，将 Web 移至 `frontend/apps/web`，API 移至 `backend/apps/api-server`。
- [ ] 将本地 Python 环境定位到 `backend/.venv`，更新忽略规则；不得丢失 `.env`。
- [ ] 更新 Vite、Alembic、Pytest、Ruff、Mypy、VS Code 和测试中的旧路径。
- [ ] 逐项核对 4 个主题文件的新路径内容与迁移前 diff。
- [ ] 在尚未拆包时恢复前端测试/build 和后端测试。

回滚点：反向移动目录并恢复路径补丁；主题文件以迁移前哈希/diff 校验。

## 3. 建立工作区

- [ ] 创建前端根 package 与 `pnpm-workspace.yaml`，纳入 `apps/*`、`packages/*`，生成唯一前端锁文件。
- [ ] 创建后端根 `pyproject.toml`，纳入 `apps/*`、`packages/*`，迁移依赖并生成唯一 uv 锁文件。
- [ ] 删除旧根 package/workspace/lock 的业务职责，确认 Git 根不再被 pnpm 或 uv 识别为语言工作区。
- [ ] 验证 pnpm filter 和 uv member 命令从各自根目录执行。

回滚点：恢复旧语言配置并删除尚未使用的新工作区配置。

## 4. 提取 `lui-agent-runtime`

- [ ] 建立可安装的 `src/lui_agent_runtime` 包和独立 `pyproject.toml`。
- [ ] 移动业务事件、图运行时和工具抽象，更新公开导出与 API 应用导入。
- [ ] 将纯运行时测试迁入包；保留 HTTP/数据库集成测试在 API 应用。
- [ ] 添加依赖方向检查或导入测试，证明运行时包不依赖 API 应用。
- [ ] 分别运行 runtime 与 API 测试。

回滚点：恢复原 `app` 模块与导入，移除 workspace dependency。

## 5. HTTP DTO 类型包

- [ ] 建立 `@lui-agent/api-types` 纯类型 workspace package。
- [ ] 添加从 `app.openapi()` 离线导出 Schema 的后端脚本和可重复的 TypeScript DTO 生成脚本。
- [ ] 将普通 HTTP DTO 消费点切换到生成类型；删除对应手写 DTO，保留业务领域类型与 SSE 类型。
- [ ] 添加 `generate-api-types` 与 `check-api-types` 根命令，验证重复生成无差异。
- [ ] 在后端不监听端口时运行前端类型检查和构建。

回滚点：恢复手写 DTO 引用并移除生成包，不改动请求层和 SSE。

## 6. 清理与统一编排

- [ ] 删除 Prisma schema/config/client、Prisma/Better SQLite 依赖、`database/index.db` 和专用辅助配置。
- [ ] 审计并删除确认无消费者的根 TypeScript/config/tsconfig 资产，更新失效说明引用。
- [ ] 将有效 Makefile 和 Docker Compose 移到 Git 根并更新统一命令。
- [ ] 添加 `frontend.yml`、`backend.yml`，使用冻结锁文件安装和原生路径触发。

回滚点：清理前确认删除清单；用户已确认的 Prisma 资产可由 Git 历史恢复，其他资产仅在有审计证据时删除。

## 7. 验证

```bash
cd frontend && pnpm install --frozen-lockfile
cd frontend && pnpm format:check
cd frontend && pnpm lint
cd frontend && pnpm test
cd frontend && pnpm build

cd backend && uv sync --locked
cd backend && uv run ruff format --check apps packages
cd backend && uv run ruff check apps packages
cd backend && uv run mypy apps/api-server/app packages/lui-agent-runtime/src
cd backend && uv run pytest -q

make check-api-types
make db-migrate
make test
make build
```

- [ ] 验证服务启动和前端代理/端口。
- [ ] 浏览器验证登录、线程、运行、审批、主题和 MCP 设置页面。
- [ ] 搜索旧路径及 Prisma/SQLite 标识，确认只剩明确的历史研究记录。
- [ ] 运行 Trellis check，更新必要规范后提交迁移子任务。
