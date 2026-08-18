import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findPreviousUserContent,
  timelineBeforeAssistantAttempt,
  timelineBeforeItem,
} from '../src/modules/timeline/domain/conversation.ts';

const message = (id, role, content) => ({
  id,
  kind: 'message',
  run_id: null,
  sequence: 1,
  logical_message_id: id,
  role,
  content,
  status: 'completed',
  terminal_segment: true,
});

test('重新生成从统一时间线找到前一条用户输入', () => {
  const items = [
    message('user-1', 'user', '第一次提问'),
    message('assistant-1', 'assistant', '第一次回答'),
    { id: 'tool-1', kind: 'tool', status: 'completed' },
    message('user-2', 'user', '第二次提问'),
    message('assistant-2', 'assistant', '第二次回答'),
  ];

  assert.equal(findPreviousUserContent(items, 'assistant-2'), '第二次提问');
  assert.equal(findPreviousUserContent(items, 'missing'), null);
});

test('编辑分支裁剪目标条目及其后全部语义事件', () => {
  const timeline = {
    version: 1,
    items: [
      message('user-1', 'user', '问题'),
      { id: 'reasoning-1', kind: 'reasoning', status: 'completed' },
      message('assistant-1', 'assistant', '回答'),
    ],
  };

  assert.deepEqual(
    timelineBeforeItem(timeline, 'assistant-1').items.map((item) => item.id),
    ['user-1', 'reasoning-1'],
  );
});

test('重新生成移除同一助手尝试的所有文本段和工具条目', () => {
  const timeline = {
    version: 1,
    items: [
      message('user-1', 'user', '问题'),
      { ...message('assistant-segment-1', 'assistant', '先查询'), logical_message_id: 'reply-1' },
      { id: 'tool-1', kind: 'tool', status: 'completed' },
      { ...message('assistant-segment-2', 'assistant', '查询完成'), logical_message_id: 'reply-1' },
    ],
  };

  assert.deepEqual(
    timelineBeforeAssistantAttempt(timeline, 'assistant-segment-2').items.map((item) => item.id),
    ['user-1'],
  );
});
