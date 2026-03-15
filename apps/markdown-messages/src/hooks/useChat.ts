import { useState, useEffect } from "react";
import { useStream } from "@langchain/react";
import { simpleAgent } from "../services/agent";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

/**
 * 自定义 Hook: useChat
 * 封装并接管跟 LangGraph/LangChain 后端对话的流式通信与状态。
 * @returns 包含当前消息列表、加载状态和发送消息方法的对象。
 */
export function useChat() {
    const [threadsList, setThreadsList] = useState<any[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    const apiUrl = import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:3000";

    const fetchThreads = async () => {
        try {
            const res = await fetch(`${apiUrl}/threads`);
            const data = await res.json();
            setThreadsList(data);
        } catch (e) {
            console.error("Failed to fetch threads", e);
        }
    };

    useEffect(() => {
        fetchThreads();
    }, []);

    const stream = useStream<typeof simpleAgent>({
        apiUrl,
        assistantId: import.meta.env.VITE_ASSISTANT_ID ?? "simple_agent",
    });

    // Also casually fetch threads when messages length changes (to catch new auto-generated threads)
    useEffect(() => {
        if (stream.messages.length > 0) {
            fetchThreads();
        }
    }, [stream.messages.length]);

    // If an implicit thread was created (activeThreadId is null but we have messages and threads fetched), automatically select top one
    useEffect(() => {
        if (activeThreadId === null && stream.messages.length > 0 && threadsList.length > 0) {
            setActiveThreadId(threadsList[0].thread_id);
        }
    }, [threadsList, activeThreadId, stream.messages.length]);

    // Wrapper for switchThread to also track UI active thread and refresh list
    const handleSwitchThread = (id: string | null) => {
        stream.switchThread(id);
        setActiveThreadId(id);
        fetchThreads(); // Refresh the list smoothly
    };

    const submitMessage = (text: string) => {
        if (!text.trim() || stream.isLoading) return;
        stream.submit({ messages: [{ type: "human" as const, content: text }] });
    };

    return {
        messages: stream.messages,
        isLoading: stream.isLoading,
        submitMessage,
        stopMessage: stream.stop,
        switchThread: handleSwitchThread,
        threadsList,
        activeThreadId,
        refreshThreads: fetchThreads,
    };
}
