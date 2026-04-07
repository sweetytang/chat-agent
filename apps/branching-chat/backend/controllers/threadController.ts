import { Request, Response } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth.js";
import { interruptRepository } from "../models/interruptRepository.js";
import { threadCheckpointRepository } from "../models/threadCheckpointRepository.js";
import { threadRepository } from "../models/threadRepository.js";
import { extractThreadTitle } from "../services/chat/threadTitle.js";
import { uuid } from "../utils/uuid.js";
import { IThreadDTO, ThreadCheckpoint, ThreadStatus } from "@common/types/thread";

function getRequestedCheckpointId(
    checkpointId: unknown,
    checkpoint: unknown,
): string | null {
    if (typeof checkpointId === "string" && checkpointId.length > 0) {
        return checkpointId;
    }

    const value = checkpoint as ThreadCheckpoint | null | undefined;
    if (value && typeof value.checkpoint_id === "string" && value.checkpoint_id.length > 0) {
        return value.checkpoint_id;
    }

    return null;
}

async function getInterruptState(threadId: string) {
    const interrupt = await interruptRepository.get(threadId);
    if (!interrupt) {
        return null;
    }

    return {
        checkpointId: interrupt.checkpointId ?? null,
        hitlRequest: interrupt.hitlRequest,
    };
}

export async function createThread(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const { thread_id: threadId = uuid(), metadata = {} } = req.body || {};
    const now = new Date();
    const thread: IThreadDTO = {
        thread_id: threadId,
        user_id: user.user_id,
        created_at: now,
        updated_at: now,
        metadata: {
            ...metadata,
            username: user.username,
        },
        status: ThreadStatus.IDLE,
        values: {},
    };

    res.json(await threadRepository.set(thread));
}

export async function getThreadState(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const threadId = req.params.threadId as string;
    const [thread, interrupt] = await Promise.all([
        threadRepository.getForUser(threadId, user.user_id),
        getInterruptState(threadId),
    ]);

    if (!thread) {
        res.json({ values: {}, next: [], tasks: [], checkpoint: null, metadata: {}, created_at: null, parent_checkpoint: null });
        return;
    }

    const state = await threadCheckpointRepository.getState(
        thread.thread_id,
        thread.checkpoint_id,
        interrupt,
    );

    if (!state) {
        res.json({ values: thread.values, next: [], tasks: [], checkpoint: null, metadata: thread.metadata, created_at: thread.updated_at.toISOString(), parent_checkpoint: null });
        return;
    }

    res.json(state);
}

// export async function getThreadStateAtCheckpoint(req: Request, res: Response) {
//     const user = await requireAuthenticatedUser(req, res);
//     if (!user) {
//         return;
//     }

//     const threadId = req.params.threadId as string;
//     const checkpointId = req.params.checkpointId as string;
//     const thread = await threadRepository.getForUser(threadId, user.user_id);

//     if (!thread) {
//         res.status(404).json({ message: "线程不存在或无权限访问" });
//         return;
//     }

//     const interrupt = await getInterruptState(threadId);
//     const state = await threadCheckpointRepository.getState(threadId, checkpointId, interrupt);

//     if (!state) {
//         res.status(404).json({ message: "Checkpoint 不存在" });
//         return;
//     }

//     res.json(state);
// }

// export async function getThreadStateFromCheckpointPayload(req: Request, res: Response) {
//     const user = await requireAuthenticatedUser(req, res);
//     if (!user) {
//         return;
//     }

//     const threadId = req.params.threadId as string;
//     const checkpointId = getRequestedCheckpointId(req.body?.checkpoint_id, req.body?.checkpoint);
//     const thread = await threadRepository.getForUser(threadId, user.user_id);

//     if (!thread) {
//         res.status(404).json({ message: "线程不存在或无权限访问" });
//         return;
//     }

//     if (!checkpointId) {
//         res.status(400).json({ message: "缺少 checkpoint_id" });
//         return;
//     }

//     const interrupt = await getInterruptState(threadId);
//     const state = await threadCheckpointRepository.getState(threadId, checkpointId, interrupt);

//     if (!state) {
//         res.status(404).json({ message: "Checkpoint 不存在" });
//         return;
//     }

//     res.json(state);
// }

export async function getThreadHistory(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const threadId = req.params.threadId as string;
    const thread = await threadRepository.getForUser(threadId, user.user_id);

    if (!thread) {
        res.json([]);
        return;
    }

    const limit = typeof req.body?.limit === "number" && req.body.limit > 0
        ? req.body.limit
        : undefined;
    const interrupt = await getInterruptState(threadId);
    const history = await threadCheckpointRepository.listStates(threadId, {
        interrupt,
        limit,
    });

    res.json(history);
}

export async function listThreads(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const list = (await threadRepository.listByUser(user.user_id))
        .map((thread) => {
            const messages: any[] = thread.values?.messages || [];
            return {
                thread_id: thread.thread_id,
                updated_at: thread.updated_at,
                status: thread.status,
                title: extractThreadTitle(messages),
            };
        });

    res.json(list);
}

export async function deleteThread(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const threadId = req.params.threadId as string;
    if (await threadRepository.deleteForUser(threadId, user.user_id)) {
        res.json({ success: true, message: `Thread ${threadId} deleted` });
        return;
    }

    res.status(404).json({ success: false, message: "Thread not found" });
}
