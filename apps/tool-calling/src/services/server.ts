/**
 * server.ts — Express 后端服务
 * 提供线程管理和 SSE 流式对话 API，兼容 @langchain/react 的 useStream 协议。
 */
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { simpleAgent } from "./agent.js";
import { uuid, serializeMessages } from "../../utils";
import { SERVER_PORT, MessageTypeEnum } from "../constants";
import { IObj, IThread } from "../types";

const app = express();

app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// ─── 线程池 & 本地缓存持久化 ────────────────────────────────────────────────────
const threadsPool = new Map<string, IThread>();
const CACHE_FILE = path.join(process.cwd(), "cache-db.json");

/** 从本地文件恢复历史会话 */
try {
    if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, "utf-8");
        const parsed = JSON.parse(data);
        for (const [key, value] of Object.entries(parsed)) {
            threadsPool.set(key, value as IThread);
        }
        console.log(`✅ 成功从本地恢复了 ${threadsPool.size} 个历史会话线程！`);
    }
} catch (err) {
    console.error("加载历史会话缓存失败:", err);
}

/** 定期将线程池持久化到本地 JSON 文件 */
const saveThreadsPool = () => {
    try {
        const obj = Object.fromEntries(threadsPool);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
        console.error("保存历史会话缓存出错:", err);
    }
}


// ─── POST /threads — 创建线程 ─────────────────────────────────────────────────
app.post("/threads", (req: Request, res: Response) => {
    const { thread_id: threadId = uuid(), metadata = {} } = req.body || {};
    const now = new Date().toISOString();
    const thread: IThread = {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata,
        status: "idle",
        values: {},
    };
    threadsPool.set(threadId, thread);
    // saveThreadsPool();
    res.json(thread);
});



// ─── GET /threads/:threadId/state — 获取线程状态 ──────────────────────────────
app.get("/threads/:threadId/state", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.json({ values: {}, next: [], tasks: [], checkpoint: null });
        return;
    }
    res.json({
        values: thread.values,
        next: [],
        tasks: [],
        checkpoint: {
            thread_id: thread.thread_id,
            checkpoint_id: "dummy-checkpoint",
            checkpoint_ns: "",
            ts: thread.updated_at,
        },
    });
});


