import { BaseMessage } from "@langchain/core/messages";
import { serializeMessages } from "./messageSerde.js";
import { buildHITLRequest, emitValues, getToolCalls, withoutSystemMessages } from "./messageState.js";
import { streamModelCall } from "./streamModelCall.js";
import { interruptRepository } from "../../models/interruptRepository.js";
import { threadRepository } from "../../models/threadRepository.js";
import { SendEvent } from "@backend/types";
import { ThreadStatus } from '@common/types/thread';

type ModelRunParams = {
    messages: BaseMessage[];
    threadId: string;
    status?: ThreadStatus;
    parentCheckpointId?: string | null;
    sendEvent: SendEvent;
};

export async function modelCallAgent(params: ModelRunParams) {
    const { messages, threadId, status = ThreadStatus.IDLE, parentCheckpointId, sendEvent } = params;

    emitValues(messages, sendEvent);
    const aiResponse = await streamModelCall(messages, sendEvent);
    messages.push(aiResponse);
    emitValues(messages, sendEvent);
    sendEvent("end", null);

    const thread = await threadRepository.get(threadId);
    if (!thread) {
        throw new Error(`Thread ${threadId} not found while persisting model output`);
    }

    const toolCalls = getToolCalls(aiResponse);
    const persistedThread = await threadRepository.set({
        ...thread,
        values: {
            messages: serializeMessages(withoutSystemMessages(messages)),
        },
        status: toolCalls.length > 0 ? ThreadStatus.INTERRUPTED : status,
    }, {
        parentCheckpointId: parentCheckpointId ?? thread.checkpoint_id ?? null,
    });

    if (!toolCalls.length) {
        return;
    }

    await interruptRepository.set(threadId, {
        hitlRequest: buildHITLRequest(toolCalls),
        aiMessage: aiResponse,
        allMessages: messages,
    }, persistedThread.checkpoint_id);

    console.log(`[HITL] Thread ${threadId} interrupted — ${toolCalls.length} tool(s) pending review`);
}
