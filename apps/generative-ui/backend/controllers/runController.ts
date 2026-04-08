import { Request, Response } from "express";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { createToolMessage } from "../utils/createToolMessage.js";
import { getSystemPrompt } from "@backend/constants";
import { THREAD_START_CHECKPOINT_ID } from "@common/constants";
import type { RunMetadata } from "@common/types/run";
import { requireAuthenticatedUser } from "../middlewares/auth.js";
import { interruptRepository } from "../models/interruptRepository.js";
import { threadCheckpointRepository } from "../models/threadCheckpointRepository.js";
import { threadRepository } from "../models/threadRepository.js";
import { executeTools, getExecutableToolCalls } from "../services/ai/tools/index.js";
import type { ModelRuntimeOptions } from "../services/ai/providerConfig.js";
import { getToolCalls, parseInputMessages, rebuildHistory } from "../services/chat/messageState.js";
import { deserializeMessages, serializeMessages } from "../services/chat/messageSerde.js";
import { modelCallAgent } from "../services/chat/modelRunService.js";
import { createSendEvent, setStreamHeaders } from "../utils/sse.js";
import { DecisionEnum, HITLResponse } from "@common/types/interrupt";
import { SendEvent } from "@backend/types";
import { ThreadCheckpoint, ThreadStatus } from '@common/types/thread';

function getRequestedCheckpointId(body: any): string | null {
    const checkpointId = body?.checkpoint_id;
    if (typeof checkpointId === "string" && checkpointId.length > 0) {
        return checkpointId;
    }

    const checkpoint = body?.checkpoint as ThreadCheckpoint | null | undefined;
    if (checkpoint && typeof checkpoint.checkpoint_id === "string" && checkpoint.checkpoint_id.length > 0) {
        return checkpoint.checkpoint_id;
    }

    return null;
}

function getRunMetadata(body: any): RunMetadata {
    const deepThinkingEnabled = body?.metadata?.deepThinkingEnabled;
    const generativeUiEnabled = body?.metadata?.generativeUiEnabled;
    const structuredOutputEnabled = body?.metadata?.structuredOutputEnabled;
    const metadata: RunMetadata = {};

    if (typeof deepThinkingEnabled === "boolean") {
        metadata.deepThinkingEnabled = deepThinkingEnabled;
    }

    if (typeof generativeUiEnabled === "boolean") {
        metadata.generativeUiEnabled = generativeUiEnabled;
    }

    if (typeof structuredOutputEnabled === "boolean") {
        metadata.structuredOutputEnabled = structuredOutputEnabled;
    }

    return metadata;
}

function toRuntimeOptions(metadata: RunMetadata): ModelRuntimeOptions {
    const runtimeOptions: ModelRuntimeOptions = {};

    if (typeof metadata.deepThinkingEnabled === "boolean") {
        runtimeOptions.deepThinkingEnabled = metadata.deepThinkingEnabled;
    }

    if (typeof metadata.generativeUiEnabled === "boolean") {
        runtimeOptions.generativeUiEnabled = metadata.generativeUiEnabled;
    }

    if (typeof metadata.structuredOutputEnabled === "boolean") {
        runtimeOptions.structuredOutputEnabled = metadata.structuredOutputEnabled;
    }

    return runtimeOptions;
}

async function resolveRunBaseState(userId: string, threadId: string, checkpointId: string | null) {
    const thread = await threadRepository.getForUser(threadId, userId);
    if (!thread) {
        return null;
    }

    if (checkpointId === THREAD_START_CHECKPOINT_ID) {
        return {
            thread,
            parentCheckpointId: null,
            baseMessages: [],
        };
    }

    if (!checkpointId) {
        return {
            thread,
            parentCheckpointId: thread.checkpoint_id ?? null,
            baseMessages: rebuildHistory(thread),
        };
    }

    const checkpointState = await threadCheckpointRepository.getState(threadId, checkpointId);
    if (!checkpointState) {
        throw new Error("Checkpoint 不存在或已失效");
    }

    return {
        thread,
        parentCheckpointId: checkpointId,
        baseMessages: deserializeMessages(checkpointState.values.messages ?? []),
    };
}

async function handleNewMessage(
    userId: string,
    threadId: string,
    payload: any,
    sendEvent: SendEvent,
    runtimeOptions: ModelRuntimeOptions,
) {
    const checkpointId = getRequestedCheckpointId(payload);
    const baseState = await resolveRunBaseState(userId, threadId, checkpointId);

    if (!baseState) {
        sendEvent("error", { error: "Thread not found", message: "线程不存在或无权限访问" });
        return;
    }

    const inputMessages = parseInputMessages(payload?.input);
    const allMessages: BaseMessage[] = [
        ...baseState.baseMessages,
        ...inputMessages,
    ];
    let parentCheckpointId = baseState.parentCheckpointId;

    // 为用户输入先落一个 checkpoint。
    // 这样“重新生成 AI 回复”时，AI 消息的 parent_checkpoint 会落在“包含该次用户提问”的状态上，
    // 不会回退到更早一轮对话导致问题错位。
    if (inputMessages.length > 0) {
        const inputCheckpointThread = await threadRepository.set({
            ...baseState.thread,
            values: {
                messages: serializeMessages(allMessages),
            },
            status: ThreadStatus.IDLE,
        }, {
            parentCheckpointId: baseState.parentCheckpointId,
        });
        parentCheckpointId = inputCheckpointThread.checkpoint_id ?? parentCheckpointId;
    }

    await modelCallAgent({
        messages: [new SystemMessage(getSystemPrompt(runtimeOptions)), ...allMessages],
        threadId,
        parentCheckpointId,
        runtimeOptions,
        sendEvent,
    });
}

