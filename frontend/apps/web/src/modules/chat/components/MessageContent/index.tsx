import { Lexer } from 'marked';
import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from '@/shared/components/CodeBlock';

import styles from './index.module.css';

const remarkPlugins = [remarkGfm];

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const text = Array.isArray(children)
      ? children.filter((child): child is string => typeof child === 'string').join('')
      : typeof children === 'string'
        ? children
        : '';
    if (className || text.includes('\n')) return <CodeBlock language={className} value={text} />;
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
};

interface MessageContentProps {
  content: string;
}

function splitMarkdownBlocks(content: string) {
  const tokens = Lexer.lex(content, { gfm: true });
  // 引用链接定义依赖同一棵 Markdown 语法树，不能拆成独立块解析。
  if (tokens.some((token) => token.type === 'def')) return [{ content, key: 'document' }];
  return tokens.map((token, index) => ({
    content: token.raw,
    key: `${index}-${token.type}`,
  }));
}

const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
      {content}
    </Markdown>
  );
});

function MessageContentComponent({ content }: MessageContentProps) {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

  return (
    <div className={styles.content}>
      {blocks.map((block) => (
        <MarkdownBlock content={block.content} key={block.key} />
      ))}
    </div>
  );
}

export const MessageContent = memo(MessageContentComponent);
