# MCP V1 全面审核与修复设计

## 审核边界

按 `PostgreSQL → SQLAlchemy model/repository → MCP service/API → Host/client → Agent/HITL/events → frontend service/state/UI` 逐层建立回归信号。既有 V1 PRD 中承诺但代码未闭环的能力视为缺陷。

## 数据与迁移

让 ORM 使用与现有数据库一致的非原生 enum 映射，并新增修复迁移和偏好复合唯一约束。该策略无需转换现有列或创建多个 PostgreSQL enum，兼容已经执行 0004 的数据库和全新安装。

## 模块边界

- MCP repository/service 集中 Server、activation、catalog、preference、权限和状态逻辑。
- Host client adapter 封装 MCP SDK，支持注入 fake，负责连接、list_tools 和 call_tool。
- router 只处理 DTO、依赖和 HTTP 错误映射。
- agent 模块构建 run 快照与 LangChain tools，不直接解析协议 DTO。

## 数据流

用户启用 Server → Host 连接与发现 → catalog/Mapper 更新 → 用户启用 Tool → run 创建时验证 presence/compatibility/security version → 冻结快照 → 默认 HITL → 恢复校验安全版本 → Host 调用远端工具 → 结果标准化为事件和对象引用。

前端从侧边栏打开配置面板，加载 Server 与工具 DTO，通过创建、启停、刷新 API 改变状态。所有状态直接使用后端枚举。

## 兼容与回滚

- 修复迁移只影响 MCP 新表和用户角色映射，不改线程、消息和 run 数据。
- Host、沙箱或对象存储不可用时返回受控错误，不做不安全降级。
- 动态 MCP 工具装载可独立禁用，内置工具行为保持不变。
