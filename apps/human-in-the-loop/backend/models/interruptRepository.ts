import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { prisma } from "@/config/prisma";
import { deserializeMessages, serializeMessages } from "../services/chat/messageSerde.js";
import { safeParseJSON } from '../utils/safeParseJSON'
import { HITLRequest } from "@common/types/interrupt";
import { SerializedMessage } from "@common/types";

interface StoredInterrupt {
    hitlRequest: HITLRequest;
    aiMessage: AIMessage;
    allMessages: BaseMessage[];
};

class InterruptRepository {
    async set(threadId: string, value: StoredInterrupt, checkpointId?: string) {
        const aiMessage = serializeMessages([value.aiMessage])[0];
        const allMessages = serializeMessages(value.allMessages);

        await prisma.interrupt.upsert({
            where: { threadId },
            create: {
                threadId,
                requestId: value.hitlRequest.requestId,
                checkpointId: checkpointId ?? null,
                hitlRequestJson: JSON.stringify(value.hitlRequest),
                aiMessageJson: JSON.stringify(aiMessage),
                allMessagesJson: JSON.stringify(allMessages)
            },
            update: {
                requestId: value.hitlRequest.requestId,
                checkpointId: checkpointId ?? null,
                hitlRequestJson: JSON.stringify(value.hitlRequest),
                aiMessageJson: JSON.stringify(aiMessage),
                allMessagesJson: JSON.stringify(allMessages)
            },
        });
    }

    async get(threadId: string): Promise<StoredInterrupt | undefined> {
        const record = await prisma.interrupt.findUnique({
            where: { threadId },
        });

        if (!record) {
            return undefined;
        }

        const aiMessageSerialized = safeParseJSON<SerializedMessage | null>(record.aiMessageJson, null);
        const allMessagesSerialized = safeParseJSON<SerializedMessage[]>(record.allMessagesJson, []);

        if (!aiMessageSerialized) {
            return undefined;
        }

        const [aiMessage] = deserializeMessages([aiMessageSerialized]);
        if (!(aiMessage instanceof AIMessage)) {
            return undefined;
        }

        return {
            hitlRequest: safeParseJSON<HITLRequest>(record.hitlRequestJson, {
                requestId: record.requestId,
                actionRequests: [],
                reviewConfigs: [],
            }),
            aiMessage,
            allMessages: deserializeMessages(allMessagesSerialized),
        };
    }

    async delete(threadId: string) {
        await prisma.interrupt.deleteMany({
            where: { threadId },
        });
    }
}

export const interruptRepository = new InterruptRepository();
