# 推理标记接入说明

## 1. 什么是“推理标记”

推理模型在输出最终答案之前，通常会先做一轮内部思考。LangChain 会把这类输出标准化成 `contentBlocks`，其中：

- `type: "reasoning"` 表示思考摘要
- `type: "text"` 表示最终回答正文

这意味着我们不应该再把 AI 输出简单看成一段字符串，而是要把它当成“由多种内容块组成的消息”。

## 2. 这个子项目为什么之前看不到

当前 `reasoning-tokens` 子项目原本只把流式消息里的 `content` 当纯字符串处理，因此即使底层模型已经返回了 reasoning blocks，前端也会把它们丢掉，只留下最终文本。

另外，如果只保存 `content`，不保存 `additional_kwargs.reasoning` 和 `response_metadata`，那在后续多轮对话里，Responses API 也无法完整复用上一轮的 reasoning items。

## 3. 本次改造做了什么

### 后端

- 针对推理模型自动启用 Responses API
- 默认请求 reasoning summary
- 流式透传数组型 `content`
- 序列化时保留 `additional_kwargs`、`response_metadata`、`usage_metadata`

### 前端

- 从 AI 消息的 `contentBlocks` 中拆出 reasoning/text 两部分
- 新增独立“思考摘要”气泡
- 保留现有正文气泡、工具卡片、分支切换和 HITL 审核逻辑

## 4. 当前项目如何使用

### OpenAI / OpenAI-compatible reasoning 模型

推荐使用支持 reasoning 的模型，例如：

- `gpt-5`
- `gpt-5.4`
- `o3`

可选环境变量：

```bash
MODEL_NAME=gpt-5
MODEL_REASONING_EFFORT=medium
MODEL_REASONING_SUMMARY=auto
MODEL_USE_RESPONSES_API=true
```

如果你继续使用非推理模型，现有聊天功能仍可工作，只是不会出现“思考摘要”。

### DeepSeek

如果使用 DeepSeek，当前项目支持两种思考方式：

- `deepseek-reasoner`
  说明：原生推理模型，会返回 `reasoning_content`，但不适合当前这种依赖 Tool Calls 的工作流。
- `deepseek-chat` + thinking mode
  说明：官方文档说明可以通过 `thinking: { type: "enabled" }` 开启思考模式，并且支持 Tool Calls。

这个子项目已经对 DeepSeek thinking mode 做了专门适配：

- 自动读取并流式展示 `reasoning_content`
- 在同一轮工具调用链里，把 `reasoning_content` 回传给 DeepSeek，让模型继续思考
- 新一轮用户问题开始时，历史里的 `reasoning_content` 即使保留也不会打断当前对话，但官方建议按需清理以节省带宽

推荐配置：

```bash
OPENAI_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
DEEPSEEK_THINKING_TYPE=enabled
```

## 5. 接入后的消息流

1. 用户发消息
2. 后端用推理模型流式返回 `reasoning` 和 `text` 内容块
3. 前端先展示“思考摘要”
4. 随着模型继续输出，再展示最终回答
5. 完整消息和 reasoning 元数据一起持久化，供后续分支、重生成、多轮上下文继续使用
