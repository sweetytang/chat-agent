import { Response } from "express";
import { uuid } from "./uuid.js";
import { IObj } from "@common/types";
import { SendEvent } from '@backend/types';

export function createSendEvent(res: Response): SendEvent {
    return (event: string, data: IObj | null) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
}

export function setStreamHeaders(res: Response, threadId: string) {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "x-langgraph-run-id": uuid(),
        "x-langgraph-thread-id": threadId,
    });
}
