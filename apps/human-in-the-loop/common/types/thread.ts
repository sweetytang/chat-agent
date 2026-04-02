import { IObj, SerializedMessage } from './index';

export enum ThreadStatus {
    IDLE = "idle",
    INTERRUPTED = "interrupted",
}

export interface IThreadDTO extends IObj {
    thread_id: string;
    user_id?: string;
    created_at: Date;
    updated_at: Date;
    metadata: IObj;
    status: ThreadStatus;
    checkpoint_id?: string;
    values: IObj & { messages?: SerializedMessage[] };
}

export interface ThreadRecord {
    threadId: string;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadataJson: string;
    status: ThreadStatus;
    valuesJson: string;
    latestCheckpointId: string | null;
}