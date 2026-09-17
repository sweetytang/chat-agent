import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';
import CodeMirror, { type Extension } from '@uiw/react-codemirror';
import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import styles from './index.module.css';

const languageLabels: Record<string, string> = {
  json: 'JSON',
  markdown: 'Markdown',
  md: 'Markdown',
};

const codeTheme = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.bool, tags.null], color: 'var(--accent)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--success)' },
    { tag: [tags.number, tags.integer, tags.float], color: 'var(--warning)' },
    { tag: [tags.comment, tags.meta], color: 'var(--code-muted)' },
    {
      tag: [tags.propertyName, tags.definition(tags.propertyName)],
      color: 'var(--code-inline-text)',
    },
    { tag: [tags.punctuation, tags.operator], color: 'var(--code-muted)' },
  ]),
);

function normalizeLanguage(language?: string) {
  return language
    ?.replace(/^language-/, '')
    .trim()
    .toLowerCase();
}

function languageExtension(language?: string): Extension | null {
  switch (normalizeLanguage(language)) {
    case 'json':
      return json();
    case 'markdown':
    case 'md':
      return markdown();
    default:
      return null;
  }
}

export interface CodeBlockProps {
  value: string;
  language?: string;
  label?: string;
  showCopy?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  extensions?: Extension[];
  height?: string;
  lineNumbers?: boolean;
  folding?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function CodeBlock({
  value,
  language,
  label,
  showCopy = true,
  readOnly = true,
  onChange,
  extensions = [],
  height,
  lineNumbers = true,
  folding = true,
  placeholder,
  className,
  ariaLabel,
}: CodeBlockProps) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const normalizedLanguage = normalizeLanguage(language);
  const editorExtensions = useMemo(() => {
    const selectedLanguage = languageExtension(normalizedLanguage);
    return [codeTheme, ...(selectedLanguage ? [selectedLanguage] : []), ...extensions];
  }, [extensions, normalizedLanguage]);

  useEffect(() => {
    if (feedback === 'idle') return;
    const timeout = window.setTimeout(() => setFeedback('idle'), 1500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
  }

  const displayLabel = label ?? languageLabels[normalizedLanguage ?? ''] ?? '代码';

  return (
    <div className={`${styles.block}${className ? ` ${className}` : ''}`}>
      <div className={styles.toolbar}>
        <span>{displayLabel}</span>
        {showCopy ? (
          <button aria-label={`复制${displayLabel}`} onClick={() => void copy()} type="button">
            {feedback === 'copied' ? <Check size={14} /> : <Copy size={14} />}
            {feedback === 'copied' ? '已复制' : feedback === 'failed' ? '复制失败' : '复制'}
          </button>
        ) : null}
      </div>
      <CodeMirror
        aria-label={ariaLabel ?? displayLabel}
        basicSetup={{ foldGutter: folding, lineNumbers, highlightSelectionMatches: false }}
        className={styles.editor}
        editable={!readOnly}
        extensions={editorExtensions}
        height={height}
        maxHeight={height ? undefined : '360px'}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        theme="none"
        value={value}
      />
    </div>
  );
}
