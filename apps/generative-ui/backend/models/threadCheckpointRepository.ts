import { prisma } from "@/config/prisma";
import { HITLRequest } from "@common/types/interrupt";
import { ThreadCheckpoint, ThreadCheckpointRecord, ThreadStateDTO, ThreadTaskState } from "@common/types/thread";
import { safeParseJSON } from "../utils/safeParseJSON";

interface ThreadInterruptState {
    checkpointId: string | null;
    hitlRequest: HITLRequest;
}



function toCheckpointSnapshot(threadId: string, checkpointId: string | null): ThreadCheckpoint | null {
    if (!checkpointId) {
        return null;
    }

    return {
        thread_id: threadId,
        checkpoint_id: checkpointId,
        checkpoint_ns: "",
        checkpoint_map: null,
    };
}

function toInterruptTasks(interrupt: ThreadInterruptState | null, checkpointId: string): ThreadTaskState[] {
    if (!interrupt || interrupt.checkpointId !== checkpointId) {
        return [];
    }

    return [{
        id: "hitl-task",
        name: "human_review",
        interrupts: [{
            value: interrupt.hitlRequest,
            when: "during",
        }],
    }];
}

function parseThreadState(
    record: ThreadCheckpointRecord,
    interrupt: ThreadInterruptState | null,
): ThreadStateDTO {
    return {
        values: safeParseJSON(record.valuesJson, {}),
        next: [],
        tasks: toInterruptTasks(interrupt, record.checkpointId),
        checkpoint: toCheckpointSnapshot(record.threadId, record.checkpointId),
        metadata: safeParseJSON(record.metadataJson, {}),
        created_at: record.createdAt.toISOString(),
        parent_checkpoint: toCheckpointSnapshot(record.threadId, record.parentCheckpointId),
    };
}

class ThreadCheckpointRepository {
    async getState(
        threadId: string,
        checkpointId: string | null | undefined,
        interrupt: ThreadInterruptState | null = null,
    ): Promise<ThreadStateDTO | null> {
        if (!checkpointId) {
            return null;
        }

        const record = await prisma.threadCheckpoint.findUnique({
            where: {
                checkpointId,
            },
        });

        if (!record || record.threadId !== threadId) {
            return null;
        }

        return parseThreadState(record, interrupt);
    }


    async listStates(
        threadId: string,
        options?: {
            interrupt?: ThreadInterruptState | null;
            limit?: number;
        },
    ): Promise<ThreadStateDTO[]> {
        const query: any = {
            where: { threadId },
            orderBy: [
                { createdAt: "desc" },
                { checkpointId: "desc" },
            ],
        }

        if (typeof options?.limit === "number") {
            query.take = options.limit;
        }

        const records = await prisma.threadCheckpoint.findMany(query);

        return records.map((record) => parseThreadState(record, options?.interrupt ?? null));
    }
}

export const threadCheckpointRepository = new ThreadCheckpointRepository();
