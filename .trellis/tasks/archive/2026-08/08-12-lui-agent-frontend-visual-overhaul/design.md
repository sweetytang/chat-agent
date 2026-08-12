# LUI Agent 前端视觉与交互升级技术设计

## 1. 设计边界

本任务只重构前端呈现层和必要的前端 UI 状态，不改变后端接口、SSE 事件名称、checkpoint 行为或认证协议。

```text
现有业务 Store / Service / SSE
            │ 保持协议和调用语义
            ▼
       UI Projection Layer
  ├─ Theme preference
  ├─ Shell/sidebar state
  ├─ Composer draft/retry state
  └─ Ordered presentation items
            │
            ▼
      React + Radix UI
  ├─ AppShell / TopBar
  ├─ Sidebar / Drawer
  ├─ Auth Dialog / Account Menu
  ├─ Welcome / Composer
  └─ Message and result cards
```

## 2. 组件结构

计划结构如下，最终实现可按职责微调，但不得把所有交互继续堆叠在 `Chat/index.tsx`：

```text
src/
├── app/
│   ├── components/
│   │   ├── BrandMark/
│   │   ├── ThemeMenu/
│   │   └── AppTopBar/
│   ├── hooks/useTheme.ts
│   ├── store/ui.ts
│   └── styles/global.css
├── modules/auth/components/
│   ├── AuthDialog/
│   └── AccountMenu/
├── modules/chat/components/
│   ├── Chat/
│   ├── WelcomePanel/
│   ├── ChatComposer/
│   ├── MessageBubble/
│   ├── MessageContent/
│   ├── CodeBlock/
│   └── InlineErrorCard/
├── modules/threads/components/
│   └── Sidebar/
└── modules/presentation/components/
    ├── StructuredOutputCard/
    └── GenerativeUICard/
```

每个组件目录包含 `index.tsx` 和 `index.module.css`。只复用一次且逻辑简单的局部片段不强制拆分。

## 3. 主题合同

```ts
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface UiState {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
}
```

- `localStorage` key：`lui-agent:theme`。
- 根元素：`document.documentElement.dataset.theme = resolvedTheme`。
- `system` 使用 `matchMedia('(prefers-color-scheme: dark)')`。
- 初始化脚本应在 React 挂载前解析偏好，防止主题闪烁。
- CSS Modules 只能消费语义 token，例如 `var(--surface-raised)`；禁止在组件中为主题分别硬编码色值。

Token 最少覆盖：

```css
--background;
--surface;
--surface-raised;
--surface-muted;
--text-primary;
--text-secondary;
--text-muted;
--border;
--border-strong;
--accent;
--accent-hover;
--accent-soft;
--danger;
--warning;
--success;
--shadow-sm;
--shadow-md;
--radius-sm;
--radius-md;
--radius-lg;
```

## 4. 应用框架状态

侧边栏状态属于纯 UI 状态，不进入业务 Store：

- 桌面：`sidebarCollapsed` 在当前浏览器持久化。
- 移动端：`mobileSidebarOpen` 不持久化。
- 共用切换按钮，根据 media query 语义选择“折叠/展开”或“打开/关闭抽屉”。
- 移动抽屉使用 Radix Dialog，利用其遮罩、焦点和滚动锁定能力。
- 选择会话后关闭移动抽屉，桌面折叠状态不变。

## 5. 认证呈现合同

现有 `login(email, password)`、`register(email, password)` 和 `logout()` 调用保持不变。

前端认证 UI 可增加：

```ts
interface AuthUiState {
  email: string | null;
  dialogOpen: boolean;
  mode: 'login' | 'register';
}
```

- 成功登录/注册后保存输入邮箱，用于账户区域展示。
- token 存在但没有保存邮箱时显示“已登录”，不得伪造邮箱。
- Dialog 关闭不清空字段；成功后清空字段并关闭。
- 未登录时不会调用线程列表或聊天发送操作。

## 6. Composer 合同

