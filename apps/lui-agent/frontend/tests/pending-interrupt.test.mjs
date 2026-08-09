import assert from "node:assert/strict";
import test from "node:test";

import {
  pendingApprovalFromInterrupt,
  syncPendingApproval,
} from "../src/modules/interrupts/domain/pendingInterrupt.ts";

const baseInterrupt = {
  request_id: "request-1",
  run_id: "run-1",
  kind: "fallback-tool",
  payload: {},
};

const interruptedState = {
  runId: "run-old",
  status: "interrupted",
  pendingApproval: {
    requestId: "request-old",
    runId: "run-old",
    tool: "old-tool",
  },
};

test("待审核工具名依次使用响应 tool、payload.tool 和 kind", () => {
  assert.equal(
    pendingApprovalFromInterrupt({
      ...baseInterrupt,
      tool: "response-tool",
      payload: { tool: "payload-tool" },
    }).tool,
    "response-tool",
  );
  assert.equal(
    pendingApprovalFromInterrupt({
      ...baseInterrupt,
      payload: { tool: "payload-tool" },
    }).tool,
    "payload-tool",
  );
  assert.equal(pendingApprovalFromInterrupt(baseInterrupt).tool, "fallback-tool");
});

test("待审核快照恢复 requestId、runId、tool 并进入 interrupted", () => {
  assert.deepEqual(
    syncPendingApproval(
      { runId: null, status: "idle", pendingApproval: null },
      { ...baseInterrupt, payload: { tool: "web_search" } },
    ),
    {
      runId: "run-1",
      status: "interrupted",
      pendingApproval: {
        requestId: "request-1",
        runId: "run-1",
        tool: "web_search",
      },
    },
  );
});

test("无待审核快照时清除旧卡片", () => {
  assert.deepEqual(syncPendingApproval(interruptedState, null), {
    ...interruptedState,
    pendingApproval: null,
  });
  assert.equal(
    syncPendingApproval(interruptedState, null, true).pendingApproval,
    null,
  );
});

test("保留运行状态刷新时不清除正在排队、流式或恢复中的审核卡片", () => {
  for (const status of ["queued", "running", "resuming"]) {
    const state = { ...interruptedState, status };
    assert.equal(syncPendingApproval(state, null, true), state);
  }
});
