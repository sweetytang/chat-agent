import { Router } from "express";
import {
    createThread,
    deleteThread,
    getThreadHistory,
    getThreadState,
    getThreadStateAtCheckpoint,
    getThreadStateFromCheckpointPayload,
    listThreads,
} from "../controllers/threadController.js";
import { streamThreadRun } from "../controllers/runController.js";

export const threadRouter: Router = Router();

threadRouter.post("/threads", createThread);
threadRouter.get("/threads/:threadId/state", getThreadState);
// 1.为后续深度打磨与懒加载做预备 2.对齐官方 LangGraph Server API 标准
// threadRouter.post("/threads/:threadId/state/checkpoint", getThreadStateFromCheckpointPayload);
// threadRouter.get("/threads/:threadId/state/:checkpointId", getThreadStateAtCheckpoint);
threadRouter.post("/threads/:threadId/history", getThreadHistory);
threadRouter.post("/threads/:threadId/runs/stream", streamThreadRun);
threadRouter.get("/allthreads", listThreads);
threadRouter.delete("/threads/:threadId", deleteThread);
