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

// ── Human-in-the-Loop 类型 ──────────────────────────────────────────────────

/** 待审核的动作请求 */
export interface ActionRequest {
    /** 动作名称，如 "send_email"、"delete_record" */
    action: string;
    /** 动作参数 */
    args: Record<string, unknown>;
    /** 可选的动作描述文字 */
    description?: string;
}

/** 审核配置，定义允许的决策类型 */
export interface ReviewConfig {
    allowedDecisions: ("approve" | "reject" | "edit")[];
}

/** 中断载荷：Agent 发出的审核请求 */
export interface HITLRequest {
    requestId: string;
    actionRequests: ActionRequest[];
    reviewConfigs: ReviewConfig[];
}

/** 用户的审核响应 */
export interface HITLResponse {
    decision: "approve" | "reject" | "edit";
    /** reject 时的拒绝原因 */
    reason?: string;
    /** edit 时，按工具顺序提交的参数列表；未修改项保持原参数即可 */
    argsList?: Record<string, unknown>[];
}

export type SendEvent = (event: string, data: IObj | null) => void;

export enum MessageTypeEnum {
    HUMAN = 'human',
    AI = 'ai',
    TOOL = 'tool',
    SYSTEM = 'system'
}

export enum DecisionEnum {
    APPROVE = 'approve',
    REJECT = 'reject',
    EDIT = 'edit'
}
