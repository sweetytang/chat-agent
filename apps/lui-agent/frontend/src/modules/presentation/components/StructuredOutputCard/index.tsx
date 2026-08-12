import styles from './index.module.css';

export function StructuredOutputCard({ value }: { value: Record<string, unknown> }) {
  const text = typeof value.value === 'string' ? value.value : null;
  return (
    <section className={styles.card} aria-label="结构化输出">
      <strong>结构化输出</strong>
      {text ? <p>{text}</p> : <pre>{JSON.stringify(value, null, 2)}</pre>}
    </section>
  );
}
