import { prisma } from "@/config/prisma";
import { uuid } from "../utils/uuid.js";
import { safeParseJSON } from "../utils/safeParseJSON";
import { IThreadDTO, ThreadRecord } from "../../types/thread";

function toThread(record: ThreadRecord): IThreadDTO {
    const thread: IThreadDTO = {
        thread_id: record.threadId,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        metadata: safeParseJSON(record.metadataJson),
        status: record.status,
        values: safeParseJSON(record.valuesJson),
    };

    if (record.userId) {
        thread.user_id = record.userId;
    }

    if (record.latestCheckpointId) {
        thread.checkpoint_id = record.latestCheckpointId;
    }

    return thread;
}


class ThreadRepository {
    private readonly ready: Promise<void>;

    constructor() {
        this.ready = this.initialize();
    }

    private async initialize() {
        const count = await prisma.thread.count();
        console.log(`✅ Prisma 持久化已就绪，线程数据位于 ${process.env.DATABASE_URL}，当前 ${count} 个线程`);
    }

    async set(thread: IThreadDTO, checkpointId = uuid()) {
        await this.ready;
        const persisted = await prisma.$transaction(async (tx) => {
            await tx.thread.upsert({
                where: { threadId: thread.thread_id },
                create: {
                    threadId: thread.thread_id,
                    userId: thread.user_id ?? null,
                    createdAt: thread.created_at,
                    updatedAt: thread.updated_at,
                    metadataJson: JSON.stringify(thread.metadata ?? {}),
                    status: thread.status,
                    valuesJson: JSON.stringify(thread.values ?? {}),
                    latestCheckpointId: checkpointId,
                },
                update: {
                    userId: thread.user_id ?? null,
                    metadataJson: JSON.stringify(thread.metadata ?? {}),
                    status: thread.status,
                    valuesJson: JSON.stringify(thread.values ?? {}),
                    latestCheckpointId: checkpointId,
                },
            });

            await tx.threadCheckpoint.create({
                data: {
                    checkpointId,
                    threadId: thread.thread_id,
                    status: thread.status,
                    metadataJson: JSON.stringify(thread.metadata ?? {}),
                    valuesJson: JSON.stringify(thread.values ?? {}),
                },
            });

            return tx.thread.findUniqueOrThrow({
                where: { threadId: thread.thread_id },
            });
        });

        return toThread(persisted);
    }

    async get(threadId: string) {
        await this.ready;
        const record = await prisma.thread.findUnique({
            where: { threadId },
        });

        return record ? toThread(record) : undefined;
    }

    async getForUser(threadId: string, userId: string) {
        await this.ready;
        const record = await prisma.thread.findUnique({
            where: { threadId, userId },
        });

        return record ? toThread(record) : undefined;
    }

    async deleteForUser(threadId: string, userId: string) {
        await this.ready;
        const result = await prisma.thread.deleteMany({
            where: { threadId, userId },
        });

        return result.count > 0;
    }

    async listByUser(userId: string) {
        await this.ready;
        const records = await prisma.thread.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        return records.map((record) => toThread(record));
    }

    async list() {
        await this.ready;
        const records = await prisma.thread.findMany({
            orderBy: { updatedAt: "desc" },
        });

        return records.map((record) => toThread(record));
    }
}

export const threadRepository = new ThreadRepository();
