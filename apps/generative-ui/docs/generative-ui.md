# Generative UI 接入说明

参考教程：

- LangChain Frontend Patterns - Generative UI
  - https://docs.langchain.com/oss/javascript/langchain/frontend/generative-ui

## 1. 生成式用户界面的原理

一句话理解：

不是让模型直接输出一大段文本，而是让模型输出一份“可渲染的界面规格”，前端再用白名单组件把它安全地渲染出来。

它的核心链路可以拆成 4 步：

1. 先定义组件目录 catalog
2. 再告诉模型它只能使用 catalog 里的组件
3. 模型生成一个 JSON 规格，描述组件树
4. 前端用 renderer 把 JSON 渲染为真正的 React 界面

教程里最重要的设计点有两个：

- 模型不是自由发挥 UI，而是在“受约束的组件集合”内组合
- 流式传输时拿到的是“逐步完整的 spec”，前端要过滤掉还没成型的节点，再渐进渲染

可以把它类比成：

- 普通聊天：模型写作文，前端只能整段展示
- 结构化输出：模型填表单，前端按字段渲染固定卡片
- 生成式 UI：模型像搭积木一样拼组件树，前端负责把积木安全落地

所以它比普通 Markdown 更强的地方在于：

- 界面结构是显式的
- 组件是受控的
- 渲染是安全的
- 更适合卡片、看板、对比面板、步骤面板这类复杂回答

## 2. 结合当前项目，应该怎么改

当前 `apps/generative-ui` 已经具备一条很重要的基础设施：

- 后端可以通过 tool call 把结构化对象传回前端
- 前端已经能从 `AIMessage.tool_calls` 中提取 payload 并做专用渲染
- 流式消息、checkpoint、branch、人工审核都已经成体系

这意味着这里最稳妥的改造方式，不是重写协议，而是把现有“结构化卡片”能力扩展为“组件树规格渲染”。

### 2.1 这次改造的关键落点

新增一个展示类 tool：

- `present_generative_ui`

它和天气、搜索、计算器这些真实工具不同：

- 不执行副作用
- 不进入人工审核
- 只承担“把 UI spec 带回前端”的职责

同时新增运行时开关：

- `generativeUiEnabled`

这样前端在发起运行时可以明确告诉后端：

- 这次回答要走普通文本
- 还是走结构化卡片
- 还是走生成式 UI

### 2.2 为什么这样适合当前工程

因为当前工程已经有：

- SSE 流式同步
- tool_calls 持久化
- 消息分支与回放
- 输入队列与中断恢复

所以最优解是复用这些能力，只改“展示 payload 的协议层”和“前端渲染层”。

## 3. 当前实现

### 3.1 后端

新增了 `backend/services/ai/tools/generativeUiTool.ts`：

- 定义生成式 UI 的 schema
- 限定组件目录为 `Hero / Stack / Panel / Metric / BulletList / DataTable / CodeBlock / Notice`
- 明确这是最终展示 tool，不参与真实执行

同时调整了工具选择逻辑：

- `generativeUiEnabled` 时，模型只暴露真实工具 + `present_generative_ui`
- `structuredOutputEnabled` 时，模型只暴露真实工具 + `present_structured_answer`

这样可以避免两个展示协议同时暴露给模型，降低回答跑偏概率。

### 3.2 前端

新增了 `frontend/components/Chat/MessageList/GenerativeUICard`：

- 使用 `@json-render/core` 和 `@json-render/react`
- 定义本地 catalog 与 registry
- 将模型产出的 UI spec 渐进渲染成真正的组件树

同时新增了解析服务：

- `frontend/services/chat/generativeUi.ts`

职责：

- 从 `AIMessage.tool_calls` 提取生成式 UI payload
- 过滤流式过程中尚未完整的元素
- 生成可直接交给 `Renderer` 的安全 spec

### 3.3 交互层

输入区新增了“生成式 UI”模式开关：

- 开启后会将本次运行切换到 `generativeUiEnabled`
- 与“结构化卡片”互斥，避免展示协议冲突

消息区新增了生成式 UI 卡片展示：

- 生成式 UI payload 不再以普通工具卡片显示
- 会走专用渲染器

## 4. 下一步开发方向

当前版本已经完成“接入并开始开发”的最小闭环。

建议继续按这个顺序增强：

1. 扩充 catalog，增加更适合表单和时间线的组件
2. 为生成式 UI 补充更细的 loading skeleton
3. 给关键 spec 解析逻辑补测试，确保流式 partial payload 不会导致渲染异常
4. 结合真实业务问题收敛 prompt，减少模型生成冗余嵌套结构