// ─── POST /threads/:threadId/runs/stream — SSE 流式对话 ────────────────────────
app.post("/threads/:threadId/runs/stream", async (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    console.log(`[Stream] Thread stream request: ${threadId}`);

    // 自动创建不存在的线程
    let thread = threadsPool.get(threadId);
    if (!thread) {
        const now = new Date().toISOString();
        thread = {
            thread_id: threadId,
            created_at: now,
            updated_at: now,
            metadata: {},
            status: "idle",
            values: {},
        };
        threadsPool.set(threadId, thread);
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const runId = uuid();
    res.setHeader("x-langgraph-run-id", runId);
    res.setHeader("x-langgraph-thread-id", threadId);

    // 解析用户输入消息
    const input = req.body.input;
    const inputMessages: BaseMessage[] = [];
    if (input?.messages) {
        for (const msg of input.messages) {
            const { content, id, tool_calls, tool_call_id } = msg || {};
            const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];
            switch (msg.type) {
                case MessageTypeEnum.HUMAN:
                    inputMessages.push(new HumanMessage({ content, id }));
                    break;
                case MessageTypeEnum.AI:
                    inputMessages.push(new AIMessage({ content, id, tool_calls: safeToolCalls }));
                    break;
                case MessageTypeEnum.TOOL:
                    inputMessages.push(new ToolMessage({ content, id, tool_call_id }));
                    break;
                default:
                    break;
            }
        }
    }

    // 从线程中恢复历史消息，重建 BaseMessage 实例
    const historyMessages: BaseMessage[] = (thread.values?.messages || []).map((msg: any) => {
        const { type, content, id, tool_calls, tool_call_id } = msg || {};
        // 显式确保 tool_calls 是数组，避免传递 undefined 或 null 给 AIMessage
        const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];

        switch (type) {
            case MessageTypeEnum.HUMAN:
                return new HumanMessage({ content, id });
            case MessageTypeEnum.AI:
                return new AIMessage({ content, id, tool_calls: safeToolCalls });
            case MessageTypeEnum.TOOL:
                return new ToolMessage({ content, id, tool_call_id });
            default:
                return new HumanMessage({ content, id });
        }
    });



    /** SSE 事件发送辅助函数 */
    const sendEvent = (event: string, data: IObj | null) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const allMessages = [...historyMessages, ...inputMessages];
    sendEvent("values", { messages: allMessages });

    // 启动 Agent 流式输出
    const agentStream = await simpleAgent.stream(
        { messages: allMessages },
        { streamMode: "messages" },
    );

    // 用于按流式顺序收集所有消息（AI 和 Tool），Map 保证插入顺序
    const streamedMessages = new Map<string, any>();
    try {
        for await (const [msgChunk, _metadata] of agentStream) {
            const {
                type,
                id = uuid(),
                content,
                tool_calls = [],
                tool_call_chunks = [],
                tool_call_id
            } = (msgChunk || {}) as any;
            const serializedChunk: any = { type, id, content };

            switch (type) {
                case MessageTypeEnum.AI:
                    const existing = streamedMessages.get(id);
                    if (!existing) {
                        streamedMessages.set(id, msgChunk);
                    } else {
                        // LangChain 的 AIMessageChunk 提供了专门的 .concat 方法来合并流式片段
                        // 它会自动处理 content 的追加以及 tool_call_chunks 的合并
                        if (typeof existing.concat === 'function') {
                            streamedMessages.set(id, existing.concat(msgChunk));
                        } else {
                            // 如果丢失了原型对象（变成普通对象），则手动进行基础合并
                            existing.content = (existing.content || "") + (content || "");
                            if (tool_calls.length > 0) {
                                existing.tool_calls = [...(existing.tool_calls || []), ...tool_calls];
                            }
                        }
                    }
                    serializedChunk.tool_calls = (streamedMessages.get(id) as any)?.tool_calls || tool_calls;
                    serializedChunk.tool_call_chunks = tool_call_chunks;
                    break;
                case MessageTypeEnum.TOOL:
                    serializedChunk.tool_call_id = tool_call_id;
                    // 按流式顺序存入 Map，不再立即 push 到 allMessages
                    streamedMessages.set(id, msgChunk);
                    console.log(`[Stream] Tool response received for ID: ${serializedChunk.tool_call_id}`);
                    break;
            }

            sendEvent("messages", [serializedChunk, _metadata]);
        }

        // 按流式接收顺序将所有消息追加到 allMessages
        // Map 保证插入顺序，因此消息顺序为: ai(tool_calls) → tool → ai(final)
        for (const [_id, fullMsg] of streamedMessages) {
            allMessages.push(fullMsg);
        }


        // 更新线程状态
        const serializedAllMessages = serializeMessages(allMessages);
        thread.values = { messages: serializedAllMessages };
        thread.updated_at = new Date().toISOString();

        sendEvent("values", { messages: serializedAllMessages });
        sendEvent("end", null);
    } catch (err: any) {
        console.error("Agent stream 出错:", err);
        sendEvent("error", { error: err.message, message: err.message });
    } finally {
        res.end();
        saveThreadsPool();
    }
});


// ─── GET /allthreads — 获取所有线程列表 ─────────────────────────────────────────
app.get("/allthreads", (_req: Request, res: Response) => {
    const list = Array.from(threadsPool.values())
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map(thread => {
            const messages: any[] = thread.values?.messages || [];
            const firstHumanMessage = messages.find((m: any) => m.type === MessageTypeEnum.HUMAN);
            return {
                thread_id: thread.thread_id,
                updated_at: thread.updated_at,
                title: firstHumanMessage?.content || "新对话"
            };
        });
    res.json(list);
});


// ─── POST /threads/:threadId/history — 获取历史状态 ───────────────────────────
app.post("/threads/:threadId/history", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.json([]);
        return;
    }
    res.json([{
        values: thread.values,
        next: [],
        tasks: [],
        checkpoint: {
            thread_id: thread.thread_id,
            checkpoint_id: "dummy-checkpoint",
            checkpoint_ns: "",
            ts: thread.updated_at,
        },
    }]);
});

// ─── DELETE /threads/:threadId — 删除线程 ─────────────────────────────────────
app.delete("/threads/:threadId", (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    if (threadsPool.has(threadId)) {
        threadsPool.delete(threadId);
        saveThreadsPool()
        res.json({ success: true, message: `Thread ${threadId} deleted` });
    } else {
        res.status(404).json({ success: false, message: "Thread not found" });
    }
});


// ─── 启动服务 ─────────────────────────────────────────────────────────────────
app.listen(SERVER_PORT, () => {
    console.log(`\n🚀 LangGraph Agent 服务已启动: http://localhost:${SERVER_PORT}\n`);
});
