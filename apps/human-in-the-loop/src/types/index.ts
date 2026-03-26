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
    tool_calls?: IObj[];
    tool_call_id?: string;
}

export type SendEvent = (event: string, data: IObj | null) => void;

export enum MessageTypeEnum {
    HUMAN = 'human',
    AI = 'ai',
    TOOL = 'tool',
    SYSTEM = 'system'
}