```ts
interface LastRunRequest {
  content: string;
  checkpointId: string | null;
  mode: RunMode;
  showUserMessage?: boolean;
  baseHistory?: HistoryMessage[];
}
```

- `textarea` 高度随 `scrollHeight` 增长，并有最大高度，超过后内部滚动。
- `keydown` 满足 `Enter && !Shift && !nativeEvent.isComposing` 时发送。
- 发送前校验：已登录、内容非空、当前控制未禁用。
- 运行中按钮执行：先 `AbortController.abort()`，再调用当前 run 的取消 API。
- 重试使用最后一次完整的 `LastRunRequest`，不得只复用文本而丢失 mode/checkpoint/baseHistory。

## 7. 消息与展示事件投影

后端事件协议保持不变。为了避免 structured output 和 generative UI 单值覆盖，前端增加有序展示集合：

```ts
type PresentationKind =
  | 'tool-result'
  | 'approval'
  | 'structured-output'
  | 'generative-ui'
  | 'error';

interface PresentationItem {
  id: string;
  runId: string;
  sequence: number;
  kind: PresentationKind;
  data: Record<string, unknown>;
}
```

- `id` 首选事件中的稳定 ID；缺失时使用 `${runId}:${sequence}:${kind}`。
- reducer 按 `sequence` 去重并追加，展示顺序由事件 sequence 决定。
- 历史回放无法提供原始展示事件时，只显示后端历史中可恢复的内容，不伪造结果顺序。
- 当前 `structuredOutput`、`generativeUi` 等字段可在迁移期保留，组件切换完成后再删除；不得一次性破坏现有调用者。

## 8. Markdown 与复制行为

- `MessageContent` 继续使用 `react-markdown` 和 `remark-gfm`。
- 自定义 `code` renderer 区分 inline code 和 fenced code。
- 代码块复制使用 `navigator.clipboard.writeText`，成功状态以组件局部 state 保存约 1500ms。
- Clipboard API 不可用或失败时保持原文本并显示可恢复失败状态，不能导致消息渲染失败。
- 表格外层由 renderer 包装为可横向滚动容器。

## 9. Radix 与图标边界

按需使用：

- Dialog：认证和移动侧边栏。
- DropdownMenu：主题菜单和账户菜单。
- Collapsible：结构化输出和生成式 UI 卡片。
- ScrollArea：侧边栏会话列表。
- Tooltip：折叠侧边栏图标按钮。

图标使用 `lucide-react`。Radix 负责交互语义和无障碍，CSS Modules 负责全部视觉，不使用 Radix Themes。

## 10. 响应式与动效

- 宽桌面：展开侧边栏 + 居中内容列。
- 中等桌面/平板：可折叠侧边栏，内容列保持阅读宽度。
- 手机：侧边栏抽屉，顶栏常驻，输入区安全贴底。
- 所有 hover/focus/overlay/slide 动画使用短时过渡。
- `prefers-reduced-motion: reduce` 时关闭非必要位移和入场动画。

## 11. 兼容、迁移与回滚

- 先建立主题 token 和 AppShell，再逐个迁移组件，避免一次性全局重写。
- 每个阶段都必须保证 `pnpm build` 通过。
- Store 展示模型变更先提供兼容字段，最后统一删除旧字段。
- 若 Radix 集成导致功能回归，可回滚对应交互组件而保留 token 和视觉样式。
- 不修改后端，因此产品回滚只涉及前端依赖、组件和 CSS。

## 12. 风险

- 当前认证数据没有用户资料，账户区必须允许身份文案退化。
- 结果事件没有通用 `card_id`；同一结果的增量合并只能使用现有数据或 run/sequence，不能假设不存在的协议字段。
- 真实浏览器视觉验证需要可启动前端；后端不可用时可验证未登录和静态状态，但完整业务流需连接现有服务。
- 大规模格式调整容易掩盖逻辑 diff，实施应分阶段提交并审查业务文件变化。
