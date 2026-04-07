# Branching Chat 改造说明

## 1. 一句话理解

分支聊天的核心不是“给消息加版本号”，而是“把线程状态保存成 checkpoint 树”。

- 正常继续提问：沿当前分支 head 往后追加一个新节点。
- 编辑旧用户消息：回到这条消息出现前的 parent checkpoint，从那里分出一条新支线。
- 重新生成 AI：回到这条 AI 回复出现前的 parent checkpoint，不改用户输入，重新跑一遍模型。
- 工具调用 / 人工审核：本质上也是树上的中间节点，只是它们比普通文本回复多了一层“暂停、审核、恢复执行”的状态。

所以 UI 上看到的“1/4、2/4、3/4”，其实不是数组下标，而是某个 fork 点下面的兄弟 checkpoint 切换。

## 2. 当前实现的整体思路

这个项目不是 LangChain 官方教程里的单组件 Demo，而是一个前后端分离项目：

- 前端：React + Zustand + `useStream`
- 后端：Express + Prisma + SQLite/PostgreSQL
- 中间协议：SSE + thread history + checkpoint API

因此这次实现没有直接依赖 SDK 默认的分支 UI，而是自己搭了一套“后端 checkpoint 树 + 前端 branch 视图”。

### 后端负责什么

- 每次运行都知道“从哪个 checkpoint 开始”
- 每次运行结束都把状态保存成一个新 checkpoint
- 工具审核时，把 interrupt 和对应 checkpoint 绑定起来
- 提供 history/state 接口，让前端能重建整棵树

### 前端负责什么

- 把 history 还原成当前可见分支
- 给每条可切换消息算出 branch / branchOptions
- 在编辑、重生成后，把页面停留在刚刚生成出来的当前分支
- 把工具卡片、审核卡片和普通文本回复区分开显示

## 3. 端到端流程

### 3.1 普通发送消息

1. 前端当前线程有一个 `headCheckpoint`。
2. `MessageList` 调用 `enqueueMessage`，把文本、messageId、当前 `headCheckpoint` 送进 `streamStore`。
3. `ThreadStreamWorker` 消费命令，调用 `stream.submit(...)`。
4. 后端 `streamThreadRun` 进入 `handleNewMessage`。
5. 后端根据 checkpoint 找到本次运行的 base messages。
6. 先保存一份“包含这次用户输入”的中间 checkpoint。
7. 再调用模型生成 AI，生成结束后再保存 AI 对应的新 checkpoint。
8. 前端根据最新 history 重建当前 branch 视图。

### 3.2 编辑旧用户消息

1. 前端先找到这条用户消息第一次出现的 state。
2. 再取它的 `parent_checkpoint`，作为这次编辑的分叉点。
3. UI 先乐观显示“父 checkpoint 的消息 + 编辑后的用户消息”。
4. 后端从这个 parent checkpoint 开始跑，生成一条新的兄弟分支。
5. 前端刷新时不回到旧 branch，而是跟随这个 parent checkpoint 的最新后代分支。

### 3.3 重新生成 AI

1. 前端找到这条 AI 回复第一次出现前的 `parent_checkpoint`。
2. 不新增用户消息，只拿这个 checkpoint 重新跑模型。
3. 新 AI 回复会变成旧 AI 回复的兄弟版本。
4. 刷新完成后，当前卡片应停在新的最新 sibling 上。

### 3.4 工具调用 / 人工审核

1. 模型先输出一个带 `tool_calls` 的 AIMessage。
2. 后端把它保存成 interrupt checkpoint，并缓存审核上下文。
3. 前端显示审核卡片，而不是继续 loading。
4. 用户 approve / edit / reject 后，后端从原 interrupt checkpoint 恢复执行。
5. 工具结果也会先落一个中间 checkpoint，再生成最终 AI。
6. 这样后续重新生成时，不会回到“只有 tool_calls、没有 tool result”的半成品状态。

## 4. 后端代码怎么读

