import styles from './index.module.css';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true">
      <span className={styles.first} />
      <span className={styles.second} />
    </span>
  );
}
