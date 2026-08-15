# 统一任务运行时架构

> 本规范描述 lui-agent 从聊天应用演进为统一多任务、多 Agent 产品时必须遵守的边界。它是后续实现依据，不代表所有目标模块当前已经存在。

## 1. 范围与触发条件

### 产品边界

- 当前仓库继续作为产品底座，不新建独立项目。
- Chat、Code、General 是同一产品中的不同任务模式，共用入口、身份、持久化、事件、审批和部署体系。
- 后端以统一任务运行时为核心；LangGraph 是可替换的 Agent Driver，不是业务合同。
- 多 Agent 协作以执行树呈现。用户可以查看节点日志和产物，并停止、重试或审批节点；首期不提供用户直接向子 Agent 发消息的能力。

### 何时应用本规范

新增或修改以下任一能力前，必须先对照本规范：

- 任务模式、Agent、Executor、调度器或 Worker；
- Runtime Event、SSE、WebSocket 或执行历史；
- 工具权限、人工审批、预算或代码变更应用；
- Task、Execution、AgentNode、Artifact 或 ChangeSet 持久化；
- LangGraph 之外的 Agent 框架或外部 Code Agent。

### 当前准备改动

在第一个 Code Task 纵向切片开始前，只做以下低风险边界整理：

1. API 通过依赖对象调用运行服务，运行服务禁止反向导入 FastAPI 路由模块。
2. 运行时只产生传输无关事件，SSE 编码留在 API 适配层。
3. LangGraph 通过最小 `AgentDriver` 接口接入。
4. 用合同测试锁定现有聊天链路，不改变现有 HTTP、SSE、数据库和 UI 行为。

## 2. 签名与核心模型

以下是目标合同。首期实现只增加真实消费者需要的方法，禁止为了未来可能性扩展接口。

```python
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal, Protocol

TaskMode = Literal["chat", "code", "general"]


@dataclass(frozen=True)
class AgentRequest:
    task_id: str
    execution_id: str
    node_id: str
    mode: TaskMode
    input: dict[str, Any]
    context: dict[str, Any]


@dataclass(frozen=True)
class RuntimeEvent:
    version: int
    event: str
    task_id: str
    execution_id: str
    node_id: str | None
    sequence: int
    data: dict[str, Any]


class AgentDriver(Protocol):
    async def stream(self, request: AgentRequest) -> AsyncIterator[RuntimeEvent]: ...


class Executor(Protocol):
    async def execute(self, request: AgentRequest) -> AsyncIterator[RuntimeEvent]: ...


class ToolPolicy(Protocol):
    def decide(self, *, tool: str, arguments: dict[str, Any]) -> "ToolDecision": ...
```

### 模型职责

| 模型 | 唯一职责 |
| --- | --- |
| `Task` | 用户目标、初始任务模式、预算和最终状态 |
| `Execution` | 一次可恢复的任务执行尝试 |
| `AgentNode` | 执行树节点、父子关系、Driver、Executor 和节点状态 |
| `RuntimeEvent` | 运行过程的追加式事实，不包含 HTTP/SSE 编码 |
| `Approval` | 对高风险工具或 ChangeSet 的人工决策 |
| `Artifact` | 日志、报告、补丁、测试结果等不可变产物元数据 |
| `ChangeSet` | 可审查、可应用的代码变更集合 |

### 实现映射

- 首个 Driver：`LangGraphAgentDriver`。
- 首个 Executor：`InProcessExecutor`。
- 后续 Executor：本机隔离进程、Docker、远程执行器；它们必须保持同一事件和状态合同。
- 未来调度采用 PostgreSQL lease；API、scheduler、worker 可以统一部署，但职责必须可独立运行。

## 3. 跨层合同

### 兼容期事件合同

当前前端仍消费 `BusinessEvent(version, event, run_id, thread_id, sequence, data)`。准备性重构必须保持该外部载荷不变，只允许内部增加适配：

