import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './index.module.css';

export function MessageContent({ content }: { content: string }) {
  return (
    <div className={styles.content}>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}
