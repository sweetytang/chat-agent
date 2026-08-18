# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

<!-- How to create and run migrations -->

(To be filled by the team)

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

(To be filled by the team)

## 场景：SQLAlchemy Enum 与 Alembic 列类型一致

### 1. Scope / Trigger

- 新增或修改 enum 字段，或排查 PostgreSQL `type "..." does not exist`。

### 2. Signatures

```python
def string_enum(enum_type: type[enum.Enum], *, name: str, length: int) -> Enum:
    return Enum(enum_type, name=name, native_enum=False, create_constraint=False, length=length)
```

### 3. Contracts

- Alembic 使用 `sa.String` 的 enum 字段，ORM 必须使用 `native_enum=False`。
- 已发布迁移不可只通过修改 ORM 改成原生 PostgreSQL enum。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|---|---|
| 迁移为 VARCHAR、ORM 为原生 Enum | 禁止；asyncpg 会生成 `::enum_name` 并报 500 |
| 两端均为 VARCHAR enum | 查询、写入正常 |
| 需要原生 enum | 新迁移显式创建/转换类型，并覆盖升级与降级 |

### 5. Good/Base/Bad Cases

- Good：模型和迁移均明确使用 VARCHAR enum。
- Base：新枚举值只需应用发布，不依赖数据库类型 ALTER。
- Bad：仅在 SQLite/fake session 测试，未检查 PostgreSQL 编译 SQL。

### 6. Tests Required

- 模型列断言 `native_enum is False`。
- 迁移 upgrade/downgrade 测试。
- 至少一个 PostgreSQL 编译或真实查询测试，断言没有 `::mcp_scope`。

### 7. Wrong vs Correct

```python
# Wrong: migration is VARCHAR, ORM assumes PostgreSQL enum
mapped_column(Enum(McpScope, name="mcp_scope"))

# Correct
mapped_column(string_enum(McpScope, name="mcp_scope", length=16))
```

## 场景：MCP 动态工具默认审核

### 1. Scope / Trigger

- 将数据库中的 MCP Tool 动态绑定到 Agent graph。

### 2. Signatures

```python
stream_graph_events(..., approval_tool_names: frozenset[str])
```

### 3. Contracts

- MCP Tool Call 必须先产生并持久化 interrupt，ToolNode 不得提前执行。
- interrupt 冻结 internal/remote name、arguments、server_id 和 security_version。
- approve/edit 后才调用；reject 不调用；安全版本变化返回 409。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|---|---|
| MCP call 未审核 | 只发 approval event，不执行 |
| approve/edit | 校验当前安全版本后执行 |
| reject | 返回拒绝结果，不执行 |
| server security_version 变化 | 409，旧审核失效 |

### 5. Good/Base/Bad Cases

- Good：模型选择写工具后 UI 先显示审核卡片。
- Base：读工具仍按 V1 默认审核策略处理。
- Bad：把 MCP StructuredTool 与内置工具一起直接交给 ToolNode。

### 6. Tests Required

- Graph 测试断言审核前 caller 调用次数为 0。
- approve/edit/reject 测试及安全版本失效测试。

### 7. Wrong vs Correct

```python
# Wrong
ToolNode([*builtin_tools, *mcp_tools])

# Correct: router sends MCP calls to interrupt first
stream_graph_events(..., approval_tool_names=frozenset(mcp_tool_names))
```

## Scenario: Thread title generation from the first completed round

### 1. Scope / Trigger

- Trigger: creating, completing, listing, or searching persisted LUI Agent threads.
- A thread title is a concise summary of the first completed user/assistant round, not a copy of the first user message.

### 2. Signatures

```python
async def generate_thread_title(user_content: str, assistant_content: str) -> str | None: ...

async def set_title_after_first_round(
    thread: ThreadWithTitle,
    messages: Sequence[dict[str, Any]],
    *,
    mode: str,
    user_content: str,
    assistant_content: str,
) -> bool: ...

```

- `threads.title` remains nullable and stores at most 255 characters.
- `POST /api/threads` may omit `title`; new threads do not persist a placeholder title.

