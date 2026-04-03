import { Request, Response } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth.js";
import { interruptRepository } from "../models/interruptRepository.js";
import { threadRepository } from "../models/threadRepository.js";
import { extractThreadTitle } from "../services/chat/threadTitle.js";
import { uuid } from "../utils/uuid.js";
import { IThreadDTO, ThreadStatus } from "@common/types/thread";

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
        interruptRepository.get(threadId),
    ]);

    if (!thread) {
        res.json({ values: {}, next: [], tasks: [], checkpoint: null });
        return;
    }

    res.json({
        values: thread.values,
        next: [],
        tasks: interrupt ? [{
            id: "hitl-task",
            name: "human_review",
            interrupts: [{
                value: interrupt.hitlRequest,
                when: "during",
            }],
        }] : [],
        checkpoint: {
            thread_id: thread.thread_id,
            checkpoint_id: thread.checkpoint_id || null,
            checkpoint_ns: "",
            ts: thread.updated_at,
        },
    });
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
