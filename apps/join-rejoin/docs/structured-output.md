# Structured Output 改造说明

参考教程：[LangChain Frontend Patterns - Structured output](https://docs.langchain.com/oss/javascript/langchain/frontend/structured-output)

## 1. 结构化输出的原理

一句话理解：不是让模型“写一段看起来像 JSON 的文本”，而是让模型把最终答案塞进一个事先约定好的 schema 里，再由前端按字段渲染 UI。

可以把它拆成 3 层来看：

### 1.1 为什么它比普通文本更稳定

普通聊天输出是“一整段字符串”，前端只能把它当 markdown 或纯文本显示。

结构化输出则是：

1. 先定义 schema，例如 `title`、`summary`、`sections`、`comparisonTable`
2. 模型最终不是返回自由文本，而是返回一个符合 schema 的对象
3. 前端不再猜内容结构，而是按字段直接渲染成卡片、表格、步骤、代码块

这样做的好处是：

- 可控：UI 不依赖模型临场发挥排版
- 可复用：同一个 schema 可以被多个问题复用
- 可渐进渲染：流式过程中字段到了就先显示
- 可维护：后续加字段，比解析自然语言稳定得多

### 1.2 官方教程里的核心机制

LangChain 前端教程强调的重点是：

- 结构化结果通常挂在最后一条 `AIMessage` 的 `tool_calls` 里
- 这个 tool call 不是为了真的执行工具，而是为了把结构化对象传回前端
- 前端从 `tool_calls[0].args` 提取对象，再交给专用组件渲染

也就是说，`tool call` 在这里承担的是“数据载体”角色，不是“真实副作用工具”。

### 1.3 深入浅出的类比

可以把普通回复理解成“模型写了一篇作文”，前端只能整篇展示。

结构化输出更像“模型先填了一张表单”：

- 标题填到 `title`
- 摘要填到 `summary`
- 步骤填到 `sections`
- 对比项填到 `comparisonTable`

前端拿到这张表单后，就能决定：

- `summary` 渲染成导语
- `highlights` 渲染成统计卡片
- `comparisonTable` 渲染成表格
- `sections` 渲染成分段步骤

所以真正关键的不是“JSON”，而是“前后端提前约定好字段含义”。

## 2. 结合当前项目，应该怎么改

当前 `apps/structured-output` 不是官方单页面 demo，而是一个更真实的系统：

- 前端：React + Zustand + `useStream`
- 后端：Express + Prisma + checkpoint/history
- 流式协议：SSE
- 现有能力：工具调用、人工审核、分支聊天、重新生成

### 2.1 直接照搬教程会遇到的问题

当前项目里，“所有 tool call” 原本都被视为要审核、要执行的真实工具。

但 structured output 的 tool call：

- 不该进人工审核
- 不该被执行
- 只该作为最终展示结果保留在 `AIMessage.tool_calls`

如果不分流，就会出现两个问题：

1. 前端会把结构化输出错当成待审批工具
2. 后端会尝试执行一个本来只用于承载数据的 tool

### 2.2 这次改造的落点

这次实现把工具分成了两类：

- `executableTools`
  - 真正会执行的工具，如天气、计算器、Web 搜索
- `structuredResponseTool`
  - 只负责承载结构化结果，不执行副作用

同时把运行时 metadata 扩展成：

- `deepThinkingEnabled`
- `structuredOutputEnabled`

这样前端可以像切换“深度思考”一样切换“结构化输出”，后端根据 metadata 决定：

- 是否把结构化输出 tool 暴露给模型
- 是否在系统提示词里要求模型用结构化 tool 作为最终回答

### 2.3 为什么这样更适合当前项目

因为当前项目已经有成熟的：

- stream 管理
- checkpoint 分支逻辑
- 工具审核逻辑
- AIMessage/tool_calls 持久化逻辑

所以没必要重写一套新的 agent/server 协议。最合适的做法是：

- 保留原有流式消息体系
- 让结构化输出复用 `tool_calls`
- 只在“工具分类”和“前端渲染层”做增强

这比完全切换到另一套 response state 协议更稳，也更符合当前工程结构。

## 3. 已接入的新功能

### 3.1 后端

新增了结构化输出专用 tool：

- 文件：`backend/services/ai/tools/structuredResponseTool.ts`

能力：

- 定义 `title / summary / format / highlights / sections / comparisonTable / nextSteps` schema
- 作为最终结构化回答的承载工具
- 不参与真实执行

同时对后端运行链路做了分流：

- `modelRunService.ts`
  - 只有真实执行工具才会触发 `INTERRUPTED`
- `runController.ts`
  - 运行时 metadata 新增 `structuredOutputEnabled`
- `providerConfig.ts`
  - 结构化输出开关进入 runtime options
- `tools/index.ts`
  - 新增 `getRuntimeTools()` 和 `getExecutableToolCalls()`

这保证了：

- 真实工具继续审核
- 结构化输出直接作为最终结果落盘

### 3.2 前端

新增了结构化输出专用渲染链路：

- `frontend/services/chat/structuredOutput.ts`
  - 从 `AIMessage.tool_calls` 提取结构化对象
- `frontend/components/Chat/MessageList/StructuredOutputCard`
  - 将结构化字段渲染为标题、亮点卡片、对比表、步骤块、代码块、下一步建议

同时：

- `InputBar`
  - 新增“结构化输出”模式开关
- `ThreadStreamWorker`
  - metadata 会把结构化输出开关透传给后端
- `MessageBubble`
  - 结构化输出不再按普通工具卡片显示，而是走专用卡片渲染

### 3.3 体验层

为了更容易验证新功能，还顺手调整了：

- 预设提示词改为更适合结构化回答的示例
- 默认开启 `structuredOutputEnabled`

## 4. 当前实现状态

已完成：

- 结构化输出 schema 接入
- 后端 tool call 分流
- 前端模式开关
- 前端结构化卡片渲染
- 构建验证通过

验证命令：

```bash
pnpm --filter structured-output build
```

## 5. 下一步建议

如果继续打磨，建议按这个顺序往下做：

1. 为 `StructuredOutputCard` 补充更细的 loading skeleton，增强流式渐进体验
2. 给不同 `format` 做更强的视觉差异，比如 guide / comparison / explanation 各自单独布局
3. 增加结构化输出的快照测试或 schema 兼容性测试
4. 补一个“关闭结构化输出后回退纯 markdown”的对照说明
