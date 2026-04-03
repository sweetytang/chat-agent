import { Router } from "express";
import { createThread, deleteThread, getThreadState, listThreads } from "../controllers/threadController.js";
import { streamThreadRun } from "../controllers/runController.js";

export const threadRouter: Router = Router();

threadRouter.post("/threads", createThread);
threadRouter.get("/threads/:threadId/state", getThreadState);
threadRouter.post("/threads/:threadId/runs/stream", streamThreadRun);
threadRouter.get("/allthreads", listThreads);
threadRouter.delete("/threads/:threadId", deleteThread);