```text
AgentDriver -> RuntimeEvent -> 兼容事件投影 -> SSE 编码 -> 前端统一解码器
```

- Runtime 不得调用 `to_sse()`，也不得依赖 FastAPI、数据库 Session 或路由模块。
- API 适配器拥有 SSE 帧格式和当前 `run_id/thread_id` 兼容投影。
- 前端只在 `modules/runs` 的事件边界解析 `unknown`，组件和 Store 禁止解析 LangGraph 原始事件。
- 正式启用 Task Runtime API 时再发布新版 DTO；禁止在准备性重构中全局重命名 `thread/run`。

### 依赖方向

```text
API / Scheduler / Worker
          |
          v
  Application Service
          |
          v
   Task Runtime Contracts
      |             |
      v             v
Agent Driver      Executor
      |
      v
LangGraph Adapter
```

允许外层装配内层，禁止 Runtime 反向导入 API、数据库实现或具体传输协议。

### 调度与恢复合同

- Task 和 AgentNode 都必须持久化；进程重启不能成为状态来源。
- 任务投递采用 at-least-once，节点副作用必须通过幂等键避免重复执行。
- Worker 领取节点时写入有期限的 lease；lease 到期后 scheduler 可以重新领取。
- 重试创建新的 execution attempt 或递增明确的 attempt，不能覆盖原始事件和产物。
- 只读 Agent 可以共享只读基线；任何写代码的 Agent 必须使用独立 worktree。
- 子 Agent 的变更由协调者汇总为 ChangeSet，默认经用户审批后才能应用到主工作区。

### 工具和预算合同

- 所有 Agent 共用风险分级策略：`allow`、`require_approval`、`deny`。
- 审批必须发生在工具产生副作用之前；持久化审批请求后节点进入可恢复的等待状态。
- 每个 Task 至少可限制并发数、树深度、运行时间、token/成本和工具调用数。
- 达到预算后停止领取新节点并产生明确事件，禁止静默截断或继续消耗。

## 4. 校验与错误矩阵

| 条件 | 系统行为 | 可观察结果 |
| --- | --- | --- |
| 未知任务模式 | 拒绝创建任务 | 入口返回可定位的校验错误，不创建 Task |
| Driver 不可用 | 当前节点失败或进入受控重试 | 保存失败事件、错误分类和 attempt |
| Executor 启动失败 | 不执行 Agent 逻辑 | 节点保留可重试状态，不伪造成功事件 |
| lease 到期 | scheduler 允许重新领取 | 幂等键保证副作用不重复 |
| 重复投递同一节点 | 返回已有结果或安全续跑 | 不重复写消息、调用工具或应用补丁 |
| 高风险工具未审批 | 暂停节点 | 保存 Approval 和审批事件，工具未执行 |
| 审批拒绝 | 终止该工具分支 | 保留拒绝记录，协调者决定替代路径 |
| 预算耗尽 | 停止派生和领取新节点 | 产生预算事件并保存当前产物 |
| RuntimeEvent 无法编码 | API 适配层失败 | Runtime 状态不被传输异常覆盖 |
| worktree 创建失败 | Code 节点不运行 | 主工作区保持不变，可重试或更换 Executor |
| ChangeSet 未批准 | 禁止应用 | 补丁和测试结果仍可查看 |

## 5. Good / Base / Bad 场景

### Good：Code Task 纵向切片

1. 用户从统一入口创建 `mode=code` 的 Task。
2. Coordinator 创建 Code AgentNode，scheduler 通过 lease 分配给 Worker。
3. Executor 创建独立 worktree，Driver 运行 Agent 并持续产生 RuntimeEvent。
4. 测试结果和补丁保存为 Artifact/ChangeSet，前端显示执行树。
5. 用户批准 ChangeSet 后才应用到主工作区。

### Base：现有 Chat 兼容

Chat 请求仍使用现有 HTTP/SSE 合同。内部可以改为 Driver 和 RuntimeEvent，但前端收到的事件名称、顺序、`run_id`、`thread_id` 和 `sequence` 不变。

