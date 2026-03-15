import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { simpleAgent } from "../services/agent.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// ─── 内存存储 ──────────────────────────────────────────────────────────────────
// 简易的 Thread / Run 存储（内存版，重启后丢失）
interface Thread {
    thread_id: string;
    created_at: string;
    updated_at: string;
    metadata: Record<string, unknown>;
    status: string;
    values: Record<string, unknown>;
}

const threadsPool = new Map<string, Thread>();

const CACHE_FILE = path.join(process.cwd(), "cache-db.json");

// ─── 启动时恢复数据  ──────────────────────────────────────────────────────────
try {
    if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, "utf-8");
        const parsed = JSON.parse(data);
        for (const [key, value] of Object.entries(parsed)) {
            threadsPool.set(key, value as Thread);
        }
        console.log(`✅ 成功从本地恢复了 ${threadsPool.size} 个历史会话线程！`);
    }
} catch (err) {
    console.error("加载历史会话缓存失败:", err);
}

// ─── 定期持久化数据  ──────────────────────────────────────────────────────────
setInterval(() => {
    try {
        const obj = Object.fromEntries(threadsPool);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
        console.error("保存历史会话缓存出错:", err);
    }
}, 5000); // 每 5 秒钟保存一次

function uuid() {
    return crypto.randomUUID();
}

// ─── POST /threads — 创建线程 ─────────────────────────────────────────────────
app.post("/threads", (req: Request, res: Response) => {
    const threadId = req.body?.thread_id ?? uuid();
    const now = new Date().toISOString();
    const thread: Thread = {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata: req.body?.metadata ?? {},
        status: "idle",
        values: {},
    };
    threadsPool.set(threadId, thread);
    res.json(thread);
});

// ─── GET /threads — 获取所有线程列表 ─────────────────────────────────────────
app.get("/threads", (_req: Request, res: Response) => {
    const list = Array.from(threadsPool.values())
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map(thread => {
            // 提取第一条消息作为标题
            const messages = (thread.values as any)?.messages || [];
            const firstHumanMessage = messages.find((m: any) => m.type === "human");
            return {
                thread_id: thread.thread_id,
                updated_at: thread.updated_at,
                title: firstHumanMessage?.content || "新对话"
            };
        });
    res.json(list);
});

// ─── GET /threads/:threadId — 获取线程 ────────────────────────────────────────
app.get("/threads/:threadId", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
    }
    res.json(thread);
});

// ─── GET /threads/:threadId/state — 获取线程状态 ──────────────────────────────
app.get("/threads/:threadId/state", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        // 返回空状态而不是 404，useStream 在线程不存在时也会调用
        res.json({ values: {}, next: [], tasks: [], checkpoint: null });
        return;
    }
    res.json({
        values: thread.values,
        next: [],
        tasks: [],
        // 关键修复: LangChain SDK (useStream) 的源码里会判断 if (state.checkpoint == null) return [];
        // 所以这里绝不能返回 null，否则它会认为没有历史。给个 dummy checkpoint 即可。
        checkpoint: {
            thread_id: thread.thread_id,
            checkpoint_id: "dummy-checkpoint",
            checkpoint_ns: "",
            ts: thread.updated_at,
        },
    });
});

// ─── POST /threads/:threadId/state — 更新线程状态 ─────────────────────────────
app.post("/threads/:threadId/state", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
    }
    if (req.body?.values) {
        thread.values = { ...thread.values, ...req.body.values };
    }
    thread.updated_at = new Date().toISOString();
    res.json({ checkpoint: null });
});

// ─── PATCH /threads/:threadId/state — 更新线程状态元数据 ──────────────────────
app.patch("/threads/:threadId/state", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
    }
    if (req.body?.metadata) {
        thread.metadata = { ...thread.metadata, ...req.body.metadata };
    }
    thread.updated_at = new Date().toISOString();
    res.json({ ok: true });
});

