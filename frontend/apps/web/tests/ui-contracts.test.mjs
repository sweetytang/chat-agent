import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import { isThemePreference, resolveTheme, storedThemePreference } from '../src/app/domain/theme.ts';
import { shouldSubmitComposer } from '../src/modules/chat/domain/composer.ts';
import { stopRun } from '../src/modules/runs/domain/stopRun.ts';

test('主题偏好校验并正确解析系统主题', () => {
  assert.equal(isThemePreference('dark'), true);
  assert.equal(isThemePreference('invalid'), false);
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(storedThemePreference('dark'), 'dark');
  assert.equal(storedThemePreference('invalid'), 'system');
});

test('停止运行先中止本地流，再请求后端取消', async () => {
  const calls = [];
  await stopRun(
    () => calls.push('abort'),
    'run-1',
    async () => {
      calls.push('cancel');
    },
  );
  assert.deepEqual(calls, ['abort', 'cancel']);
});

test('Composer 仅在非组合输入的单独 Enter 时发送', () => {
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true }), false);
});

test('HITL 恢复按原会话刷新历史和线程列表', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /refreshThread\(targetThreadId, true\)/);
  assert.match(source, /loadThreads\(\)/);
  assert.match(source, /consumeRunStream/);
  assert.match(source, /threadId,/);
  assert.ok(source.indexOf('prepareResume(targetThreadId)') < source.indexOf('resolveInterrupt('));
  assert.match(source, /currentRun\.runId !== runId/);
  assert.match(source, /status !== RunStatus\.Resuming/);
  assert.match(source, /currentRun\.runId === runId/);
  assert.match(source, /isActiveRunStatus\(currentRun\.status\)/);
  assert.doesNotMatch(source, /token === authToken|token !== authToken/);
});

test('线程操作菜单仅包含重命名、置顶和删除并保持产品顺序', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/threads/components/ThreadActions/index.tsx', import.meta.url),
    'utf8',
  );
  const rename = source.indexOf('Rename');
  const pin = source.indexOf("thread.is_pinned ? 'Unpin chat' : 'Pin chat'");
  const remove = source.lastIndexOf('Delete');

  assert.ok(rename > 0);
  assert.ok(pin > rename);
  assert.ok(remove > pin);
  assert.match(source, /title\.trim\(\)/);
});

test('删除线程只清理目标流和投影，并在删除当前线程后刷新下一条', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/threads/store/thread.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /abortActiveStream\(threadId\);\s*useRunStore\.getState\(\)\.resetThread\(threadId\)/,
  );
  assert.match(source, /const nextThread = threads\[0\]/);
  assert.match(source, /await get\(\)\.refreshThread\(nextThread\.id, true\)/);
  assert.match(source, /threadId: DEMO_THREAD_ID/);
});

test('首条发送会先把 demo-thread 替换为真实线程', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /selectedThread\.threadId === 'demo-thread'/);
  assert.match(source, /createThread\(content, true\)/);
  assert.match(source, /threadId: thread\.id/);
});

test('新建会话只进入欢迎态，首次发送后才创建真实线程并先展示输入标题', () => {
  const sidebar = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.tsx', import.meta.url),
    'utf8',
  );
  const chat = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );
  const store = fs.readFileSync(
    new URL('../src/modules/threads/store/thread.ts', import.meta.url),
    'utf8',
  );

  assert.match(sidebar, /startNewThread\(\)/);
  assert.doesNotMatch(
    sidebar,
    /const thread = await useThreadStore\.getState\(\)\.createThread\(\)/,
  );
  assert.match(store, /startNewThread:/);
  assert.match(chat, /setCurrentThreadTitle\(content\)/);
});

test('首次发送先离开欢迎页，创建线程时保留乐观用户消息', () => {
  const chat = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );
  const store = fs.readFileSync(
    new URL('../src/modules/threads/store/thread.ts', import.meta.url),
    'utf8',
  );

  assert.match(chat, /beginRun\('demo-thread', content\)[\s\S]*createThread\(content, true\)/);
  assert.match(chat, /threadId: thread\.id/);
  assert.match(store, /createThread: \(title\?: string, migrateDemoProjection\?: boolean\)/);
  assert.match(store, /migrateThread\(DEMO_THREAD_ID, thread\.id\)/);
  assert.match(store, /createThreadRequest\(title\)/);
});