建议从这几个文件开始：

- `backend/controllers/runController.ts`
- `backend/services/chat/modelRunService.ts`
- `backend/models/threadCheckpointRepository.ts`

### 4.1 入口：`streamThreadRun`

文件：`backend/controllers/runController.ts`

它只做两件事：

- 如果请求里有 `command.resume`，走人工审核恢复逻辑。
- 否则走普通/编辑/重生成逻辑。

也就是说，前端虽然有多个操作按钮，但后端真正的分叉点只有两个：

- 从某个 checkpoint 开始一次新运行
- 从某个 interrupt checkpoint 恢复一次暂停运行

### 4.2 `resolveRunBaseState`

文件：`backend/controllers/runController.ts`

这是“分支聊天”的后端基础函数。

- 没传 checkpoint：从线程当前 head 继续
- 传了 `THREAD_START_CHECKPOINT_ID`：从空对话开始
- 传了普通 checkpoint：从该 checkpoint 对应的历史状态开始

它的输出很关键：

- `parentCheckpointId`
- `baseMessages`

后面所有分支，都是从这两个值长出来的。

### 4.3 为什么要先保存“用户输入 checkpoint”

文件：`backend/controllers/runController.ts`

`handleNewMessage` 里有一步很重要：

- 用户消息进入后，先保存一次 checkpoint
- 然后 AI 才开始生成

这样做是为了保证：

- “重新生成 AI” 时，能准确回到“包含这次用户输入”的状态
- 不会因为 parent checkpoint 太早，导致 AI 回答错问题

这是分支聊天里最容易出错的地方之一。

### 4.4 `modelCallAgent`

文件：`backend/services/chat/modelRunService.ts`

它负责两件事：

- 把模型流式输出通过 SSE 发给前端
- 在生成结束后，把最终消息写回线程和 checkpoint

如果最后一条 AIMessage 里带 `tool_calls`：

- 线程会进入 `INTERRUPTED`
- `interruptRepository` 会缓存：
  - `hitlRequest`
  - `aiMessage`
  - `allMessages`
  - `checkpointId`

这就是为什么审核卡片能精确绑定到某个分支。

### 4.5 为什么工具结果也要单独存 checkpoint

文件：`backend/controllers/runController.ts`

`persistIntermediateCheckpoint` 的作用是：

- 工具执行完成后，先保存“已经有 tool result，但还没最终 AI 回复”的状态
- 再继续让模型生成最终回答

否则重新生成时，会退回到只有 tool call 的旧节点，前端就会看到工具卡片一直 pending。

### 4.6 `threadCheckpointRepository`

文件：`backend/models/threadCheckpointRepository.ts`

它把数据库里的 checkpoint 记录转成前端可消费的 `ThreadStateDTO`：

- `checkpoint`
- `parent_checkpoint`
- `values.messages`
- `tasks.interrupts`
- `created_at`

前端真正拿来构建分支树的，就是这份 history。

## 5. 前端代码怎么读

建议从这几个文件开始：

- `frontend/services/chat/branching.ts`
- `frontend/store/chatStore.ts`
- `frontend/components/Chat/ChatStreamHub/ThreadStreamWorker/index.tsx`
- `frontend/components/Chat/MessageList/index.tsx`

### 5.1 `branching.ts`：分支树的大脑

这个文件最重要，建议优先读。

它做了 4 件事：

1. 把 history 按时间正序排序。
2. 根据 `parent_checkpoint` 构建 checkpoint 树。
3. 根据当前 `activeBranch` 还原“当前可见的消息路径”。
4. 给每条消息计算分支元数据：
   - `branch`
   - `branchOptions`
   - `firstSeenState`

### 5.2 为什么 history 必须正序

如果 history 是倒序，SDK 或自定义逻辑在“沿当前 branch 往下走”时很容易选错 head。

所以这里统一做成：

- 后端 `listStates` 可以按倒序查库
- 但前端进入分支算法前，一律先正序排序

