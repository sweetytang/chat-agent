# MCP Agent 与 HITL 集成设计

`runs` 只请求 MCP 模块生成不可变 tool snapshot；MCP 模块再把 snapshot 投影为普通 LangChain tools。handler 不持有全局名称猜测，而以 snapshot + reverse Mapper 精确执行。

默认 policy 先产生现有 interrupt；resume 验证 snapshot security version 后调用 MCP Host。事件沿用 `tool.call / tool.approval_required / tool.result`，由公共 decoder 增加 MCP 来源和 content blocks 可选字段。

任何 MCP 错误都必须被隔离成当前调用的受控结果；关闭功能开关时 graph 只接收原有静态 tools。