test('跨会话导航不再受当前运行状态全局禁用', () => {
  const shell = fs.readFileSync(
    new URL('../src/app/components/AppShell/index.tsx', import.meta.url),
    'utf8',
  );
  const sidebar = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(shell, /controlsDisabled/);
  assert.doesNotMatch(sidebar, /itemLink[\s\S]{0,120}disabled=/);
  assert.match(sidebar, /<ThreadRunStatus threadId=\{thread\.id\} \/>/);
});

test('输入草稿由 Chat 持有，切换会话不会重建或清空草稿', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/chat/components/Chat/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /const \[input, setInput\] = useState\(''\)/);
  assert.doesNotMatch(source, /useEffect\([\s\S]{0,180}setInput\(''\)[\s\S]{0,80}\[threadId\]/);
  assert.match(source, /const selectedThread = useThreadStore\.getState\(\)/);
  assert.match(source, /threadId: selectedThread\.threadId/);
  assert.match(source, /setInput\(\(draft\) => draft \|\| content\)/);
});

test('活动会话仅禁用删除，仍允许重命名和置顶', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/threads/components/ThreadActions/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /const deleteDisabled = useRunStore/);
  assert.match(source, /disabled=\{deleteDisabled\}[\s\S]*openDialog\('delete'\)/);
  assert.doesNotMatch(source, /DropdownMenu\.Trigger[\s\S]{0,300}disabled=/);
});

test('运行中的时间线刷新不会用落后快照覆盖实时投影', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/runs/store/run.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /preserveRunState && isStreamingRunStatus\(state\.status\)[\s\S]*\? state/);
});

