# Chat Agent LangGraph 重构归档

## 1. 原理

- 真正的问题不是“有没有用 LangGraph”，而是之前仍然保留了自建 `Express` 服务器和手写运行时。
- 只要后端还自己维护 `run / state / history / auth / sse` 这些入口，复杂度就不会真正降下来。
- 这次回到最本质的方案：
  - 让 `LangGraph Server` 直接托管 graph
  - 前端直接消费 LangGraph 标准 API
  - 项目不再维护自定义聊天后端协议层

## 2. 方案

- 新增 `langgraph.json`，把 `simpleAgent` 直接注册为 LangGraph graph。
- 删除 `Express` 入口、controller、route、auth、thread repository、自定义 checkpoint saver。
- 前端保留现有聊天 UI，但改成：
  - `useStream` 直接连 LangGraph CLI 服务
  - 线程列表 / 删除 / history 走 `@langchain/langgraph-sdk`
  - 不再依赖 `/auth/*`
- 运行时开关不再靠自定义请求体解析，改成通过 LangGraph run 的 `context` 透传。

## 3. 执行

- `backend/services/ai/agent.ts` 改成 LangGraph Server 可直接加载的 graph 入口。
- 用 middleware 在单一 graph 内处理：
  - HITL 审核
  - generative UI / structured output 展示型 tool 终止
  - deep thinking / generative UI / structured output 的运行时切换
- `apps/chat-agent/package.json` 改成由 `langgraphjs dev` 启动服务。
- 前端移除登录页和 token 依赖，线程数据改走 LangGraph SDK。
- 删除原有 Express 和自定义后端运行时代码。

## 4. 当前结果

- `apps/chat-agent` 现在可以直接由 `@langchain/langgraph-cli dev` 托管 graph。
- 本地已确认：
  - `langgraphjs dev --config ./langgraph.json --no-browser --port 2025`
  - graph `chat_agent` 能被成功注册并启动
- 已完成的验证：
  - `pnpm --dir apps/chat-agent exec tsc --noEmit`
  - `apps/chat-agent` build
