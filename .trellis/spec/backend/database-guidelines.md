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
