import { useEffect, useState } from 'react';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { getMessageText } from '@common/utils/messageContent';
import CollapsibleBox from '@frontend/components/CollapsibleBox';
import Markdown from '@frontend/components/Markdown';
import { extractAiDisplayContent } from '@frontend/services/chat/reasoning';
import type { ThreadMessageBranchMetadata } from '@frontend/types/chat';
import BranchSwitcher from '../BranchSwitcher';
import ReasoningBubble from '../ReasoningBubble';
import { ToolCard } from '../ToolCards';
import styles from './index.module.scss';

interface MessageBubbleProps {
    controlsDisabled?: boolean;
    isStreamingAiMessage?: boolean;
    message: BaseMessage;
    messageId: string;
    messageToolCalls?: any[];
    metadata?: ThreadMessageBranchMetadata;
    onBranchSwitch: (branchId: string) => void;
    onEdit: (text: string) => void;
    onRegenerate: () => void;
}

export default function MessageBubble({
    controlsDisabled = false,
    isStreamingAiMessage = false,
    message,
    messageId,
    messageToolCalls = [],
    metadata,
    onBranchSwitch,
    onEdit,
    onRegenerate,
}: MessageBubbleProps) {
    const [draft, setDraft] = useState(getMessageText(message));
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setDraft(getMessageText(message));
        setIsEditing(false);
    }, [message]);

    const isHumanMessage = HumanMessage.isInstance(message);
    const isAiMessage = AIMessage.isInstance(message);
    const aiDisplayContent = isAiMessage ? extractAiDisplayContent(message) : null;
    const aiMessageText = aiDisplayContent?.text ?? getMessageText(message);
    const reasoningText = aiDisplayContent?.reasoningText ?? '';
    const isToolInvocationMessage = isAiMessage && messageToolCalls.length > 0;
    const canEdit = isHumanMessage;
    const canRegenerate =
        isAiMessage &&
        !isToolInvocationMessage &&
        Boolean(metadata?.firstSeenState?.parent_checkpoint);
    const showHumanControls = isHumanMessage;
    const showAiControls = isAiMessage && !isToolInvocationMessage;

    if (isHumanMessage) {
        return (
            <div className={`${styles.bubbleRow} ${styles.bubbleRowHuman}`}>
                <div className={`${styles.bubble} ${styles.bubbleHuman}`}>
                    {isEditing ? (
                        <div className={styles.editWrapper}>
                            <textarea
                                className={styles.editInput}
                                rows={3}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                disabled={controlsDisabled}
                            />
                            <div className={styles.actionRow}>
                                <button
                                    className={styles.actionButton}
                                    type="button"
                                    disabled={controlsDisabled || !draft.trim()}
                                    onClick={() => {
                                        onEdit(draft);
                                        setIsEditing(false);
                                    }}
                                >
                                    保存并分支
                                </button>
                                <button
                                    className={styles.secondaryButton}
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => {
                                        setDraft(getMessageText(message));
                                        setIsEditing(false);
                                    }}
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <CollapsibleBox
                                collapseKey={messageId}
                                tone="light"
                                fade="human"
                                maxCollapsedHeight={240}
                            >
                                <Markdown>{getMessageText(message)}</Markdown>
                            </CollapsibleBox>
                            {showHumanControls && (
                                <div className={styles.metaRow}>
                                    <BranchSwitcher
                                        branch={metadata?.branch}
                                        branchOptions={metadata?.branchOptions}
                                        disabled={controlsDisabled}
                                        onSwitch={onBranchSwitch}
                                    />
                                    <button
                                        className={styles.secondaryButton}
                                        type="button"
                                        disabled={controlsDisabled || !canEdit}
                                        onClick={() => setIsEditing(true)}
                                    >
                                        编辑
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    if (isAiMessage) {
        return (
            <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                <div className={styles.bubbleAvatar}>✦</div>
                <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                    {reasoningText && (
                        <ReasoningBubble
                            isStreaming={isStreamingAiMessage}
                            reasoning={reasoningText}
                        />
                    )}
                    {aiMessageText && (
                        <CollapsibleBox
                            collapseKey={messageId}
                            freezeAutoCollapse={isStreamingAiMessage}
                            maxCollapsedHeight={240}
                        >
                            <Markdown streaming={isStreamingAiMessage}>{aiMessageText}</Markdown>
                        </CollapsibleBox>
                    )}
                    {messageToolCalls.length > 0 && (
                        <div className={styles.toolCallsWrapper}>
                            {messageToolCalls.map((toolCall: any, index: number) => (
                                <ToolCard key={toolCall.call?.id || index} toolCall={toolCall} />
                            ))}
                        </div>
                    )}
                    {showAiControls && (
                        <div className={styles.metaRow}>
                            <BranchSwitcher
                                branch={metadata?.branch}
                                branchOptions={metadata?.branchOptions}
                                disabled={controlsDisabled}
                                onSwitch={onBranchSwitch}
                            />
                            <button
                                className={styles.secondaryButton}
                                type="button"
                                disabled={controlsDisabled || !canRegenerate}
                                onClick={onRegenerate}
                            >
                                重新生成
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
}
