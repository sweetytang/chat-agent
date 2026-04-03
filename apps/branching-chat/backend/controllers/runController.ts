import { Request, Response } from "express";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { createToolMessage } from "../utils/createToolMessage.js";
import { SYSTEM_PROMPT } from "@backend/constants";
import { requireAuthenticatedUser } from "../middlewares/auth.js";
import { interruptRepository } from "../models/interruptRepository.js";
import { threadRepository } from "../models/threadRepository.js";
import { executeTools } from "../services/ai/tools/index.js";
import { getToolCalls, parseInputMessages, rebuildHistory } from "../services/chat/messageState.js";
import { modelCallAgent } from "../services/chat/modelRunService.js";
import { createSendEvent, setStreamHeaders } from "../utils/sse.js";
import { DecisionEnum, HITLResponse } from "@common/types/interrupt";
import { SendEvent } from "@backend/types";
import { ThreadStatus } from '@common/types/thread';

async function handleNewMessage(userId: string, threadId: string, input: any, sendEvent: SendEvent) {
    const thread = await threadRepository.getForUser(threadId, userId);
    if (!thread) {
        sendEvent("error", { error: "Thread not found", message: "线程不存在或无权限访问" });
        return;
    }

    const allMessages: BaseMessage[] = [
        ...rebuildHistory(thread),
        ...parseInputMessages(input),
    ];

    await modelCallAgent({
        messages: [new SystemMessage(SYSTEM_PROMPT), ...allMessages],
        threadId,
        sendEvent,
    });
}

async function executeAndContinue(threadId: string, allMessages: BaseMessage[], toolCalls: any[], sendEvent: SendEvent) {
    const toolResults = await executeTools(toolCalls, sendEvent);
    allMessages.push(...toolResults);

    await modelCallAgent({
        messages: allMessages,
        threadId,
        sendEvent,
    });
}

async function handleResume(userId: string, threadId: string, resumePayload: HITLResponse, sendEvent: SendEvent) {
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

    await interruptRepository.delete(threadId);
    await threadRepository.set({
        ...thread,
        status: ThreadStatus.IDLE,
    });

    const { aiMessage, allMessages } = cachedInterrupt;
    const toolCalls = getToolCalls(aiMessage);

    switch (resumePayload.decision) {
        case DecisionEnum.APPROVE:
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent);
            return;

        case DecisionEnum.EDIT: {
            const editedArgsList = Array.isArray(resumePayload.argsList) ? resumePayload.argsList : [];
            toolCalls.forEach((toolCall, index) => {
                if (editedArgsList[index]) {
                    toolCall.args = editedArgsList[index];
                }
            });
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent);
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

            await modelCallAgent({
                messages: allMessages,
                threadId,
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
        const command = req.body?.command;
        if (command?.resume) {
            await handleResume(user.user_id, threadId, command.resume, sendEvent);
        } else {
            await handleNewMessage(user.user_id, threadId, req.body?.input, sendEvent);
        }
    } catch (error: any) {
        console.error("Stream 出错:", error);
        sendEvent("error", { error: error.message, message: error.message });
    } finally {
        res.end();
    }
}
