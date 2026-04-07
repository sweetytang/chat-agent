/**
 * PresetCards — 预设提示卡片组件
 * 当没有消息时展示，用户点击后自动发送对应的提示文本
 */
import React from "react";
import styles from "./index.module.scss";
import { PRESETS } from "@frontend/constants";

interface PresetCardsProps {
    onSubmit: (text: string) => void;
}

export default function PresetCards({ onSubmit }: PresetCardsProps) {
    return (
        <div className={styles.presetsWrapper}>
            <p className={styles.presetsLabel}>试试这些更适合结构化输出的提示词：</p>
            <div className={styles.presetsGrid}>
                {PRESETS.map((p) => (
                    <button
                        key={p}
                        className={styles.presetCard}
                        onClick={() => onSubmit(p)}
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>
    );
}
