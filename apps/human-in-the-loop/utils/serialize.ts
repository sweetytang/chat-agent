/**
 * serialize.ts — 消息序列化工具
 * 将 LangChain 的 BaseMessage 对象数组序列化为可 JSON 传输的普通对象数组。
 */
import { BaseMessage } from "@langchain/core/messages";
import { uuid } from "./uuid";

/**
 * 将 BaseMessage[] 序列化为普通对象数组
 * 提取 type、content、id、tool_calls、tool_call_id 关键字段
 */
export function serializeMessages(messages: BaseMessage[]): any[] {
    return messages.map((msg: any) => {
        const type = msg._getType();
        const {
            content,
            id = uuid(),
            tool_calls,
            tool_call_id,
        } = msg || {};
        return {
            type,
            content,
            id,
            tool_calls,
            tool_call_id,
        };
    });
}
