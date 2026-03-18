import { BaseMessage } from "@langchain/core/messages";

export type IObj<T = any> = Record<string, T>;

export interface IThread extends IObj {
    thread_id: string;
    created_at: string;
    updated_at: string;
    metadata: IObj;
    status: string;
    values: IObj & { messages?: BaseMessage[] };
}