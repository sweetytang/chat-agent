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
Regarding the code style, See `docs/agents/project-arch.md`
<!-- CODE STYLE -->


<!-- PROJECT ARCH -->
Regarding the project architecture design, See `docs/agents/project-arch.md`
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
