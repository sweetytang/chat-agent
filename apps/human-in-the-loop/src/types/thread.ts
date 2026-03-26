import { IObj, SerializedMessage } from './index';

export interface IThreadDTO extends IObj {
    thread_id: string;
    user_id?: string;
    created_at: Date;
    updated_at: Date;
    metadata: IObj;
    status: string;
    checkpoint_id?: string;
    values: IObj & { messages?: SerializedMessage[] };
}

export interface ThreadRecord {
    threadId: string;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadataJson: string;
    status: string;
    valuesJson: string;
    latestCheckpointId: string | null;
}