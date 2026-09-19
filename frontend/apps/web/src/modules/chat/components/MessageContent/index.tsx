import { Lexer } from 'marked';
import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from '@/shared/components/CodeBlock';

import styles from './index.module.css';

const remarkPlugins = [remarkGfm];

function renderTextWithSkills(text: string) {
  // 匹配行首或空格后的 /skill-name 或 $skill-name
  const regex = /(?:^|\s)([/][a-zA-Z0-9_-]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const token = match[1];
    const matchStart = match.index + (fullMatch.length - token.length);

    if (matchStart > lastIndex) { // 有普通文字
      parts.push(text.slice(lastIndex, matchStart));
    }
    // skill部分
    parts.push(
      <span key={`${matchStart}-${token}`} className={styles.skillTokenHighlight}>
        {token}
      </span>,
    );
    lastIndex = matchStart + token.length;
  }

  // 尾部还有普通文字
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

const markdownComponents: Components = {
  p({ children }) {
    if (typeof children === 'string') {
      return <p>{renderTextWithSkills(children)}</p>;
    }
    if (Array.isArray(children)) {
      return (
        <p>
          {children.map((child) =>
            typeof child === 'string' ? renderTextWithSkills(child) : child,
          )}
        </p>
      );
    }
    return <p>{children}</p>;
  },
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
