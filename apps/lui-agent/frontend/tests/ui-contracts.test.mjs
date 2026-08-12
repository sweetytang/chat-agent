import assert from 'node:assert/strict';
import test from 'node:test';

import { isThemePreference, resolveTheme, storedThemePreference } from '../src/app/domain/theme.ts';
import { shouldSubmitComposer } from '../src/modules/chat/domain/composer.ts';
import { appendPresentationItem } from '../src/modules/presentation/domain/items.ts';
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

test('展示项按 sequence 排序并忽略重复事件', () => {
  const later = appendPresentationItem([], 'run-1', 4, 'generative-ui', { text: '界面' });
  const ordered = appendPresentationItem(later, 'run-1', 2, 'structured-output', { value: '结果' });
  const duplicate = appendPresentationItem(ordered, 'run-1', 2, 'tool-result', { tool: 'calc' });

  assert.deepEqual(
    ordered.map((item) => item.sequence),
    [2, 4],
  );
  assert.equal(duplicate, ordered);
  assert.deepEqual(
    ordered.map((item) => item.kind),
    ['structured-output', 'generative-ui'],
  );
});

test('审核与失败事件可作为重复展示的有序卡片保留', () => {
  const approval = appendPresentationItem([], 'run-1', 3, 'approval', {
    request_id: 'request-1',
  });
  const failed = appendPresentationItem(approval, 'run-1', 8, 'error', {
    error: '运行失败',
  });

  assert.deepEqual(
    failed.map((item) => [item.sequence, item.kind]),
    [
      [3, 'approval'],
      [8, 'error'],
    ],
  );
});
