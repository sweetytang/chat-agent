/**
 * ApprovalCard — HITL 人机交互审核卡片
 * 当 Agent 发出工具调用并需要用户审核时显示。
 * 支持批量查看工具请求，并可逐个编辑每个工具的参数后统一执行。
 */
import { useEffect, useMemo, useState } from 'react';
import type { HITLRequest, HITLResponse } from '@common/types/interrupt';
import styles from './index.module.scss';

interface ApprovalCardProps {
    /** 中断载荷 */
    interrupt: { value: HITLRequest };
    /** 用户做出决策后的回调 */
    onRespond: (response: HITLResponse) => void;
    /** 是否正在提交审核 */
    submitting?: boolean;
}

/** 卡片操作模式 */
type CardMode = "review" | "edit" | "reject";

function formatArgs(args: Record<string, unknown> | undefined) {
    return JSON.stringify(args ?? {}, null, 2);
}

export default function ApprovalCard({ interrupt, onRespond, submitting = false }: ApprovalCardProps) {
    const request = interrupt.value;
    const actions = request.actionRequests;
    const firstAction = actions[0];
    const canApprove = request.reviewConfigs.every((item) => item.allowedDecisions.includes('approve'));
    const canReject = request.reviewConfigs.every((item) => item.allowedDecisions.includes('reject'));
    const canEdit = request.reviewConfigs.every((item) => item.allowedDecisions.includes('edit'));

    const [mode, setMode] = useState<CardMode>("review");
    const [editedArgsList, setEditedArgsList] = useState<Record<string, unknown>[]>(
        actions.map((action) => action.args ?? {})
    );
    const [editDrafts, setEditDrafts] = useState<string[]>(
        actions.map((action) => formatArgs(action.args))
    );
    const [rejectReason, setRejectReason] = useState("");
    const [jsonErrors, setJsonErrors] = useState<string[]>(
        actions.map(() => "")
    );

    useEffect(() => {
        setMode("review");
        setEditedArgsList(actions.map((action) => action.args ?? {}));
        setEditDrafts(actions.map((action) => formatArgs(action.args)));
        setRejectReason("");
        setJsonErrors(actions.map(() => ""));
    }, [interrupt, actions]);

    const originalDrafts = useMemo(
        () => actions.map((action) => formatArgs(action.args)),
        [actions]
    );

    const dirtyStates = useMemo(
        () => actions.map((_, index) => editDrafts[index] !== originalDrafts[index]),
        [actions, editDrafts, originalDrafts]
    );

    const hasAnyEdits = dirtyStates.some(Boolean);
    const hasJsonErrors = jsonErrors.some(Boolean);

    const summaryText = useMemo(() => {
        if (actions.length === 1) {
            return firstAction?.description ?? `Agent 请求执行操作: ${firstAction?.action}`;
        }
        return `Agent 请求执行 ${actions.length} 个工具操作，你可以逐个编辑参数后再统一执行。`;
    }, [actions, firstAction]);

    if (!firstAction) return null;

    /** 提交批准 */
    const handleApprove = () => {
        if (submitting) return;
        onRespond({ decision: "approve" });
    };

    /** 确认拒绝 */
    const handleReject = () => {
        if (submitting) return;
        onRespond({ decision: "reject", reason: rejectReason });
    };

    /** 提交编辑后的参数 */
    const handleEditSubmit = () => {
        if (submitting || jsonErrors.some(Boolean)) return;
        onRespond({ decision: "edit", argsList: editedArgsList });
    };

    /** 解析编辑区的 JSON 输入 */
    const handleEditChange = (index: number, value: string) => {
        setEditDrafts((current) => current.map((draft, currentIndex) => (
            currentIndex === index ? value : draft
        )));
        try {
            const parsed = JSON.parse(value);
            setEditedArgsList((current) => current.map((args, currentIndex) => (
                currentIndex === index ? parsed : args
            )));
            setJsonErrors((current) => current.map((error, currentIndex) => (
                currentIndex === index ? "" : error
            )));
        } catch {
            // JSON 格式不正确时仅提示，不阻止输入
            setJsonErrors((current) => current.map((error, currentIndex) => (
                currentIndex === index ? "JSON 格式不正确" : error
            )));
        }
    };

    const handleResetArgs = (index: number) => {
        const originalArgs = actions[index]?.args ?? {};
        const originalDraft = formatArgs(originalArgs);
        setEditedArgsList((current) => current.map((args, currentIndex) => (
            currentIndex === index ? originalArgs : args
        )));
        setEditDrafts((current) => current.map((draft, currentIndex) => (
            currentIndex === index ? originalDraft : draft
        )));
        setJsonErrors((current) => current.map((error, currentIndex) => (
            currentIndex === index ? "" : error
        )));
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

            {canEdit && (
                <div className={styles.approvalHint}>
                    <span className={styles.approvalHintTitle}>提示</span>
                    <span>只改你想调整的工具即可，未修改的工具会保留原参数执行。</span>
                </div>
            )}

            {submitting && (
                <div className={styles.approvalHint}>
                    <span className={styles.approvalHintTitle}>执行中</span>
                    <span>审核已提交，正在继续执行工具，请稍候。</span>
                </div>
            )}

            {actions.map((action, index) => (
                <div
                    key={`${action.action}-${index}`}
                    className={`${styles.approvalArgsBox} ${mode === "edit" ? styles.approvalArgsBoxEditing : ""}`}
                >
                    {mode === "edit" ? (
                        <div className={styles.approvalEditHeader}>
                            <div className={styles.approvalActionTag}>
                                <span className={styles.approvalActionLabel}>
                                    {actions.length > 1 ? `工具 ${index + 1}` : '工具'}
                                </span>
                                <span className={styles.approvalActionName}>{action.action}</span>
                            </div>
                            <div className={styles.approvalEditMeta}>
                                <span
                                    className={`${styles.approvalEditState} ${dirtyStates[index] ? styles.approvalEditStateChanged : styles.approvalEditStateOriginal
                                        }`}
                                >
                                    {dirtyStates[index] ? '已修改' : '沿用原参数'}
                                </span>
                                <button
                                    type="button"
                                    className={styles.approvalResetBtn}
                                    onClick={() => handleResetArgs(index)}
                                    disabled={submitting || !dirtyStates[index]}
                                >
                                    恢复原参数
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.approvalActionTag}>
                            <span className={styles.approvalActionLabel}>
                                {actions.length > 1 ? `工具 ${index + 1}` : '工具'}
                            </span>
                            <span className={styles.approvalActionName}>{action.action}</span>
                        </div>
                    )}

                    <span className={styles.approvalArgsLabel}>
                        {mode === "edit" ? "原参数" : "参数"}
                    </span>
                    <pre className={styles.approvalArgsPre}>
                        {JSON.stringify(action.args, null, 2)}
                    </pre>

                    {mode === "edit" && (
                        <>
                            <p className={styles.approvalEditHint}>
                                {dirtyStates[index]
                                    ? '将使用下面的执行参数运行该工具。'
                                    : '当前未修改，执行时会沿用上面的原参数。'}
                            </p>
                            <span className={styles.approvalArgsLabel}>执行参数</span>
                            <textarea
                                className={`${styles.approvalTextarea} ${styles.approvalTextareaMono}`}
                                value={editDrafts[index] ?? ""}
                                onChange={(e) => handleEditChange(index, e.target.value)}
                                rows={6}
                                disabled={submitting}
                            />
                            {jsonErrors[index] && (
                                <p className={styles.approvalJsonError}>{jsonErrors[index]}</p>
                            )}
                        </>
                    )}
                </div>
            ))}

            {/* ── 审核模式：显示三个按钮 ── */}
            {mode === "review" && (
                <div className={styles.approvalActions}>
                    {canApprove && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnApprove}`}
                            onClick={handleApprove}
                            disabled={submitting}
                        >
                            ✓ 批准执行
                        </button>
                    )}
                    {canReject && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
                            onClick={() => setMode("reject")}
                            disabled={submitting}
                        >
                            ✕ 拒绝
                        </button>
                    )}
                    {canEdit && (
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnEdit}`}
                            onClick={() => setMode("edit")}
                            disabled={submitting}
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
                        disabled={submitting}
                    />
                    <div className={styles.approvalExpandActions}>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnSecondary}`}
                            onClick={() => setMode("review")}
                            disabled={submitting}
                        >
                            返回
                        </button>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
                            onClick={handleReject}
                            disabled={submitting}
                        >
                            确认拒绝
                        </button>
                    </div>
                </div>
            )}

            {/* ── 编辑模式：统一提交修改后的各工具参数 ── */}
            {mode === "edit" && (
                <div className={styles.approvalExpandArea}>
                    <div className={styles.approvalHint}>
                        <span className={styles.approvalHintTitle}>执行说明</span>
                        <span>每张工具卡片中的“执行参数”都会按顺序提交；未改动的卡片会继续使用原参数。</span>
                    </div>
                    <div className={styles.approvalExpandActions}>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnSecondary}`}
                            onClick={() => {
                                setMode("review");
                                setJsonErrors(actions.map(() => ""));
                            }}
                            disabled={submitting}
                        >
                            返回
                        </button>
                        <button
                            className={`${styles.approvalBtn} ${styles.approvalBtnEdit}`}
                            onClick={handleEditSubmit}
                            disabled={submitting || hasJsonErrors}
                        >
                            {hasAnyEdits ? '保存修改并执行' : '按原参数执行'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
