import { CodeBlock } from '@/shared/components/CodeBlock';

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
  function format() {
    try {
      onChange(JSON.stringify(JSON.parse(source), null, 2));
    } catch {
      onError('JSON 格式无效，无法格式化');
    }
  }

  return (
    <div className={styles.jsonEditor}>
      <CodeBlock
        ariaLabel="原始 MCP JSON"
        className={styles.codeBlock}
        height="350px"
        language="json"
        onChange={onChange}
        placeholder={placeholder}
        readOnly={false}
        value={source}
      />
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
