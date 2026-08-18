# 技术设计

## 边界

### 通用工具卡片

保留 `ToolItem` 作为唯一输入契约，由 `ToolCallCard` 负责三件事：

1. 将工具名、生命周期状态、审核状态转换为用户文案。
2. 将 `arguments` 和 `result` 转换为参数行、结果预览和原始 JSON。
3. 通过 `CodeBlock` 输出原始/未识别数据，不直接输出业务级裸 `<pre>`。

卡片不再使用 MCP 专用标题；结果渲染器按最小通用协议处理：

```text
链接对象 -> 可点击链接卡片
content_blocks -> 逐块处理
错误字段 -> 错误提示
其他 JSON -> CodeBlock(JSON)
```

### 全局 CodeBlock

组件位置：`frontend/apps/web/src/shared/components/CodeBlock/`，底层采用 CodeMirror 6 的 React 封装 `@uiw/react-codemirror`。

公开接口：

```ts
interface CodeBlockProps {
  value: string;
  language?: string;
  label?: string;
  showCopy?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  extensions?: Extension[];
  height?: string;
  lineNumbers?: boolean;
  folding?: boolean;
}
```

`language` 由显式参数优先，其次从 Markdown 的 `language-*` 类名提取，缺省显示“代码”。
CodeMirror 的 `readOnly`/`editable` 配置决定同一组件是只读展示还是可编辑配置；语言包、补全、折叠、校验等通过 `extensions` 注入。主题、容器、工具栏、复制状态和尺寸边界由 CSS Module 与全局 `--code-*` token 控制。

### 替换路径

```text
Markdown MessageContent
        └─ shared CodeBlock
ToolCallCard result/raw
        └─ shared CodeBlock
StructuredOutputCard JSON
        └─ shared CodeBlock
McpSettings JsonEditor
        └─ CodeBlock(readOnly=false, language=json)
```

聊天模块中的旧 `CodeBlock` 目录删除或改为兼容导出，避免项目内出现两个实现；所有新引用指向 shared 组件。

## 兼容性与风险

- `react-markdown` 的 `code` renderer 继续保留行内代码分支，只替换 fenced code 分支。
- CodeMirror 语言包按需注册，未知语言以纯文本渲染，避免动态加载失败阻塞消息。
- JSON 字符串化统一在调用方完成，CodeBlock 不承担未知值序列化责任。
- 现有未提交的 ToolCallCard 视觉改造保留并在其上抽取 CodeBlock，不覆盖用户已有工作。

## 回滚

若 CodeMirror 语言包导致构建体积或运行时问题，可保留 CodeBlock API，减少默认 extensions 和语言包；业务调用方不需要再次修改。
