# LUI Agent 前端视觉与交互升级实施计划

## 前置检查

1. 读取 `prd.md`、`design.md` 和 `.trellis/spec/frontend/visual-system.md`。
2. 确认当前工作区已有改动，禁止覆盖与本任务无关的用户修改。
3. 运行基线：`pnpm format:check`、`pnpm lint`、`pnpm build`、`pnpm test`。
4. 启动前端并记录桌面与移动端基线截图。

## 阶段一：依赖、主题与品牌基础

- [ ] 按需安装 `lucide-react` 和已选 Radix Primitives。
- [ ] 建立 light/dark Design Tokens 和系统字体栈。
- [ ] 实现三档主题偏好、系统监听、持久化和首屏防闪烁。
- [ ] 实现可复用品牌标识和 SVG favicon。
- [ ] 验证浅色/深色基础对比和全局背景。

回滚点：可单独移除新增依赖与主题组件，不影响业务 Store。

## 阶段二：AppShell、顶栏与响应式侧边栏

- [ ] 将 Chat 页拆成 AppShell、TopBar 和主聊天容器。
- [ ] 顶栏实现品牌、共用侧边栏按钮和主题 DropdownMenu。
- [ ] 重构 Sidebar：新建、搜索、真实列表、空状态、单行省略、独立滚动。
- [ ] 实现桌面展开/折叠和折叠图标栏。
- [ ] 使用 Radix Dialog 实现移动抽屉、遮罩、滚动锁定和选择后关闭。
- [ ] 验证桌面、平板和手机断点。

回滚点：AppShell 与 Sidebar 可通过原 Chat 布局恢复，业务方法签名保持不变。

## 阶段三：认证 Dialog 与账户菜单

- [ ] 将 AuthPanel 表单逻辑迁移为 AuthDialog。
- [ ] 未登录侧边栏显示登录入口，隐藏会话列表。
- [ ] 未登录主区域显示登录引导，隐藏快捷提示并禁用 Composer。
- [ ] 登录后显示 AccountMenu，支持身份退化文案和退出登录。
- [ ] 保存成功登录/注册时的邮箱；成功后清空表单，普通关闭保留表单。
- [ ] 回归登录、注册、错误、token 过期和退出流程。

## 阶段四：欢迎页与 Composer

- [ ] 创建 WelcomePanel 和 4 个已确认快捷提示。
- [ ] 快捷提示填入输入框并聚焦，不自动发送。
- [ ] 创建 ChatComposer，支持自动高度、最大高度和禁用态。
- [ ] 实现 Enter / Shift+Enter / IME 组合输入合同。
- [ ] 运行中发送按钮切换为停止，先 abort SSE 后调用取消 API。
- [ ] 保存完整 LastRunRequest，错误卡支持重试。

## 阶段五：消息、Markdown 和结果卡片

- [ ] 用户消息改为右侧气泡，助手消息改为文档流。
- [ ] 调整内容宽度、排版、操作按钮显隐和编辑状态。
- [ ] 扩展 Markdown renderer：代码复制、表格滚动、引用/链接/列表样式。
- [ ] 建立有序 PresentationItem 投影，避免结果单值覆盖。
- [ ] 工具、审核、结构化输出、生成式 UI 和错误卡按事件顺序展示。
- [ ] 使用 Radix Collapsible 支持结果卡默认展开和页面内折叠。
- [ ] 回归 checkpoint 分支、审核恢复和历史刷新。

回滚点：展示投影必须保留迁移兼容字段，确认所有消费者切换后才能删除旧字段。

## 阶段六：视觉收敛与质量验证

- [ ] 统一组件 token、圆角、边框、阴影、hover、focus 和禁用态。
- [ ] 添加克制动效及 `prefers-reduced-motion` 处理。
- [ ] 检查所有组件浅色/深色表现和长内容边界。
- [ ] 修复 Stylelint specificity、主题硬编码和移动端溢出问题。
- [ ] 执行完整自动化检查。
- [ ] 使用真实浏览器完成视觉矩阵并保存截图。

## 验证命令

在 `apps/lui-agent/frontend` 运行：

```bash
pnpm format
pnpm format:check
pnpm lint:fix
pnpm lint
pnpm build
pnpm test
```

浏览器验证矩阵：

| 视图 | 主题 | 认证 | 最低检查 |
|---|---|---|---|
| 1440px 桌面 | 浅色 | 已登录 | 展开/折叠、欢迎页、聊天流 |
| 1440px 桌面 | 深色 | 已登录 | tokens、代码块、结果卡、主题菜单 |
| 390px 手机 | 浅色 | 未登录 | 抽屉、Dialog、禁用 Composer |
| 390px 手机 | 深色 | 已登录 | 会话列表、发送/停止、滚动与遮挡 |

## 审查门禁

- [ ] 没有修改后端协议和业务路由。
- [ ] 没有伪造用户邮箱或会话数据。
- [ ] 没有按缺失时间字段分组会话。
- [ ] 所有主题色来自语义 token。
- [ ] Chat 组件不再承担所有 UI 状态与子区域渲染。
- [ ] 未登录不会发起聊天或线程业务操作。
- [ ] 停止操作同时覆盖本地 SSE 和后端取消。
- [ ] 重试保留 mode、checkpoint 和 baseHistory。
- [ ] 结构化输出与生成式 UI 多结果不再互相覆盖。
- [ ] 关键视图已在真实浏览器中验证。

## 启动实施前

本任务保持 `planning`。只有用户审核并明确批准本规划摘要后，才能运行：

```bash
python3 ./.trellis/scripts/task.py start 08-12-lui-agent-frontend-visual-overhaul
```
