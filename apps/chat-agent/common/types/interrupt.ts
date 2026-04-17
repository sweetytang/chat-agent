// ── Human-in-the-Loop 类型 ──────────────────────────────────────────────────

/** 待审核的动作请求 */
interface ActionRequest {
    /** LangChain 原生字段 */
    name?: string;
    /** 兼容旧前端字段 */
    action?: string;
    /** 动作参数 */
    args: Record<string, unknown>;
    /** 可选的动作描述文字 */
    description?: string;
}

/** 审核配置，定义允许的决策类型 */
interface ReviewConfig {
    actionName?: string;
    allowedDecisions: ("approve" | "reject" | "edit")[];
}

/** 中断载荷：Agent 发出的审核请求 */
export interface HITLRequest {
    /** 前端侧稳定标识，优先复用已有 requestId，否则按 interrupt 内容生成 */
    requestId?: string;
    actionRequests: ActionRequest[];
    reviewConfigs: ReviewConfig[];
}

interface InterruptCheckpoint {
    checkpoint_id: string;
    checkpoint_ns: string;
    checkpoint_map: Record<string, unknown> | null;
}

/** 用户的审核响应 */
export interface HITLResponse {
    decision: "approve" | "reject" | "edit";
    /** 当前审核卡片所属的 requestId，用于防止分支切换后的过期提交 */
    requestId?: string;
    /** 当前审核卡片所属的 checkpointId，用于确保恢复执行时仍落在正确分支 */
    checkpointId?: string | null;
    /** 当前审核卡片所属的完整 checkpoint，用于恢复同一次 interrupt */
    checkpoint?: InterruptCheckpoint | null;
    /** reject 时的拒绝原因 */
    reason?: string;
    /** edit 时，按工具顺序提交的参数列表；未修改项保持原参数即可 */
    argsList?: Record<string, unknown>[];
    /** 当前这张审核卡片上的动作列表，用于转换成 LangChain resume.decisions */
    actionRequests?: ActionRequest[];
}

export enum DecisionEnum {
    APPROVE = 'approve',
    REJECT = 'reject',
    EDIT = 'edit'
}
