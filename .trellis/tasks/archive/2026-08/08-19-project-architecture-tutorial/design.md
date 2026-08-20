# 教程设计

## 教程主线

教程以“用户输入一条普通消息”为主线，先给整体地图，再沿调用链由前到后解释：

```text
React Chat
  -> RunRequest
  -> POST /api/runs/stream
  -> run_events
  -> AgentDriver / LangGraph / LLM / tools
  -> BusinessEvent + TimelineRecorder + checkpoint
  -> SSE
  -> streamAgentEvents
  -> useRunStore.reduceRunEvent
  -> reduceTimeline
  -> ChatTimeline
```

## 内容边界

- 前端：入口、模块结构、线程状态、运行状态、SSE、事件归约、展示组件。
- 后端：FastAPI factory、API 路由、运行编排、runtime adapter、LLM provider、数据库模型、checkpoint/timeline。
- 跨层：事件合同、稳定 ID、sequence、流式与持久化一致性。
- 特殊流程：MCP 工具审批、interrupt resume、取消、分支编辑/重新生成。
- 操作：安装、数据库、启动、测试、类型契约检查。

## 解释原则

1. 先讲职责，再讲文件，再讲关键代码行为。
2. 用少量伪代码表达调用关系，不复制大段实现。
3. 对“状态”明确标注来源：浏览器、进程内存、数据库或事件流。
4. 每个复杂概念都配一个新手可以验证的源码入口。

## 关键取舍

- 不把前端 `timeline` 说成数据库原始消息表；它是事件/快照投影。
- 不把 `lui-agent-runtime` 说成完整业务层；它提供模型图和事件适配协议，业务编排仍在 API server。
- 不把当前 `_thread_locks`、`_cancel_events`、`_pending_reviews` 说成跨进程可靠队列；它们是当前进程级运行控制结构。
- 不假设所有请求都必须持久化：demo thread 和持久化线程的路径不同。
