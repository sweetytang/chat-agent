/**
 * ApprovalCard — HITL 人机交互审核卡片
 * 当 Agent 发出工具调用并需要用户审核时显示。
 * 支持批量查看工具请求；当仅有一个工具请求时允许编辑参数。
 */
import { useEffect, useMemo, useState } from 'react';
import type { HITLRequest, HITLResponse } from '../../types';
import styles from './index.module.scss';

interface ApprovalCardProps {
    /** 中断载荷 */
    interrupt: { value: HITLRequest };
    /** 用户做出决策后的回调 */
    onRespond: (response: HITLResponse) => void;
}

/** 卡片操作模式 */
type CardMode = "review" | "edit" | "reject";

export default function ApprovalCard({ interrupt, onRespond }: ApprovalCardProps) {
    const request = interrupt.value;
    const actions = request.actionRequests;
    const firstAction = actions[0];
    const config = request.reviewConfigs[0];
    const canEdit = Boolean(
        actions.length === 1 &&
        config &&
        request.reviewConfigs.every((item) => item.allowedDecisions.includes('edit'))
    );

    const [mode, setMode] = useState<CardMode>("review");
    const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>(
        firstAction?.args ?? {}
    );
    const [editDraft, setEditDraft] = useState(
        JSON.stringify(firstAction?.args ?? {}, null, 2)
    );
    const [rejectReason, setRejectReason] = useState("");
    const [jsonError, setJsonError] = useState("");

    useEffect(() => {
        setMode("review");
        setEditedArgs(firstAction?.args ?? {});
        setEditDraft(JSON.stringify(firstAction?.args ?? {}, null, 2));
        setRejectReason("");
        setJsonError("");
    }, [interrupt, firstAction]);

    const summaryText = useMemo(() => {
        if (actions.length === 1) {
            return firstAction?.description ?? `Agent 请求执行操作: ${firstAction?.action}`;
        }
        return `Agent 请求执行 ${actions.length} 个工具操作，请统一审核后继续。`;
    }, [actions, firstAction]);

    if (!firstAction || !config) return null;

    /** 提交批准 */
    const handleApprove = () => {
        onRespond({ decision: "approve" });
    };

    /** 确认拒绝 */
    const handleReject = () => {
        onRespond({ decision: "reject", reason: rejectReason });
    };

    /** 提交编辑后的参数 */
    const handleEditSubmit = () => {
        if (jsonError) return;
        onRespond({ decision: "edit", args: editedArgs });
    };

    /** 解析编辑区的 JSON 输入 */
    const handleEditChange = (value: string) => {
        setEditDraft(value);
        try {
            const parsed = JSON.parse(value);
            setEditedArgs(parsed);
            setJsonError("");
        } catch {
            // JSON 格式不正确时仅提示，不阻止输入
            setJsonError("JSON 格式不正确");
        }
    };

    return (
        <div className={styles.approvalCard}>
            {/* 卡片头部 */}
            <div className={styles.approvalHeader}>
                <span className={styles.approvalIcon}>⚠️</span>
                <h3 className={styles.approvalTitle}>操作审核</h3>
            </div>

            {/* 动作描述 */}
            <p className={styles.approvalDesc}>
                {summaryText}
            </p>

            {actions.map((action, index) => (
                <div key={`${action.action}-${index}`} className={styles.approvalArgsBox}>
                    <div className={styles.approvalActionTag}>
                        <span className={styles.approvalActionLabel}>
                            {actions.length > 1 ? `工具 ${index + 1}` : '工具'}
                        </span>
                        <span className={styles.approvalActionName}>{action.action}</span>
                    </div>
                    <pre className={styles.approvalArgsPre}>
                        {JSON.stringify(action.args, null, 2)}
                    </pre>
                </div>
            ))}

            {!canEdit && actions.length > 1 && (
                <p className={styles.approvalDesc}>
                    当前批量审核支持统一批准或拒绝。若要编辑参数，请让 Agent 逐个发起工具调用。
                </p>
            )}

            {/* ── 审核模式：显示三个按钮 ── */}
            {mode === "review" && (
                <div className={styles.approvalActions}>
                    {config.allowedDecisions.includes("approve") && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnApprove}`}
                            onClick={handleApprove}
                        >
                            ✓ 批准执行
                        </button>
                    )}
                    {config.allowedDecisions.includes("reject") && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
                            onClick={() => setMode("reject")}
                        >
                            ✕ 拒绝
                        </button>
                    )}
                    {canEdit && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnEdit}`}
                            onClick={() => setMode("edit")}
                        >
                            ✎ 编辑参数
                        </button>
                    )}
                </div>
            )}

            {/* ── 拒绝模式：填写拒绝原因 ── */}
            {mode === "reject" && (
                <div className={styles.approvalExpandArea}>
                    <textarea
                        className={styles.approvalTextarea}
                        placeholder="请输入拒绝原因（可选）..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                    />
                    <div className={styles.approvalExpandActions}>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnSecondary}`}
                            onClick={() => setMode("review")}
                        >
                            返回
                        </button>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
                            onClick={handleReject}
                        >
                            确认拒绝
                        </button>
                    </div>
                </div>
            )}

            {/* ── 编辑模式：修改参数 JSON ── */}
            {mode === "edit" && (
                <div className={styles.approvalExpandArea}>
                    <textarea
                        className={`${styles.approvalTextarea} ${styles.approvalTextareaMono}`}
                        value={editDraft}
                        onChange={(e) => handleEditChange(e.target.value)}
                        rows={6}
                    />
                    {jsonError && (
                        <p className={styles.approvalJsonError}>{jsonError}</p>
                    )}
                    <div className={styles.approvalExpandActions}>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnSecondary}`}
                            onClick={() => {
                                setMode("review");
                                setJsonError("");
                            }}
                        >
                            返回
                        </button>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnEdit}`}
                            onClick={handleEditSubmit}
                            disabled={!!jsonError}
                        >
                            提交修改
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
