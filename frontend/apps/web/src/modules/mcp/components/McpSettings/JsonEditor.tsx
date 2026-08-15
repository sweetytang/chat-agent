import { useState } from 'react';

import styles from './index.module.css';

export interface JsonValidation {
  valid: boolean;
  label: string;
  detail: string;
}

interface JsonEditorProps {
  source: string;
  value: string;
  validation: JsonValidation;
  busy: boolean;
  onChange: (value: string) => void;
  onImport: () => void;
  onError: (message: string) => void;
  placeholder: string;
}

function highlightJson(source: string) {
  const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(?:\\.|[^"\\])*")\s*(?=:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}[\],:])/g,
    (_token, key, string, number, bool, punctuation) => {
      if (key) return `<span class="jsonKey">${key}</span>`;
      if (string) return `<span class="jsonString">${string}</span>`;
      if (number) return `<span class="jsonNumber">${number}</span>`;
      if (bool) return `<span class="jsonBoolean">${bool}</span>`;
      return `<span class="jsonPunctuation">${punctuation}</span>`;
    },
  );
}

export function JsonEditor({
  source,
  value,
  validation,
  busy,
  onChange,
  onImport,
  onError,
  placeholder,
}: JsonEditorProps) {
  const lines = source.split('\n');
  const [activeLine, setActiveLine] = useState(1);

  function format() {
    try {
      onChange(JSON.stringify(JSON.parse(source), null, 2));
    } catch {
      onError('JSON 格式无效，无法格式化');
    }
  }

  return (
    <div className={styles.jsonEditor}>
      <div className={styles.codeViewport}>
        <div className={styles.lineNumbers} aria-hidden="true">
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre className={styles.jsonCode} aria-hidden="true">
          {lines.map((line, index) => (
            <span
              className={index + 1 === activeLine ? styles.activeJsonLine : ''}
              key={`${index}-${line}`}
              dangerouslySetInnerHTML={{ __html: highlightJson(line) || ' ' }}
            />
          ))}
        </pre>
        <textarea
          aria-label="原始 MCP JSON"
          spellCheck={false}
          value={source}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) =>
            setActiveLine(
              event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split('\n')
                .length,
            )
          }
          placeholder={placeholder}
        />
      </div>
      <div className={styles.editorFooter}>
        <span>
          <i className={validation.valid ? styles.jsonValid : styles.jsonInvalid} />
          {value.trim()
            ? `${validation.label} · ${validation.detail}`
            : '通用 MCP 配置模板 · 点击编辑'}
        </span>
        <div className={styles.editorActions}>
          <button type="button" onClick={format}>
            格式化
          </button>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(source)}>
            复制
          </button>
          <button
            className={styles.primaryButton}
            disabled={busy || !value.trim()}
            type="button"
            onClick={onImport}
          >
            导入配置
          </button>
        </div>
      </div>
    </div>
  );
}
