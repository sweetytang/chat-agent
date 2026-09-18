import { Braces, ClipboardList, ListChecks, ScanText } from 'lucide-react';

import styles from './index.module.css';

const prompts = [
  { icon: Braces, label: '分析一段代码', prompt: '请分析这段代码的结构、潜在问题和改进建议：' },
  { icon: ClipboardList, label: '结构化整理', prompt: '请将以下内容整理成清晰的结构化信息：' },
  { icon: ListChecks, label: '制定执行计划', prompt: '请为以下目标制定一份可执行的分步计划：' },
  { icon: ScanText, label: '总结文本', prompt: '请总结以下文本的核心观点和关键结论：' },
];

export function WelcomePanel({
  authenticated,
  onPrompt,
}: {
  authenticated: boolean;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <section className={styles.welcome}>
      <h1>{authenticated ? '今天想一起完成什么？' : '欢迎使用 OpenAgent'}</h1>
      <p>
        {authenticated
          ? '从一个问题开始，我会协助你思考、组织并执行。'
          : '可以直接开始体验对话；登录后可在多设备间同步会话记录。'}
      </p>
      {authenticated ? (
        <div className={styles.prompts}>
          {prompts.map(({ icon: Icon, label, prompt }) => (
            <button key={label} onClick={() => onPrompt(prompt)} type="button">
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