// ─── POST /threads/:threadId/history — 获取历史状态 ───────────────────────────
app.post("/threads/:threadId/history", (req: Request, res: Response) => {
    const thread = threadsPool.get(req.params.threadId as string);
    if (!thread) {
        res.json([]);
        return;
    }
    // `useStream` 期望的 history 返回格式是包含 state 对象的数组
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

// ─── 辅助：将 BaseMessage[] 转为 LangGraph 序列化格式 ─────────────────────────
function serializeMessages(messages: BaseMessage[]) {
    return messages.map((msg) => {
        const type = msg._getType();
        return {
            type,
            content: msg.content,
            id: msg.id ?? uuid(),
            tool_calls: (msg as any).tool_calls ?? undefined,
            tool_call_id: (msg as any).tool_call_id ?? undefined,
        };
    });
}

// ─── POST /threads/:threadId/runs/stream — 核心流式接口 ───────────────────────
app.post("/threads/:threadId/runs/stream", async (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    let thread = threadsPool.get(threadId);
    if (!thread) {
        // 自动创建线程
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

    const { input, stream_mode } = req.body;

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // 返回 run_id 元数据
    const runId = uuid();
    res.setHeader("x-langgraph-run-id", runId);
    res.setHeader("x-langgraph-thread-id", threadId);

    // 辅助函数：写 SSE 事件
    const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 发送 metadata 事件
    sendEvent("metadata", { run_id: runId, thread_id: threadId });

    try {
        // 从 input 中提取 messages
        const inputMessages: BaseMessage[] = [];
        if (input?.messages) {
            for (const msg of input.messages) {
                if (msg.type === "human" || msg.role === "human" || msg.role === "user") {
                    inputMessages.push(new HumanMessage(msg.content));
                }
            }
        }

        // 取出历史 messages（如有）
        const existingMessages: BaseMessage[] = (thread.values as any)?.messages
            ? (thread.values as any).messages.map((m: any) => {
                if (m.type === "human") return new HumanMessage({ content: m.content, id: m.id });
                if (m.type === "ai") return new AIMessage({ content: m.content, id: m.id });
                return new HumanMessage({ content: m.content, id: m.id });
            })
            : [];

        const allInputMessages = [...existingMessages, ...inputMessages];

        // 判断是否需要流式 messages-tuple 模式
        const wantMessagesTuple = Array.isArray(stream_mode)
            ? stream_mode.includes("messages-tuple")
            : stream_mode === "messages-tuple";

        const wantValues = Array.isArray(stream_mode)
            ? stream_mode.includes("values")
            : stream_mode === "values" || !stream_mode;

        // 使用 agent 的 streamEvents 来逐 token 推送
        const agentStream = await simpleAgent.stream(
            { messages: allInputMessages },
            { streamMode: "messages" },
        );

        let finalMessages: BaseMessage[] = [...allInputMessages];
        let lastAIContent = "";
        let aiMessageId = uuid();

        for await (const [msgChunk, _metadata] of agentStream) {
            // msgChunk 是消息的增量 chunk
            if (msgChunk._getType() === "ai") {
                const chunkContent = typeof msgChunk.content === "string" ? msgChunk.content : "";

                if (chunkContent) {
                    lastAIContent += chunkContent;

                    // 发送 messages-tuple 格式的事件（useStream 主要依赖这种格式）
                    const serializedChunk = {
                        type: "AIMessageChunk",
                        id: aiMessageId,
                        content: chunkContent,
                        tool_calls: [],
                        tool_call_chunks: [],
                    };
                    const metadata = {
                        langgraph_step: 1,
                        langgraph_node: "agent",
                        langgraph_triggers: ["start:agent"],
                        langgraph_checkpoint_ns: "",
                    };
                    sendEvent("messages", [serializedChunk, metadata]);
                }
            }
        }

        // 构建最终完整的消息列表
        const finalAIMessage = new AIMessage({ content: lastAIContent, id: aiMessageId });
        finalMessages.push(finalAIMessage);

        // 更新 thread 状态
        const serializedFinalMessages = serializeMessages(finalMessages);
        thread.values = { messages: serializedFinalMessages };
        thread.updated_at = new Date().toISOString();

        // 发送 values 事件（最终状态）
        if (wantValues) {
            sendEvent("values", { messages: serializedFinalMessages });
        }

        // 发送 end 事件
        sendEvent("end", null);
    } catch (err: any) {
        console.error("Agent stream 出错:", err);
        sendEvent("error", {
            error: err.message ?? "Internal error",
            message: err.message ?? "Internal error",
        });
    } finally {
        res.end();
    }
});

// ─── POST /runs/stream — 无线程的流式接口 ────────────────────────────────────
app.post("/runs/stream", async (req: Request, res: Response) => {
    // 创建临时线程并转发
    const threadId = uuid();
    req.params = { threadId };
    const now = new Date().toISOString();
    threadsPool.set(threadId, {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata: {},
        status: "idle",
        values: {},
    });

    // 手动重新触发 runs/stream 处理
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const runId = uuid();
    res.setHeader("x-langgraph-run-id", runId);
    res.setHeader("x-langgraph-thread-id", threadId);

    const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("metadata", { run_id: runId, thread_id: threadId });

    try {
        const inputMessages: BaseMessage[] = [];
        if (req.body?.input?.messages) {
            for (const msg of req.body.input.messages) {
                if (msg.type === "human" || msg.role === "human" || msg.role === "user") {
                    inputMessages.push(new HumanMessage(msg.content));
                }
            }
        }

        const agentStream = await simpleAgent.stream(
            { messages: inputMessages },
            { streamMode: "messages" },
        );

        let lastAIContent = "";
        const aiMessageId = uuid();

        for await (const [msgChunk, _metadata] of agentStream) {
            if (msgChunk._getType() === "ai") {
                const chunkContent = typeof msgChunk.content === "string" ? msgChunk.content : "";
                if (chunkContent) {
                    lastAIContent += chunkContent;
                    sendEvent("messages", [
                        {
                            type: "AIMessageChunk",
                            id: aiMessageId,
                            content: chunkContent,
                            tool_calls: [],
                            tool_call_chunks: [],
                        },
                        { langgraph_checkpoint_ns: "" },
                    ]);
                }
            }
        }

        const finalMessages = [
            ...serializeMessages(inputMessages),
            { type: "ai", content: lastAIContent, id: aiMessageId },
        ];
        sendEvent("values", { messages: finalMessages });
        sendEvent("end", null);
    } catch (err: any) {
        console.error("Agent stream 出错:", err);
        sendEvent("error", { error: err.message, message: err.message });
    } finally {
        res.end();
    }
});

// ─── POST /threads/:threadId/runs — 非流式创建 run ───────────────────────────
app.post("/threads/:threadId/runs", (req: Request, res: Response) => {
    const runId = uuid();
    const now = new Date().toISOString();
    res.json({
        run_id: runId,
        thread_id: req.params.threadId as string,
        assistant_id: req.body?.assistant_id,
        status: "pending",
        created_at: now,
        updated_at: now,
    });
});

// ─── POST /threads/:threadId/runs/:runId/cancel — 取消 run ───────────────────
app.post("/threads/:threadId/runs/:runId/cancel", (_req: Request, res: Response) => {
    res.json({ ok: true });
});

// ─── 健康检查 ─────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 启动服务 ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 LangGraph 兼容 Agent 服务已启动: http://localhost:${PORT}`);
    console.log(`   POST /threads                              — 创建线程`);
    console.log(`   POST /threads/:id/runs/stream              — 流式问答 (SSE)`);
    console.log(`   GET  /threads/:id/state                    — 获取线程状态`);
    console.log(`   POST /threads/:id/history                  — 获取历史`);
    console.log(`   GET  /health                               — 健康检查\n`);
});
