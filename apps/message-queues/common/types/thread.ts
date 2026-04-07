import { HITLRequest } from './interrupt';
import { IObj, SerializedMessage } from './index';

export enum ThreadStatus {
    IDLE = "idle",
    INTERRUPTED = "interrupted",
}

export interface ThreadCheckpoint {
    thread_id: string;
    checkpoint_ns: string;
    checkpoint_id: string | null;
    checkpoint_map: IObj | null;
}

export interface ThreadTaskInterrupt {
    value?: HITLRequest;
    when?: "during" | string;
}

export interface ThreadTaskState {
    id: string;
    name: string;
    interrupts: ThreadTaskInterrupt[];
}

export interface ThreadStateValues extends IObj {
    messages?: SerializedMessage[];
}

export interface ThreadStateDTO {
    values: ThreadStateValues;
    next: string[];
    tasks: ThreadTaskState[];
    checkpoint: ThreadCheckpoint | null;
    metadata: IObj;
    created_at: string | null;
    parent_checkpoint: ThreadCheckpoint | null;
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
    status: string;
    valuesJson: string;
    latestCheckpointId: string | null;
}

export interface ThreadCheckpointRecord {
    checkpointId: string;
    threadId: string;
    createdAt: Date;
    status: string;
    metadataJson: string;
    valuesJson: string;
    parentCheckpointId: string | null;
}
