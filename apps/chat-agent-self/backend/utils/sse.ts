import { Response } from "express";
import { uuid } from "./uuid.js";
import { IObj } from "@common/types";
import { SendEvent } from '@backend/types';

export function createSendEvent(res: Response): SendEvent {
    return (event: string, data: IObj | null) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        // 强制立即将缓冲区数据推送给客户端，防止 SSE 事件积压导致流卡住
        if (typeof (res as any).flush === 'function') {
            (res as any).flush();
        }
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
    // 立即将响应头推送给客户端，避免在耗时的 DB 查询期间客户端因收不到任何字节而超时
    res.flushHeaders();
}
