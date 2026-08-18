import assert from 'node:assert/strict';
import test from 'node:test';

import { createFrameEventDispatcher } from '../src/modules/runs/domain/frameEventDispatcher.ts';

function event(sequence, name, content = '') {
  return {
    version: 1,
    event: name,
    run_id: 'run-1',
    thread_id: 'thread-1',
    sequence,
    data: { item_id: 'segment-1', content },
  };
}

test('同一帧内的消息增量合并为一次更新', () => {
  const dispatched = [];
  let frameCallback;
  const dispatcher = createFrameEventDispatcher(
    (agentEvent) => dispatched.push(agentEvent),
    (callback) => {
      frameCallback = callback;
      return 1;
    },
    () => {},
  );

  dispatcher.push(event(1, 'message.delta', '杭'));
  dispatcher.push(event(2, 'message.delta', '州'));

  assert.equal(dispatched.length, 0);
  frameCallback();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].sequence, 2);
  assert.equal(dispatched[0].data.content, '杭州');
});

test('完成事件前同步提交剩余增量并保持事件顺序', () => {
  const dispatched = [];
  const dispatcher = createFrameEventDispatcher(
    (agentEvent) => dispatched.push(agentEvent),
    () => 1,
    () => {},
  );

  dispatcher.push(event(1, 'message.delta', '完整回答'));
  dispatcher.push(event(2, 'message.completed'));

  assert.deepEqual(
    dispatched.map((agentEvent) => agentEvent.event),
    ['message.delta', 'message.completed'],
  );
  assert.equal(dispatched[0].data.content, '完整回答');
});

test('中止流时丢弃未提交的增量', () => {
  const dispatched = [];
  let cancelledFrame = null;
  const dispatcher = createFrameEventDispatcher(
    (agentEvent) => dispatched.push(agentEvent),
    () => 7,
    (frameId) => {
      cancelledFrame = frameId;
    },
  );

  dispatcher.push(event(1, 'message.delta', '旧线程内容'));
  dispatcher.cancel();
  dispatcher.flush();

  assert.equal(cancelledFrame, 7);
  assert.deepEqual(dispatched, []);
});

test('同一帧内不同条目的增量保持到达顺序', () => {
  const dispatched = [];
  let frameCallback;
  const dispatcher = createFrameEventDispatcher(
    (agentEvent) => dispatched.push(agentEvent),
    (callback) => {
      frameCallback = callback;
      return 1;
    },
    () => {},
  );

  dispatcher.push({
    ...event(1, 'reasoning.delta', '分析'),
    data: { item_id: 'reasoning-1', content: '分析' },
  });
  dispatcher.push({
    ...event(2, 'message.delta', '回答'),
    data: { item_id: 'segment-1', content: '回答' },
  });
  frameCallback();

  assert.deepEqual(
    dispatched.map((item) => item.data.item_id),
    ['reasoning-1', 'segment-1'],
  );
});
