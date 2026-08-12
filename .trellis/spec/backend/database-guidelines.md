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

async def first_qa_pairs(
    self,
    thread_ids: list[UUID],
) -> dict[UUID, tuple[Message, Message]]: ...
```

- `threads.title` remains nullable and stores at most 255 characters.
- `POST /api/threads` may omit `title`; new threads do not persist a placeholder title.

### 3. Contracts

- Generate the title only after a normal `send` produces exactly the first complete `user -> assistant` round.
- Use the configured chat provider to summarize both messages. Fake providers and provider failures use a deterministic local short-topic fallback.
- Existing non-empty custom titles are immutable. `null`, blank, and legacy `新对话` values are eligible.
- `GET /api/threads` lazily backfills eligible legacy rows from a single batched message query and never performs one model call per row.
- API clients render long titles with CSS ellipsis; they do not rewrite persisted title text.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| First round is incomplete | Keep title unset |
| Mode is `edit` or `regenerate` | Do not generate a title |
| Existing title is non-empty and not `新对话` | Preserve it |
| Provider returns unusable output or raises | Use local fallback; do not fail the completed run |
| Historical thread has no complete first pair | Leave title unchanged |
| Message content is not text | Skip historical backfill |

### 5. Good/Base/Bad Cases

- Good: a long troubleshooting question and its answer become a short topic summary.
- Base: the fake provider produces a deterministic topic and the sidebar truncates it visually when needed.
- Bad: storing the complete first question as the title or calling the provider once for every thread during list loading.

### 6. Tests Required

- Unit: output normalization, eligibility, first-round detection, provider fallback, and title immutability.
- Repository: one batched query returns only the first consecutive user/assistant pair per thread.
- Route: listing threads backfills legacy values and preserves existing titles.
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
    checkpoint.messages,
    mode=request.mode,
    user_content=prompt_content,
    assistant_content=assistant_content,
)
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
- DELETE 删除线程及其由外键 `ON DELETE CASCADE` 关联的 runs、messages、checkpoints 与 interrupts。
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
