import assert from 'node:assert/strict';
import test from 'node:test';

import { filterThreads } from '../src/modules/threads/domain/search.ts';

const threads = [
  { id: 'latest', title: '项目计划', current_checkpoint_id: null },
  { id: 'middle', title: 'React 排查', current_checkpoint_id: null },
  { id: 'oldest', title: null, current_checkpoint_id: null },
];

test('空查询保持服务端线程顺序和数组引用', () => {
  assert.equal(filterThreads(threads, '  '), threads);
});

test('按标题过滤且不改变服务端线程顺序', () => {
  const results = filterThreads(threads, '项');

  assert.deepEqual(
    results.map((thread) => thread.id),
    ['latest'],
  );
  assert.deepEqual(
    filterThreads(threads, '未命名').map((thread) => thread.id),
    ['oldest'],
  );
});