### 3. Contracts

- Generate the title only after a normal `send` produces exactly the first complete `user -> assistant` round.
- Use the configured chat provider to summarize both messages. Fake providers and provider failures use a deterministic local short-topic fallback.
- Existing non-empty custom titles are immutable. `null`, blank, and legacy `新对话` values are eligible.
- 标题输入从 checkpoint timeline 派生的第一个完整 `user -> assistant` 逻辑消息对读取；多个 assistant 文本段按 `logical_message_id` 合并。
- `GET /api/threads` 不回填旧 messages 数据，也不依赖已删除的 messages 表。
- API clients render long titles with CSS ellipsis; they do not rewrite persisted title text.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| First round is incomplete | Keep title unset |
| Mode is `edit` or `regenerate` | Do not generate a title |
| Existing title is non-empty and not `新对话` | Preserve it |
| Provider returns unusable output or raises | Use local fallback; do not fail the completed run |
| Timeline 未形成完整首轮 | Leave title unchanged |
| 非消息条目夹在 assistant 文本段之间 | 只合并同 `logical_message_id` 的文本内容 |

### 5. Good/Base/Bad Cases

- Good: a long troubleshooting question and its answer become a short topic summary.
- Base: the fake provider produces a deterministic topic and the sidebar truncates it visually when needed.
- Bad: storing the complete first question as the title or calling the provider once for every thread during list loading.

### 6. Tests Required

- Unit: output normalization, eligibility, first-round detection, provider fallback, and title immutability.
- Projector: timeline 只派生第一个完整 user/assistant 逻辑消息对。
- Route: listing threads does not query or backfill deleted message history.
- Run integration: the first successful send persists the title; later sends, edits, and regenerations do not overwrite it.

### 7. Wrong vs Correct

#### Wrong

```python
thread.title = first_user_message[:255]
```

#### Correct

```python
await set_title_after_first_round(
    thread,
    model_messages(recorder.snapshot),
    mode=request.mode,
    user_content=prompt_content,
    assistant_content=assistant_content,
)
```

## 场景：Timeline checkpoint 是唯一会话持久化

### 1. Scope / Trigger

- 修改 checkpoint、会话内容 API、运行收尾、分支或 messages 数据模型。

### 2. Signatures

```text
checkpoints.state = { "timeline": { "version": 1, "items": [...] } }
GET /api/threads/{thread_id}/timeline -> ThreadTimelineResponse
0006_drop_messages.upgrade() -> drop messages
0006_drop_messages.downgrade() -> RuntimeError
```

### 3. Contracts

- checkpoint state 顶层只能包含 `timeline`；旧 `{messages: ...}` 状态明确拒绝。
- 每次 agent 尝试拥有独立 checkpoint，只更新当前尝试，不修改祖先。
- `TimelineRecorder` 从 checkpoint 最新 state 初始化，忽略可能过期的内存 branch snapshot。
- 跨 HTTP/SSE 请求的内存状态应优先保存 ID 和不可变快照；其中的 SQLAlchemy ORM 实例必须视为 detached，不得直接持久化。恢复请求必须用已鉴权 Run 的 `thread_id + checkpoint_id` 在当前 Session 重载 checkpoint。
- 完成、审批中断、失败、取消和连接断开都必须 flush；连接断开保留部分内容并追加可重试错误。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|---|---|
| state 顶层包含 timeline 以外字段 | `ValueError` / API 409 |
| timeline version 不是 1 | `ValueError` / API 409 |
| 恢复上下文的 snapshot 旧于 checkpoint | 以 checkpoint state 为准 |
| 持久化审批恢复时无当前 Session | API 503 |
| 审批 checkpoint 已删除或不属于已鉴权线程 | API 409，不使用内存 detached 对象继续 |
| 连接非显式取消地断开 | run 置 cancelled，保留部分 timeline 并记录中断错误 |
| 执行 0006 downgrade | 拒绝，不伪造已删除数据 |

### 5. Good / Base / Bad Cases