### Bad：空架构先行

在没有纵向切片消费者前创建空的 scheduler/worker 应用、完整远程执行协议、大量模式枚举和多层抽象。此做法增加迁移面，却不能验证恢复、审批和代码隔离链路。

## 6. 必需测试

### 准备性重构

- `AgentDriver` 合同测试：输入固定模型响应，断言规范化事件名称、内容和顺序。
- SSE 适配测试：断言当前 `BusinessEvent` 载荷和帧格式完全不变。
- 依赖边界测试：运行时包可在不导入 FastAPI/API 模块的情况下导入和测试。
- Chat 回归测试：发送、停止、工具审批、恢复、失败和完成链路保持现状。
- 前端事件测试：无效载荷被边界拒绝，重复或倒序 sequence 不重复更新 UI。

### 首个 Code Task 切片

- Task、Execution、AgentNode 状态转换和重启恢复集成测试。
- lease 到期、重复投递和幂等副作用测试。
- 写 Agent worktree 隔离测试，断言主工作区在批准前无变化。
- ToolPolicy 的 allow/require_approval/deny 三类测试。
- ChangeSet 拒绝、批准和应用失败测试。
- 执行树事件到前端节点状态的端到端测试。

## 7. 错误与正确示例

### 错误：运行服务反向读取 API 全局对象

```python
def _runtime():
    from app.api import runs
    return runs


cancel_event = _runtime()._cancel_events[run_id]
```

这会让运行服务无法独立进入 Worker，也会使测试依赖 FastAPI 模块初始化副作用。

### 正确：由外层装配真实依赖

```python
@dataclass(frozen=True)
class RunDependencies:
    cancellation: CancellationRegistry
    driver: AgentDriver
    event_projector: EventProjector


async def run_events(request: RunRequest, deps: RunDependencies):
    async for event in deps.driver.stream(to_agent_request(request)):
        yield deps.event_projector.to_compat_event(event)
```

### 错误：RuntimeEvent 自行编码 SSE

```python
yield runtime_event.to_sse()
```

### 正确：传输适配器拥有编码

```python
event = await run_service.next_event()
yield sse_encoder.encode(event_projector.to_compat_event(event))
```

## 设计决策与实施顺序

### 已确定决策

1. 使用当前 Monorepo，保持前端 pnpm workspace 与后端 uv workspace 隔离。
2. 统一入口、统一部署，Chat/Code/General 共用控制平面。
3. 用户选择初始模式，协调者允许跨能力委派。
4. 执行树对用户可见，节点支持查看、停止、重试和审批。
5. 使用 `AgentDriver` 隔离 LangGraph；允许后续接入外部 Code Agent。
6. 使用统一控制平面和可插拔 Executor，逐步支持进程、Docker 和远程执行。
7. PostgreSQL 先承担持久化和队列/lease，不提前引入 Temporal 或 Redis。
8. 代码写入使用独立 worktree，ChangeSet 默认先审批后应用。

### 分阶段实施

1. **边界准备**：依赖注入、事件与 SSE 分离、LangGraph Driver、兼容合同测试。
2. **纵向切片**：重写 Chat 链路并完成一个 Coordinator → Code Agent → worktree → 测试 → ChangeSet → 审批的端到端任务。
3. **进程拆分**：出现真实并发和恢复需求后，再拆 scheduler/worker 进程并引入 PostgreSQL lease。
4. **执行器扩展**：基于真实场景增加 Docker/remote Executor 和 General Agent。

### 当前禁止提前实施

- 不创建没有运行职责的空应用或包。
- 不批量重命名现有 Chat API/DB 模型。
- 不先实现通用工作流 DSL、复杂插件系统或跨服务 RPC。
- 不在没有幂等和恢复测试前把执行移入后台 Worker。
- 不允许 LangGraph、MCP、SSE 或 FastAPI 类型成为 Task Runtime 公共合同。
