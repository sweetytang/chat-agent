<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

<!-- CODE STYLE -->

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
<!-- CODE STYLE -->


<!-- PROJECT ARCH -->
# 你是全栈架构和工程化专家，开始优化当前项目。
> 严格要求：
## 1. 分析代码的功能，按照功能放置到对应的文件夹下，如果文件夹不存在，则创建。其中项目基本目录如下：
    * frontend: 前端项目源码
        * app: 整体功能、框架入口
        * store: 全局状态
        * components: 组件
        * constants: 常量
        * hooks: 钩子
        * services: 服务
        * styles: 样式
        * types: 类型
        * public: 项目公共资源
        * utils: 工具
        * tests: 项目测试
        * pages: 页面
        * scripts: 项目脚本
        * pack: 打包构建
            * vite.config.ts: vite配置文件
            * webpack.config.js: webpack配置文件
    
    * backend: 后端python项目源码
        fastapi-project/
        ├── app/
        │   ├── main.py
        │   │
        │   ├── api/
        │   │   ├── router.py
        │   │   └── dependencies.py
        │   │
        │   ├── core/
        │   │   ├── config.py
        │   │   ├── security.py
        │   │   ├── exceptions.py
        │   │   ├── exception_handlers.py
        │   │   ├── logging.py
        │   │   └── middleware.py
        │   │
        │   ├── db/
        │   │   ├── base.py
        │   │   ├── session.py
        │   │   └── transaction.py
        │   │
        │   ├── modules/
        │   │   ├── users/
        │   │   │   ├── router.py
        │   │   │   ├── schemas.py
        │   │   │   ├── models.py
        │   │   │   ├── service.py
        │   │   │   ├── repository.py
        │   │   │   ├── dependencies.py
        │   │   │   ├── exceptions.py
        │   │   │   └── constants.py
        │   │   │
        │   │   ├── auth/
        │   │   │   ├── router.py
        │   │   │   ├── schemas.py
        │   │   │   ├── service.py
        │   │   │   ├── dependencies.py
        │   │   │   └── exceptions.py
        │   │   │
        │   │   └── conversations/
        │   │       ├── router.py
        │   │       ├── schemas.py
        │   │       ├── models.py
        │   │       ├── service.py
        │   │       ├── repository.py
        │   │       └── dependencies.py
        │   │
        │   ├── integrations/
        │   │   ├── redis/
        │   │   │   └── client.py
        │   │   ├── llm/
        │   │   │   ├── client.py
        │   │   │   └── providers/
        │   │   ├── storage/
        │   │   │   └── s3.py
        │   │   └── messaging/
        │   │       └── rabbitmq.py
        │   │
        │   ├── common/
        │   │   ├── enums.py
        │   │   ├── pagination.py
        │   │   ├── responses.py
        │   │   ├── types.py
        │   │   └── utils.py
        │   │
        │   └── workers/
        │       ├── celery_app.py
        │       └── tasks/
        │           └── conversation_tasks.py
        │
        ├── tests/
        │   ├── conftest.py
        │   ├── unit/
        │   │   ├── users/
        │   │   └── auth/
        │   ├── integration/
        │   │   ├── users/
        │   │   └── conversations/
        │   └── e2e/
        │
        ├── migrations/
        │   ├── versions/
        │   ├── env.py
        │   └── script.py.mako
        │
        ├── scripts/
        │   ├── create_admin.py
        │   └── seed_data.py
        │
        ├── docs/
        │   └── architecture.md
        │
        ├── .env
        ├── .env.example
        ├── alembic.ini
        ├── pyproject.toml
        ├── Dockerfile
        ├── docker-compose.yml
        ├── Makefile
        └── README.md

## 2. 项目架构：
    * 前端:
        * 组件库：react、react-dom
        * 样式：sass、css modules
        * 状态管理：useState + zustand。单一的内部状态用useState，多处复用的状态量统一到src/store
        * 打包构建：vite
        * 类型：typescript
        * 大模型：langchain、langgraph、langsmith
    * 后端:
        * 数据库：postgresql
        * 服务器: fastapi
        * 大模型：langchain、langgraph、langsmith
<!-- PROJECT ARCH -->


<!-- REQUIREMENTS -->
## 1. All generated documents are in Chinese.

## 2. 前端代码文件内引用模块顺序：
    * 1.node_modules模块
    * 2.项目外部模块
    * 3.项目内部模块
        * 1.全局状态类
        * 2.方法类
        * 3.常量
        * 4.类型
        * 5.样式

## 3. 前端组件应该和样式放在一起（除了全局样式），组件文件夹里包含对应组件index.tsx和对应样式index.module.scss。

## 4. 代码结构清晰，易于维护，注释清晰，易于理解。难以理解的代码，添加注释，解释代码的功能。

## 5. 对于行数大于500行的单文件，遵循单一职责原则和可读性，尝试进行拆分

## 6. 项目文档、项目测试定期维护，确保其与代码同步。

## 7. 最重要的一点：时刻保证项目的正常运行，重构前后表现一致
<!-- REQUIREMENTS -->

## Agent skills

### Issue tracker

Issues for this repo are tracked in GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

This repo uses a multi-context domain-doc layout with a root `CONTEXT-MAP.md` pointing to context-specific `CONTEXT.md` files. See `docs/agents/domain.md`.