- Good：运行中断开后重新打开会话，已生成推理、文本和工具状态仍按原顺序存在。
- Base：新会话从空 timeline 创建 user checkpoint 和 agent checkpoint。
- Bad：收尾时用创建 run 时的空 snapshot 覆盖 checkpoint，或在新请求中修改 `PendingReview` 保存的 detached checkpoint。

### 6. Tests Required

- timeline v1 验证、上下文派生和分支投影单测。
- recorder 新鲜快照、delta flush、失败/取消/断连终态回归。
- 审批恢复跨 Session 回归：关闭首个 Session 制造 detached checkpoint，在新 Session 完成 resume，再用第三个 Session 断言 tool/result/assistant 终态已落库。
- timeline API 所有权、非法 checkpoint 409 和分支元数据测试。
- Alembic upgrade 断言 messages 表删除，downgrade 断言不可逆。

### 7. Wrong vs Correct

```python
# Wrong: detached ORM object belongs to the previous request Session
resumed_context = pending.branch_context

# Correct: reload through the authenticated run in the current Session
checkpoint = await repository.get_checkpoint(persisted_run.thread_id, checkpoint_id)
resumed_context = replace(pending.branch_context, checkpoint=checkpoint)
```

## 场景：线程重命名、置顶与删除

### 1. Scope / Trigger

- 触发：侧边栏线程菜单执行 Rename、Pin/Unpin 或 Delete。
- 这些操作属于用户线程资源，必须跨 FastAPI、SQLAlchemy/PostgreSQL、前端 API 与 Zustand store 保持一致。

### 2. Signatures

```text
PATCH /api/threads/{thread_id}
body: { title?: string, is_pinned?: boolean }
response: ThreadResponse

DELETE /api/threads/{thread_id}
response: 204 No Content
```

```python
class ThreadResponse(BaseModel):
    id: UUID
    title: str | None
    is_pinned: bool
    current_checkpoint_id: UUID | None
```

- 数据库：`threads.is_pinned BOOLEAN NOT NULL DEFAULT false`。
- 迁移：`0003_thread_pinning`，降级时删除该字段。

### 3. Contracts

- PATCH 至少提供一个字段；省略字段不得覆盖原值。
- title 保存前去除首尾空白，最大 255 字符；手工 Rename 后不再被首轮自动摘要覆盖。
- 列表排序固定为 `is_pinned DESC, updated_at DESC`，前端直接消费后端顺序。
- DELETE 删除线程及其由外键 `ON DELETE CASCADE` 关联的 runs、checkpoints 与 interrupts。
- PATCH 和 DELETE 都先用 `(thread_id, user_id)` 查询所有权；不可见资源统一返回 404。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|---|---|
| PATCH body 无可更新字段 | 422 |
| title 为空或仅空白 | 422 |
| title 超过 255 字符 | 422 |
| thread 不存在或不属于当前用户 | 404 |
| 合法部分更新 | 只更新传入字段并返回完整 ThreadResponse |
| 合法删除 | 提交事务并返回 204 |

### 5. Good/Base/Bad Cases

- Good：置顶线程排在顶部，重命名立即同步侧栏、搜索结果和当前标题。
- Base：只传 `is_pinned` 时保留已有 title；只传 title 时保留 pin 状态。
- Bad：前端自行排序、用空字符串清除标题，或删除当前线程后继续展示旧消息。

### 6. Tests Required

- Schema：空 payload、空白标题、长度上限和合法部分更新。
- Repository：置顶排序、字段保留与删除语句。
- Route：所有权 404、PATCH commit、DELETE 204 与 commit。
- Migration/model：字段非空、默认 false、upgrade/downgrade 可逆。
- Frontend：菜单项顺序、删除当前线程时中止流/重置投影/加载下一线程。

### 7. Wrong vs Correct

#### Wrong

```python
# 省略 title 时误清空标题，且没有所有权检查
thread.title = payload.title
```

#### Correct

```python
thread = await repository.get_owned(thread_id, user_id)
if thread is None:
    raise HTTPException(status_code=404, detail="线程不存在")
await repository.update(thread, title=payload.title, is_pinned=payload.is_pinned)
```
