import assert from "node:assert/strict";
import test from "node:test";

import {
  findPreviousUserContent,
  getMessageBranchIndex,
  historyBeforeMessage,
} from "../src/modules/checkpoints/domain/history.ts";

const baseMessage = {
  checkpoint_id: null,
  parent_checkpoint_id: null,
  branch_options: [],
  branch_index: null,
};

test("优先使用服务端返回的分支下标", () => {
  const message = {
    ...baseMessage,
    id: "assistant-1",
    role: "assistant",
    content: "回答",
    branch_index: 1,
    branch_options: [
      { checkpoint_id: "checkpoint-a" },
      { checkpoint_id: "checkpoint-b" },
    ],
  };

  assert.equal(getMessageBranchIndex(message), 1);
});

test("缺少分支下标时使用消息 checkpoint 匹配当前版本", () => {
  const message = {
    ...baseMessage,
    id: "assistant-1",
    role: "assistant",
    content: "回答",
    checkpoint_id: "checkpoint-b",
    branch_options: [
      { checkpoint_id: "checkpoint-a" },
      { checkpoint_id: "checkpoint-b" },
    ],
  };

  assert.equal(getMessageBranchIndex(message), 1);
});

test("重新生成只读取目标 AI 消息之前最近的用户文本", () => {
  const history = [
    { ...baseMessage, id: "user-1", role: "user", content: "第一次提问" },
    { ...baseMessage, id: "assistant-1", role: "assistant", content: "第一次回答" },
    { ...baseMessage, id: "user-2", role: "user", content: "第二次提问" },
    { ...baseMessage, id: "assistant-2", role: "assistant", content: "第二次回答" },
  ];

  assert.equal(findPreviousUserContent(history, "assistant-2"), "第二次提问");
  assert.equal(findPreviousUserContent(history, "assistant-1"), "第一次提问");
  assert.equal(findPreviousUserContent(history, "missing"), null);
});

test("编辑或重新生成旧消息时先移除该消息及其后续历史", () => {
  const history = [
    { ...baseMessage, id: "user-1", role: "user", content: "第一次提问" },
    { ...baseMessage, id: "assistant-1", role: "assistant", content: "第一次回答" },
    { ...baseMessage, id: "user-2", role: "user", content: "第二次提问" },
  ];

  assert.deepEqual(
    historyBeforeMessage(history, "assistant-1").map((message) => message.id),
    ["user-1"],
  );
  assert.equal(historyBeforeMessage(history, "missing"), history);
});