这一步是当前实现稳定的关键前提。

### 5.3 为什么 checkpoint 要解释成“最新后代分支”

当用户从旧消息重新生成时，传给前端刷新的往往是一个旧 checkpoint。

如果直接把它解释成“停回旧 checkpoint 对应的旧 branch”，就会出现：

- 新版本已经生成了
- 但 UI 还停在前一个 sibling
- 比如应该是 `4/4`，结果还显示 `3/4`

所以 `branching.ts` 里专门把 checkpoint 解析成：

- 该 checkpoint 在当前历史树上的最新后代路径

这就是“生成完成后停在当前新分支”的核心。

### 5.4 `chatStore.ts`

它是“线程视图状态”的中心：

- `history`
- `activeBranch`
- `headCheckpoint`
- `messageMetadataById`
- `messages`
- `interrupt`

理解它最重要的两个动作：

- `applyBranchSelection`
  - 用户切换分支时，根据 history 重算当前可见消息
- `syncStreamData`
  - 流式输出完成后，把 stream/history 落回 store

可以把它理解成：

- `branching.ts` 负责“怎么算”
- `chatStore.ts` 负责“把结果存在界面状态里”

### 5.5 `ThreadStreamWorker`

这个组件是“LangChain useStream”和“项目自有 store”之间的桥。

它做三件事：

1. 消费 `streamStore` 里的 pendingCommand
2. 调用 `useStream().submit()` 真正发起运行
3. 把 stream 的 messages/history/interrupt 同步回 `chatStore`

当前版本里最关键的是两个 ref：

- `latestResolvedCheckpointAnchorRef`
  - 根据本次 stream 最终消息反查它落在哪个 checkpoint
- `latestOperationCheckpointRef`
  - 记录“这次操作是从哪个 checkpoint 分出来的”

它们一起保证：

- 编辑/重生成后，刷新不会跳回旧分支
- 而是停在刚生成出来的当前分支

### 5.6 `MessageList`

它负责把用户动作翻译成“从哪个 checkpoint 开始分叉”。

#### 编辑用户消息

- 先找到该消息第一次出现的 state
- 再取它的 `parent_checkpoint`
- 用这个 parent checkpoint 作为新的分叉起点

#### 重新生成 AI

- 找到该 AI 回复第一次出现前的 `parent_checkpoint`
- 不改用户消息，只重新跑模型

#### 审核工具卡片

- 提交时把 `requestId + checkpointId` 一起带给后端
- 保证这个审核动作只会落在它原本所属的分支上

## 6. 关键设计取舍

### 6.1 为什么不完全依赖 SDK 的 `getMessagesMetadata`

因为 SDK 默认会做“重复分支切换器去重”和一些默认 branch 选择。

在教程 Demo 里这很方便，但在当前项目里会带来几个问题：

- 分支切换条会消失
- 新生成的 sibling 不一定会成为当前选中版本
- 多层 fork 下更难精确控制当前视图

所以这里改成了：

- `useStream` 负责流
- 自己的 `branching.ts` 负责 branch 解析

### 6.2 为什么工具中间态不显示“重新生成”

带 `tool_calls` 的 AIMessage，本质上还是“流程中的中间节点”，不是最终用户可消费版本。

所以 UI 里只对真正最终文本回复暴露分支切换和 `重新生成`，避免把工具调用步骤误当成普通 AI 版本。

## 7. 推荐阅读顺序

如果你准备直接看代码，建议按这个顺序：

1. `frontend/services/chat/branching.ts`
2. `frontend/store/chatStore.ts`
3. `frontend/components/Chat/ChatStreamHub/ThreadStreamWorker/index.tsx`
4. `frontend/components/Chat/MessageList/index.tsx`
5. `backend/controllers/runController.ts`
6. `backend/services/chat/modelRunService.ts`
7. `backend/models/threadCheckpointRepository.ts`

这样读下来，你会先理解“前端怎么还原分支”，再理解“后端怎么把分支持久化出来”。
