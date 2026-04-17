import type { ThreadTask } from '@langchain/langgraph-sdk';
import { IObj, SerializedMessage } from './index';

export enum ThreadStatus {
    IDLE = "idle",
    INTERRUPTED = "interrupted",
}

export interface ThreadCheckpoint {
    thread_id: string;
    checkpoint_ns: string;
    checkpoint_id: string;
    checkpoint_map: IObj;
}

export interface ThreadStateValues extends IObj {
    messages?: SerializedMessage[];
}

export interface ThreadStateDTO {
    values: ThreadStateValues;
    next: string[];
    tasks: ThreadTask[];
    checkpoint: ThreadCheckpoint;
    metadata: IObj;
    created_at: string;
    parent_checkpoint: ThreadCheckpoint;
}
