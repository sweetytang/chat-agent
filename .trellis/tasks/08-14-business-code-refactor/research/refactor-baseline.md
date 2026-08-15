# 业务重构基线调研

## 规模与热点

- 后端业务代码约 5109 行，最大文件为 `app/api/runs.py`，约 900 行。
- 前端 TypeScript/TSX/SCSS 约 4248 行，`McpSettings/index.tsx` 约 631 行，`useMcpSettings.ts` 约 541 行。
- 以上三个文件超过项目 500 行提醒阈值，是首轮职责拆分对象。

## 现有质量能力

- 后端：Ruff 负责格式、导入、未使用符号和常见简化；Mypy 检查业务类型；Pytest 覆盖 API、数据库、图、事件、鉴权、线程、审批和 MCP；Alembic 有迁移测试。
- 前端：Prettier、ESLint、Stylelint、TypeScript 严格模式、Node 测试和 Vite build 已配置；`noUnusedLocals`、`noUnusedParameters` 与 ESLint 未使用变量规则可发现局部死代码。
- 前端视觉与主题行为由 `.trellis/spec/frontend/visual-system.md` 约束，当前 4 个主题改动必须视为基线而非待还原内容。

## 清理策略

- 第一层：格式化、导入排序、未使用符号和缓存产物，使用现有工具机械处理。
- 第二层：通过 `rg`、入口、路由注册、配置、测试和生成链路审计未引用模块；用户确认或证据充分后直接删除。
- 第三层：拆分超限文件，保持公开函数、DTO、事件和状态更新顺序不变。
- 第四层：仅按用户确认的分级策略修复缺陷，先增加回归测试并与纯重构分批。

## 不变量

- HTTP/SSE 合同、事件 sequence、鉴权刷新、数据库所有权与迁移行为不变。
- MCP V1 不新增能力；只允许等价结构调整。
- 前端组件继续与 CSS Module 同目录，模块导入顺序遵循项目要求。
