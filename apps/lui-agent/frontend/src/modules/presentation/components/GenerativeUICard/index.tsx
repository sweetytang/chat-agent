import styles from './index.module.css';

export function GenerativeUICard({ value }: { value: Record<string, unknown> }) {
  const component = value.component === 'NoticeCard' ? 'NoticeCard' : '安全展示卡片';
  const text = typeof value.text === 'string' ? value.text : JSON.stringify(value.props ?? value);
  return (
    <section className={styles.card} aria-label="生成式 UI">
      <span className={styles.badge}>{component}</span>
      <p>{text}</p>
    </section>
  );
}
