/* global AbortController */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  abortActiveStream,
  abortAllStreams,
  activateStream,
  clearActiveStream,
} from '../src/modules/runs/domain/activeStream.ts';
import { runStatusIndicator } from '../src/modules/runs/domain/status.ts';
import { selectThreadRun, useRunStore } from '../src/modules/runs/store/run.ts';
import { createLatestRequestTracker } from '../src/modules/threads/domain/latestRequest.ts';

function event(threadId, sequence, name, data = {}) {
  return {
    version: 1,
    event: name,
    run_id: `run-${threadId}`,
    thread_id: threadId,
    sequence,
    data,
  };
}

test.afterEach(() => {
  abortAllStreams();
  useRunStore.getState().resetAll();
});

test('不同会话的流控制器互不影响', () => {
  const controllerA = new AbortController();
  const controllerB = new AbortController();
  activateStream('thread-a', controllerA);
  activateStream('thread-b', controllerB);

  abortActiveStream('thread-a');

  assert.equal(controllerA.signal.aborted, true);
  assert.equal(controllerB.signal.aborted, false);
});

test('同一会话的新流替换旧流，旧流结束不会清掉新流', () => {
  const oldController = new AbortController();
  const newController = new AbortController();
  activateStream('thread-a', oldController);
  activateStream('thread-a', newController);
  clearActiveStream('thread-a', oldController);
  abortActiveStream('thread-a');

  assert.equal(oldController.signal.aborted, true);
  assert.equal(newController.signal.aborted, true);
});

test('相同 sequence 的不同会话事件分别进入各自投影', () => {
  const store = useRunStore.getState();
  store.applyEvent(event('thread-a', 1, 'run.started'));
  store.applyEvent(event('thread-b', 1, 'run.started'));
  store.applyEvent(
    event('thread-a', 2, 'message.started', { item_id: 'segment-a', message_id: 'message-a' }),
  );
  store.applyEvent(
    event('thread-b', 2, 'message.started', { item_id: 'segment-b', message_id: 'message-b' }),
  );
  store.applyEvent(
    event('thread-a', 3, 'message.delta', { item_id: 'segment-a', content: 'A 的回答' }),
  );
  store.applyEvent(
    event('thread-b', 3, 'message.delta', { item_id: 'segment-b', content: 'B 的回答' }),
  );

  const state = useRunStore.getState();
  assert.equal(selectThreadRun(state, 'thread-a').timeline.items.at(-1).content, 'A 的回答');
  assert.equal(selectThreadRun(state, 'thread-b').timeline.items.at(-1).content, 'B 的回答');
  assert.equal(selectThreadRun(state, 'thread-a').lastSequence, 3);
  assert.equal(selectThreadRun(state, 'thread-b').lastSequence, 3);
});

test('重置单个会话不会清除其他会话投影', () => {
  const store = useRunStore.getState();
  store.applyEvent(event('thread-a', 1, 'run.failed', { error: 'A 失败' }));
  store.applyEvent(event('thread-b', 1, 'run.started'));
  store.resetThread('thread-a');

  const state = useRunStore.getState();
  assert.equal(selectThreadRun(state, 'thread-a').status, 'idle');
  assert.equal(selectThreadRun(state, 'thread-b').status, 'running');
});

test('停止和待审核状态都只修改目标会话', () => {
  const store = useRunStore.getState();
  store.applyEvent(event('thread-a', 1, 'run.started'));
  store.applyEvent(event('thread-b', 1, 'run.started'));
  store.applyEvent(
    event('thread-a', 2, 'tool.call', {
      tool_call_id: 'call-a',
      tool: 'shell',
      arguments: {},
    }),
  );
  store.applyEvent(
    event('thread-a', 3, 'tool.approval_required', {
      tool_call_id: 'call-a',
      request_id: 'approval-a',
      tool: 'shell',
    }),
  );
  store.markCancelled('thread-b');

  const state = useRunStore.getState();
  assert.equal(selectThreadRun(state, 'thread-a').status, 'interrupted');
  assert.equal(selectThreadRun(state, 'thread-a').pendingApproval.requestId, 'approval-a');
  assert.equal(selectThreadRun(state, 'thread-b').status, 'cancelled');
  assert.equal(selectThreadRun(state, 'thread-b').pendingApproval, null);
});

