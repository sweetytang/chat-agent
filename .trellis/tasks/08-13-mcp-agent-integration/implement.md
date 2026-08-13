# MCP Agent 与 HITL 集成实施计划

1. tool snapshot 解析与持久化测试。
2. LangChain adapter 与 graph/run 注入。
3. 默认审核、管理员下限与 interrupt resume 版本校验。
4. 统一事件/decoder、消息与 checkpoint 回放。
5. Tool Result/error/media object reference 适配。
6. 多用户、同名、配置变化、取消/超时与回归测试。

回滚：关闭 MCP tool injection，保留核心配置与历史数据；现有静态 tools 路径不变。
