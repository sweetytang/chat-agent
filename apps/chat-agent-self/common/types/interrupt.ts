// ── Human-in-the-Loop 类型 ──────────────────────────────────────────────────

/** 待审核的动作请求 */
interface ActionRequest {
    /** 动作名称，如 "send_email"、"delete_record" */
    action: string;
    /** 动作参数 */
    args: Record<string, unknown>;
    /** 可选的动作描述文字 */
    description?: string;
}

/** 审核配置，定义允许的决策类型 */
interface ReviewConfig {
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
    /** 当前审核卡片所属的 requestId，用于防止分支切换后的过期提交 */
    requestId?: string;
    /** 当前审核卡片所属的 checkpointId，用于确保恢复执行时仍落在正确分支 */
    checkpointId?: string | null;
    /** reject 时的拒绝原因 */
    reason?: string;
    /** edit 时，按工具顺序提交的参数列表；未修改项保持原参数即可 */
    argsList?: Record<string, unknown>[];
}

export enum DecisionEnum {
    APPROVE = 'approve',
    REJECT = 'reject',
    EDIT = 'edit'
}
