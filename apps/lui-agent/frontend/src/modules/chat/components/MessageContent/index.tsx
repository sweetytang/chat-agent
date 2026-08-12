import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from '@/modules/chat/components/CodeBlock';

import styles from './index.module.css';

export function MessageContent({ content }: { content: string }) {
  return (
    <div className={styles.content}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const text = Array.isArray(children)
              ? children.filter((child): child is string => typeof child === 'string').join('')
              : typeof children === 'string'
                ? children
                : '';
            if (className || text.includes('\n'))
              return <CodeBlock className={className}>{text}</CodeBlock>;
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className={styles.tableWrap}>
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
