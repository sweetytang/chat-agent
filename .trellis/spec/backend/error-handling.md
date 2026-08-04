# Error Handling

> How errors are handled in this project.

---

## Overview

<!--
Document your project's error handling conventions here.

Questions to answer:
- What error types do you define?
- How are errors propagated?
- How are errors logged?
- How are errors returned to clients?
-->

(To be filled by the team)

## lui-agent 鉴权跨层契约

### 1. 范围 / 触发条件

本契约适用于 `apps/lui-agent` 的登录、注册、退出、token 刷新，以及所有携带 Bearer token 的普通 API 和 fetch SSE 请求。鉴权状态同时跨越 FastAPI、PostgreSQL refresh token 表和 React/Zustand 前端，因此接口字段和失效行为必须保持一致。

### 2. 签名

- `POST /api/auth/register`：`{ email: string, password: string }` → `201 AuthResponse`
- `POST /api/auth/token`：`{ email: string, password: string }` → `200 AuthResponse`
- `POST /api/auth/refresh`：`{ refresh_token: string }` → `200 AuthResponse`
- `POST /api/auth/logout`：`{ refresh_token: string }` → `204`
- 前端 `fetchWithAuth(url, init, retryOnUnauthorized)`：普通 API 与 SSE 共用，401 时最多刷新并重试一次。

### 3. 契约

`AuthResponse` 必须包含：

```json
{
  "access_token": "短期 JWT",
  "token_type": "bearer",
  "refresh_token": "仅服务端 hash 持久化的随机 token"
}
```

- 登录、注册和刷新都必须返回两个 token。
- refresh token 轮换时旧 token 立即撤销，新 token 替换本地存储值。
- 前端并发遇到多个 401 时共享一个 refresh Promise，避免同一 refresh token 被重复轮换。
- refresh 失败、过期或已撤销时清除两个 token，Zustand 状态变为未登录，并提示“登录已过期，请重新登录”。
- SSE 初始请求 401 时必须使用相同刷新流程重新建立一次流；已经收到的事件不重复消费。

### 4. 校验与错误矩阵

| 条件 | 服务端 / 前端行为 |
| --- | --- |
| 邮箱格式或密码长度不合法 | FastAPI 返回 422 |
| 注册邮箱已存在 | 返回 409 |
| 登录凭证错误 | 返回 401 |
| refresh token 不存在、过期、撤销或轮换旧 token | 返回 401；前端清除会话并回到登录/注册入口 |
| 已登录请求 access token 过期 | 前端调用 refresh，成功后原请求只重试一次 |
| refresh 后原请求仍为 401 | 不再重试，交给调用方显示错误 |

### 5. 正确 / 基础 / 错误案例

- 正确：登录保存 access 和 refresh；access 过期时刷新并保存轮换后的两个 token。
- 基础：无 token 访问公开或 demo 链路，不主动发起 refresh。
- 错误：只保存 access token，或在每个 API 调用处各自实现 refresh，都会导致无法续期或 refresh token 竞争。

### 6. 必要测试

- 后端路由暴露 `/register`、`/token`、`/refresh`、`/logout`。
- refresh token 服务验证轮换后旧 token 不能再次使用，过期和撤销返回 `RefreshTokenError`。
- 前端 TypeScript 检查和生产构建必须通过。
- 前端请求层应覆盖：401→refresh→重试、并发 401 共享刷新、refresh 失败清除会话；SSE 应覆盖同样的 401 重连路径。

### 7. 错误与正确对照

#### 错误

```python
rotate_refresh_token(session, refresh_token=payload.refresh_token)
```

#### 正确

```python
rotate_refresh_token(session, raw_token=payload.refresh_token)
```

服务函数参数名是 `raw_token`；路由调用必须使用真实签名，否则刷新请求会在运行时抛 `TypeError`，而不是返回预期的 401/200。

---

## Error Types

<!-- Custom error classes/types -->

(To be filled by the team)

---

## Error Handling Patterns

<!-- Try-catch patterns, error propagation -->

(To be filled by the team)

---

## API Error Responses

<!-- Standard error response format -->

(To be filled by the team)

---

## Common Mistakes

<!-- Error handling mistakes your team has made -->

(To be filled by the team)
