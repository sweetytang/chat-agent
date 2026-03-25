/**
 * server.ts — Express 后端服务
 * 提供线程管理和 SSE 流式对话 API，兼容 @langchain/react 的 useStream 协议。
 * 支持 Human-in-the-Loop（HITL）：工具调用前中断等待用户审核。
 *
 * HITL 核心流程：
 * 1. 用户发消息 → 模型返回 tool_calls → 发送 interrupt 事件 → 暂停等待
 * 2. 用户做出决策 → approve: 执行工具 → 继续模型 / reject: 反馈Agent / edit: 修改参数后执行
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import { SystemMessage, BaseMessage } from '@langchain/core/messages';
import {
    modelCallAgent,
    createSendEvent,
    rebuildHistory,
    parseInputMessages,
    getToolCalls,
    extractThreadTitle
} from './utils.js';
import { executeTools } from './tools.js';
import { threadPool } from './thread.js';
import { interruptCache } from './interrupt.js';
import { uuid, createToolMessage } from '../../utils';
import { SERVER_PORT, SYSTEM_PROMPT } from '../constants';
import { IThread, HITLResponse, SendEvent, DecisionEnum } from '../types/index.js';

const app = express();

app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});





/** --------------------- 接口处理 --------------------- */

// POST /threads — 创建线程
app.post('/threads', (req: Request, res: Response) => {
    const {
        thread_id: threadId = uuid(),
        metadata = {}
    } = req.body || {};
    const now = new Date().toISOString();
    const thread: IThread = {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata,
        status: 'idle',
        values: {},
    };
    threadPool.add(threadId, thread);
    res.json(thread);
});


// GET /threads/:threadId/state — 获取线程状态
app.get('/threads/:threadId/state', (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    const thread = threadPool.get(threadId);
    const interrupt = interruptCache.get(threadId);

    if (!thread) {
        res.json({ values: {}, next: [], tasks: [], checkpoint: null });
        return;
    }

    const response: any = {
        values: thread.values,
        next: [],
        tasks: [],
        checkpoint: {
            thread_id: thread.thread_id,
            checkpoint_id: 'dummy-checkpoint',
            checkpoint_ns: '',
            ts: thread.updated_at,
        },
    };

    // 如果有中断，在 tasks 中携带 interrupt 信息
    if (interrupt) {
        response.tasks = [{
            id: 'hitl-task',
            name: 'human_review',
            interrupts: [{
                value: interrupt.hitlRequest,
                when: 'during',
            }],
        }];
    }

    res.json(response);
});


// POST /threads/:threadId/runs/stream — SSE 流式对话（核心）
app.post('/threads/:threadId/runs/stream', async (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    console.log(`[Stream] Request for thread: ${threadId}`);

    // SSE 响应头
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-langgraph-run-id': uuid(),
        'x-langgraph-thread-id': threadId,
    });
    const sendEvent = createSendEvent(res);

    try {
        // 检查是否是 HITL 恢复（command.resume）
        const command = req.body?.command;
        if (command?.resume) {
            await handleResume(threadId, command.resume, sendEvent);
        } else {
            // 正常的新消息请求
            await handleNewMessage(threadId, req.body.input, sendEvent);
        }
    } catch (err: any) {
        console.error('Stream 出错:', err);
        sendEvent('error', { error: err.message, message: err.message });
    } finally {
        res.end();
    }
});


/**
 * 处理新消息请求
 * 流程：历史恢复 → 模型调用 → 如果有 tool_calls 则中断 → 否则正常结束
 */
async function handleNewMessage(
    threadId: string,
    input: any,
    sendEvent: SendEvent,
) {
    const thread = threadPool.get(threadId)!;
    const allMessages: BaseMessage[] = [
        ...rebuildHistory(thread),
        ...parseInputMessages(input)
    ];
    await modelCallAgent({
        messages: [new SystemMessage(SYSTEM_PROMPT), ...allMessages],
        threadId,
        sendEvent,
    });
}


/**
 * 处理 HITL 恢复流程
 * 根据用户的审核决策执行不同的逻辑
 */
async function handleResume(
    threadId: string,
    resumePayload: HITLResponse,
    sendEvent: SendEvent,
) {
    const thread = threadPool.get(threadId)!;
    const cached = interruptCache.get(threadId);
    if (!cached) {
        console.warn(`[HITL] No interrupt found for thread ${threadId}`);
        sendEvent('error', { error: 'No pending interrupt', message: '没有待审核的中断请求' });
        return;
    }

    const { aiMessage, allMessages } = cached;
    const decision = resumePayload.decision;

    console.log(`[HITL] Resume thread ${threadId}, decision: ${decision}`);

    // 清除中断缓存
    interruptCache.delete(threadId);
    thread.status = 'idle';

    const toolCalls = getToolCalls(aiMessage);

    switch (decision) {
        case DecisionEnum.APPROVE:
            // ── 批准：执行工具 → 继续模型 ──
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent);
            break;

        case DecisionEnum.EDIT:
            // ── 编辑：按工具顺序使用修改后的参数执行；未传入的项保留原参数 ──
            const editedArgsList = Array.isArray(resumePayload.argsList)
                ? resumePayload.argsList
                : [];

            toolCalls.forEach((toolCall, index) => {
                if (editedArgsList[index]) {
                    toolCall.args = editedArgsList[index];
                }
            });
            await executeAndContinue(threadId, allMessages, toolCalls, sendEvent);
            break;

        case DecisionEnum.REJECT:
            // ── 拒绝：告知 Agent 用户拒绝了操作 ──
            // 必须为每个 tool_call 提供一个对应的 ToolMessage 以满足 API 要求
            const reason = resumePayload.reason || '用户拒绝了此操作';

            for (const tc of toolCalls) {
                allMessages.push(createToolMessage(
                    `Error: User rejected the tool call '${tc.name}'. Reason: ${reason}. Please respond to the user without this tool or propose a different action.`,
                    tc.id,
                ));
            }

            // 让模型重新思考
            await modelCallAgent({
                messages: allMessages,
                threadId,
                sendEvent
            });
            break;
    }
}


// 执行工具调用并让模型继续生成最终响应
// 用于 approve 和 edit 场景
// 如果模型又产生 tool_calls，会递归中断
async function executeAndContinue(
    threadId: string,
    allMessages: BaseMessage[],
    toolCalls: any[],
    sendEvent: SendEvent,
) {
    const toolResults = await executeTools(toolCalls, sendEvent);
    allMessages.push(...toolResults);

    // 工具结果返回后，让模型继续处理
    await modelCallAgent({
        messages: allMessages,
        threadId,
        sendEvent
    });
}


// GET /allthreads — 获取所有线程列表
app.get('/allthreads', (_req: Request, res: Response) => {
    const list = threadPool.list()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map(thread => {
            const messages: any[] = thread.values?.messages || [];
            return {
                thread_id: thread.thread_id,
                updated_at: thread.updated_at,
                status: thread.status,
                title: extractThreadTitle(messages),
            };
        });
    res.json(list);
});


// DELETE /threads/:threadId — 删除线程
app.delete('/threads/:threadId', (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    if (threadPool.has(threadId)) {
        threadPool.delete(threadId);
        interruptCache.delete(threadId);
        res.json({ success: true, message: `Thread ${threadId} deleted` });
    } else {
        res.status(404).json({ success: false, message: 'Thread not found' });
    }
});






/** --------------------- 启动服务 --------------------- */
app.listen(SERVER_PORT, () => {
    console.log(`\n🚀 LangGraph Agent 服务已启动: http://localhost:${SERVER_PORT}\n`);
});