test('审核恢复立即关闭目标会话的可操作审核项，不影响其他会话', () => {
  const store = useRunStore.getState();
  store.applyEvent(
    event('thread-a', 1, 'tool.call', { tool_call_id: 'call-a', tool: 'shell', arguments: {} }),
  );
  store.applyEvent(
    event('thread-a', 2, 'tool.approval_required', {
      tool_call_id: 'call-a',
      request_id: 'approval-a',
      tool: 'shell',
    }),
  );
  store.applyEvent(
    event('thread-b', 1, 'tool.call', { tool_call_id: 'call-b', tool: 'browser', arguments: {} }),
  );
  store.applyEvent(
    event('thread-b', 2, 'tool.approval_required', {
      tool_call_id: 'call-b',
      request_id: 'approval-b',
      tool: 'browser',
    }),
  );

  store.prepareResume('thread-a');

  const state = useRunStore.getState();
  assert.equal(selectThreadRun(state, 'thread-a').status, 'resuming');
  assert.equal(selectThreadRun(state, 'thread-a').pendingApproval, null);
  assert.equal(selectThreadRun(state, 'thread-b').pendingApproval.requestId, 'approval-b');
});

test('demo-thread 乐观投影可迁移到真实会话', () => {
  const store = useRunStore.getState();
  store.beginRun('demo-thread', '第一条消息');
  store.migrateThread('demo-thread', 'thread-created');

  const state = useRunStore.getState();
  assert.equal(selectThreadRun(state, 'demo-thread').timeline.items.length, 0);
  assert.equal(selectThreadRun(state, 'thread-created').timeline.items[0].content, '第一条消息');
});

test('运行中的旧快照不会覆盖实时消息投影，终态快照仍可校准历史', () => {
  const store = useRunStore.getState();
  store.beginRun('thread-a', '新问题');
  store.applyEvent(event('thread-a', 1, 'run.started'));
  store.applyEvent(
    event('thread-a', 2, 'message.started', { item_id: 'segment-a', message_id: 'message-a' }),
  );
  store.applyEvent(
    event('thread-a', 3, 'message.delta', { item_id: 'segment-a', content: '实时回答' }),
  );

  store.setTimeline(
    'thread-a',
    {
      version: 1,
      items: [
        {
          id: 'old-message',
          kind: 'message',
          run_id: null,
          sequence: 1,
          logical_message_id: 'old-message',
          role: 'assistant',
          content: '落后的后端快照',
          status: 'completed',
          terminal_segment: true,
        },
      ],
    },
    true,
  );
  assert.equal(
    selectThreadRun(useRunStore.getState(), 'thread-a').timeline.items.at(-1).content,
    '实时回答',
  );

  store.applyEvent(event('thread-a', 4, 'run.completed'));
  store.setTimeline(
    'thread-a',
    {
      version: 1,
      items: [
        {
          id: 'final-message',
          kind: 'message',
          run_id: null,
          sequence: 1,
          logical_message_id: 'final-message',
          role: 'assistant',
          content: '最终后端时间线',
          status: 'completed',
          terminal_segment: true,
        },
      ],
    },
    true,
  );
  assert.equal(
    selectThreadRun(useRunStore.getState(), 'thread-a').timeline.items.at(-1).content,
    '最终后端时间线',
  );
});

test('侧边栏状态只映射运行中、审核和失败', () => {
  assert.equal(runStatusIndicator('queued'), 'running');
  assert.equal(runStatusIndicator('running'), 'running');
  assert.equal(runStatusIndicator('resuming'), 'running');
  assert.equal(runStatusIndicator('interrupted'), 'approval');
  assert.equal(runStatusIndicator('failed'), 'failed');
  assert.equal(runStatusIndicator('completed'), null);
  assert.equal(runStatusIndicator('cancelled'), null);
  assert.equal(runStatusIndicator('idle'), null);
});

test('A→B→A 快速切换时只接受各会话最后一次快照请求', () => {
  const tracker = createLatestRequestTracker();
  const firstA = tracker.start('thread-a');
  const firstB = tracker.start('thread-b');
  const secondA = tracker.start('thread-a');

  assert.equal(tracker.isLatest('thread-a', firstA), false);
  assert.equal(tracker.isLatest('thread-a', secondA), true);
  assert.equal(tracker.isLatest('thread-b', firstB), true);
});
