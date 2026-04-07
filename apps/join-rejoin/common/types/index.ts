export type IObj<T = any> = Record<string, T>;

export interface IUser {
    user_id: string;
    username: string;
    created_at: Date;
}

export interface SerializedMessage extends IObj {
    type: string;
    content: unknown;
    id: string;
    name?: string;
    tool_calls?: IObj[];
    invalid_tool_calls?: IObj[];
    tool_call_id?: string;
    additional_kwargs?: IObj;
    response_metadata?: IObj;
    usage_metadata?: IObj;
}

export enum MessageTypeEnum {
    HUMAN = 'human',
    AI = 'ai',
    TOOL = 'tool',
    SYSTEM = 'system'
}
