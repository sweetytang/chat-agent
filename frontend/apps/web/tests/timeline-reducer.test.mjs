import assert from 'node:assert/strict';
import test from 'node:test';

import { reduceTimeline } from '../src/modules/timeline/domain/reduceTimeline.ts';

const base = { version: 1, run_id: 'run-1', thread_id: 'thread-1' };
const event = (sequence, name, data) => ({ ...base, sequence, event: name, data });

test('时间线 reducer 保留文本、工具、文本的真实生成顺序', () => {
  let timeline = { version: 1, items: [] };
  const events = [
    event(1, 'message.started', { item_id: 'segment-1', message_id: 'message-1' }),
    event(2, 'message.delta', { item_id: 'segment-1', content: '先查询' }),
    event(3, 'message.completed', { item_id: 'segment-1' }),
    event(4, 'tool.call', { tool_call_id: 'call-1', tool: 'search', arguments: {} }),
    event(5, 'tool.result', { tool_call_id: 'call-1', content: { ok: true } }),
    event(6, 'message.started', { item_id: 'segment-2', message_id: 'message-1' }),
    event(7, 'message.delta', { item_id: 'segment-2', content: '查询完成' }),
  ];
  for (const item of events) timeline = reduceTimeline(timeline, item);

  assert.deepEqual(
    timeline.items.map((item) => item.id),
    ['segment-1', 'call-1', 'segment-2'],
  );
  assert.equal(timeline.items[1].status, 'completed');
  assert.equal(timeline.items[0].terminal_segment, false);
});

test('运行失败会结束所有未完成条目后再追加错误', () => {
  let timeline = { version: 1, items: [] };
  const events = [
    event(1, 'message.started', { item_id: 'segment-1', message_id: 'message-1' }),
    event(2, 'reasoning.delta', { item_id: 'reasoning-1', content: '分析' }),
    event(3, 'tool.call', { tool_call_id: 'call-1', tool: 'search', arguments: {} }),
    event(4, 'structured_output.delta', { item_id: 'structured-1', value: { ok: true } }),
  ];
  for (const item of events) timeline = reduceTimeline(timeline, item);

  timeline = reduceTimeline(timeline, event(5, 'run.failed', { error: '运行失败' }));

  assert.deepEqual(
    timeline.items.slice(0, -1).map((item) => item.status),
    ['failed', 'failed', 'failed', 'failed'],
  );
  assert.equal(timeline.items.at(-1).kind, 'error');
});