async function persistIntermediateCheckpoint(
    threadId: string,
    allMessages: BaseMessage[],
    parentCheckpointId: string | null,
) {
    const thread = await threadRepository.get(threadId);
    if (!thread) {
        throw new Error(`Thread ${threadId} not found while persisting intermediate checkpoint`);
    }

    const persistedThread = await threadRepository.set({
        ...thread,
        values: {
            messages: serializeMessages(allMessages),
        },
        status: ThreadStatus.IDLE,
    }, {
        parentCheckpointId,
    });

    return persistedThread.checkpoint_id ?? parentCheckpointId;
}

async function executeAndContinue(
    threadId: string,
    allMessages: BaseMessage[],
    toolCalls: any[],
    sendEvent: SendEvent,
    parentCheckpointId: string | null,
    runtimeOptions: ModelRuntimeOptions,
) {
    const toolResults = await executeTools(toolCalls, sendEvent);
    allMessages.push(...toolResults);
    const continuedFromCheckpointId = await persistIntermediateCheckpoint(
        threadId,
        allMessages,
        parentCheckpointId,
    );

    await modelCallAgent({
        messages: allMessages,
        threadId,
        parentCheckpointId: continuedFromCheckpointId,
        runtimeOptions,
        sendEvent,
    });
}

async function handleResume(
    userId: string,
    threadId: string,
    resumePayload: HITLResponse,
    sendEvent: SendEvent,
    runtimeOptions: ModelRuntimeOptions,
) {
    const thread = await threadRepository.getForUser(threadId, userId);
    if (!thread) {
        sendEvent("error", { error: "Thread not found", message: "线程不存在或无权限访问" });
        return;
    }

    const cachedInterrupt = await interruptRepository.get(threadId);
    if (!cachedInterrupt) {
        console.warn(`[HITL] No interrupt found for thread ${threadId}`);
        sendEvent("error", { error: "No pending interrupt", message: "没有待审核的中断请求" });
        return;
    }

    console.log(`[HITL] Resume thread ${threadId}, decision: ${resumePayload.decision}`);

    if (
        resumePayload.requestId
        && resumePayload.requestId !== cachedInterrupt.hitlRequest.requestId
    ) {
        sendEvent("error", {
            error: "Stale interrupt request",
            message: "当前审核卡片已经失效，请刷新分支后重试",
        });
        return;
    }

    const parentCheckpointId = cachedInterrupt.checkpointId ?? thread.checkpoint_id ?? null;

    if (
        resumePayload.checkpointId
        && parentCheckpointId
        && resumePayload.checkpointId !== parentCheckpointId
    ) {
        sendEvent("error", {
            error: "Stale interrupt checkpoint",
            message: "当前审核卡片不属于这个分支，请切回原分支后再处理",
        });
        return;
    }

    await interruptRepository.delete(threadId);
    await threadRepository.updateStatus(threadId, ThreadStatus.IDLE);

    const { aiMessage, allMessages } = cachedInterrupt;
    const toolCalls = getExecutableToolCalls(getToolCalls(aiMessage));

    switch (resumePayload.decision) {
        case DecisionEnum.APPROVE:
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent, parentCheckpointId, runtimeOptions);
            return;

        case DecisionEnum.EDIT: {
            const editedArgsList = Array.isArray(resumePayload.argsList) ? resumePayload.argsList : [];
            toolCalls.forEach((toolCall, index) => {
                if (editedArgsList[index]) {
                    toolCall.args = editedArgsList[index];
                }
            });
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent, parentCheckpointId, runtimeOptions);
            return;
        }

        case DecisionEnum.REJECT: {
            const reason = resumePayload.reason || "用户拒绝了此操作";
            for (const toolCall of toolCalls) {
                allMessages.push(createToolMessage(
                    `Error: User rejected the tool call '${toolCall.name}'. Reason: ${reason}. Please respond to the user without this tool or propose a different action.`,
                    toolCall.id,
                ));
            }
            const continuedFromCheckpointId = await persistIntermediateCheckpoint(
                threadId,
                allMessages,
                parentCheckpointId,
            );

            await modelCallAgent({
                messages: allMessages,
                threadId,
                parentCheckpointId: continuedFromCheckpointId,
                runtimeOptions,
                sendEvent,
            });
        }
    }
}

export async function streamThreadRun(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const threadId = req.params.threadId as string;
    console.log(`[Stream] Request for thread: ${threadId}`);

    setStreamHeaders(res, threadId);
    const sendEvent = createSendEvent(res);

    try {
        const runtimeOptions = toRuntimeOptions(getRunMetadata(req.body));
        const command = req.body?.command;
        if (command?.resume) {
            await handleResume(user.user_id, threadId, command.resume, sendEvent, runtimeOptions);
        } else {
            await handleNewMessage(user.user_id, threadId, req.body, sendEvent, runtimeOptions);
        }
    } catch (error: any) {
        console.error("Stream 出错:", error);
        sendEvent("error", { error: error.message, message: error.message });
    } finally {
        res.end();
    }
}