test('流式消息使用稳定分块 Markdown 渲染', () => {
  const bubble = fs.readFileSync(
    new URL('../src/modules/chat/components/MessageBubble/index.tsx', import.meta.url),
    'utf8',
  );
  const timelineReducer = fs.readFileSync(
    new URL('../src/modules/timeline/domain/reduceTimeline.ts', import.meta.url),
    'utf8',
  );
  const markdown = fs.readFileSync(
    new URL('../src/modules/chat/components/MessageContent/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(bubble, /<MessageContent content=\{message\.content\} \/>/);
  assert.match(timelineReducer, /status: 'streaming'/);
  assert.match(timelineReducer, /message\.completed[\s\S]*status: 'completed'/);
  assert.match(markdown, /import \{ Lexer \} from 'marked'/);
  assert.match(markdown, /const remarkPlugins = \[remarkGfm\]/);
  assert.match(markdown, /const markdownComponents: Components/);
  assert.match(markdown, /const MarkdownBlock = memo/);
  assert.match(markdown, /function splitMarkdownBlocks/);
  assert.match(markdown, /token\.type === 'def'/);
  assert.match(markdown, /key: `\$\{index\}-\$\{token\.type\}`/);
  assert.match(markdown, /<MarkdownBlock content=\{block\.content\} key=\{block\.key\}/);
  assert.match(markdown, /memo\(MessageContentComponent\)/);
});

test('无助手文本的终态卡片也渲染通用分支控件', () => {
  const timeline = fs.readFileSync(
    new URL('../src/modules/timeline/components/ChatTimeline/index.tsx', import.meta.url),
    'utf8',
  );
  const controls = fs.readFileSync(
    new URL('../src/modules/timeline/components/TimelineBranchControls/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(timeline, /item\.kind !== 'message'[\s\S]*<TimelineBranchControls/);
  assert.match(controls, /branchOptions\.length <= 1/);
  assert.match(controls, /<BranchSwitcher/);
});

test('认证邮箱持久化，缺少 profile 时使用固定中性身份', () => {
  const session = fs.readFileSync(
    new URL('../src/shared/session/authSession.ts', import.meta.url),
    'utf8',
  );
  const account = fs.readFileSync(
    new URL('../src/modules/auth/components/AccountMenu/index.tsx', import.meta.url),
    'utf8',
  );
  assert.match(session, /AUTH_EMAIL_KEY/);
  assert.match(session, /getAuthEmail/);
  assert.match(account, /email \?\? '已登录账户'/);
  assert.match(account, /\?\? 'U'/);
});

test('Guest 账号区通过 flex 占据底部位置', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.module.css', import.meta.url),
    'utf8',
  );
  assert.match(source, /\.guest\s*\{[^}]*flex:\s*1/);
  assert.match(source, /\.account\s*\{[^}]*margin-top:\s*auto/);
});

test('线程行 hover 显示背景和操作按钮，操作按钮默认隐藏', () => {
  const sidebar = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.module.css', import.meta.url),
    'utf8',
  );
  const actions = fs.readFileSync(
    new URL('../src/modules/threads/components/ThreadActions/index.module.css', import.meta.url),
    'utf8',
  );
  assert.match(sidebar, /\.item:hover[\s\S]*background: var\(--surface-hover\)/);
  assert.match(sidebar, /\.item:hover \[data-thread-actions-trigger\]/);
  assert.match(
    fs.readFileSync(
      new URL('../src/modules/threads/components/ThreadActions/index.tsx', import.meta.url),
      'utf8',
    ),
    /data-thread-actions/,
  );
  assert.match(actions, /visibility: hidden/);
  assert.match(actions, /pointer-events: none/);
});

test('全局按钮和菜单项聚焦时不显示边框或阴影', () => {
  const source = fs.readFileSync(new URL('../src/app/styles/global.css', import.meta.url), 'utf8');
  assert.match(source, /button:focus,[\s\S]*button:focus-visible/);
  assert.match(source, /\[role='menuitem'\]:focus-visible[\s\S]*outline: none/);
  assert.match(source, /box-shadow: none/);
});

test('顶部覆盖层仅保留主题菜单且不占用聊天区域高度', () => {
  const component = fs.readFileSync(
    new URL('../src/app/components/AppTopBar/index.tsx', import.meta.url),
    'utf8',
  );
  const styles = fs.readFileSync(
    new URL('../src/app/components/AppTopBar/index.module.css', import.meta.url),
    'utf8',
  );
  const shell = fs.readFileSync(
    new URL('../src/app/components/AppShell/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(component, /<ThemeMenu \/>/);
  assert.doesNotMatch(component, /BrandMark|\bMenu\b|onToggleSidebar/);
  assert.doesNotMatch(shell, /onToggleSidebar/);
  assert.match(styles, /position:\s*absolute/);
  assert.doesNotMatch(styles, /height:\s*62px/);
});

test('切换会话加载时间线时不展示欢迎页', () => {
  const timeline = fs.readFileSync(
    new URL('../src/modules/timeline/components/ChatTimeline/index.tsx', import.meta.url),
    'utf8',
  );

  assert.match(timeline, /loading && timeline\.items\.length === 0/);
  assert.match(timeline, /timeline\.items\.length === 0 && !active/);
  assert.match(timeline, /aria-label="正在加载会话"/);
  assert.match(timeline, /aria-live="polite"[\s\S]*role="status"/);
});

test('首次加载会话列表时展示加载态而不是空态', () => {
  const sidebar = fs.readFileSync(
    new URL('../src/modules/threads/components/Sidebar/index.tsx', import.meta.url),
    'utf8',
  );
  const store = fs.readFileSync(
    new URL('../src/modules/threads/store/thread.ts', import.meta.url),
    'utf8',
  );

  assert.match(store, /isLoadingThreads: boolean/);
  assert.match(store, /isLoadingThreads: true/);
  assert.match(store, /loadThreads: async \(\) => \{[\s\S]*set\(\{ isLoadingThreads: true \}\)/);
  assert.match(store, /finally \{[\s\S]*set\(\{ isLoadingThreads: false \}\)/);
  assert.match(store, /requestId === latestThreadsRequestId/);
  assert.match(sidebar, /isLoadingThreads[\s\S]*threadListLoading[\s\S]*threads\.length === 0/);
  assert.match(sidebar, /aria-label="正在加载会话列表"/);
  assert.match(sidebar, /aria-live="polite"[\s\S]*role="status"/);
});
