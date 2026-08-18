import * as Collapsible from '@radix-ui/react-collapsible';
import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  ExternalLink,
  FileJson,
  LoaderCircle,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import type { ToolItem } from '@/modules/timeline/types';
import { CodeBlock } from '@/shared/components/CodeBlock';

import styles from './index.module.css';

const LABELS: Record<ToolItem['status'], string> = {
  running: '执行中',
  awaiting_approval: '等待审核',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function displayToolName(tool: string): string {
  const marker = tool.startsWith('mcp__') ? tool.indexOf('__', 5) : -1;
  const rawName = marker >= 0 ? tool.slice(marker + 2).replace(/_[a-f0-9]{10}$/, '') : tool;
  return rawName.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return formatJson(value, 0);
}

function formatJson(value: unknown, indentation = 2): string {
  try {
    return JSON.stringify(value, null, indentation) ?? String(value);
  } catch {
    return String(value);
  }
}

function parseEmbeddedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function resultError(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.error === 'string') return record.error;
  const error = asRecord(record.error);
  if (typeof error?.message === 'string') return error.message;
  if (record.type === 'error') {
    if (typeof record.message === 'string') return record.message;
    if (typeof record.text === 'string') return record.text;
  }
  return null;
}

function ResultBlock({ block, index }: { block: unknown; index: number }) {
  const record = asRecord(block);
  const type = record?.type;
  const parsed = type === 'text' ? parseEmbeddedJson(record?.text) : (record ?? block);
  const parsedRecord = asRecord(parsed);
  const url = safeHttpUrl(parsedRecord?.url ?? parsedRecord?.uri ?? parsedRecord?.href);
  const error = resultError(parsedRecord ?? record);

  if (error) return <div className={styles.resultError}>{error}</div>;

  if (url) {
    const title = typeof parsedRecord?.title === 'string' ? parsedRecord.title : url;
    const description =
      typeof parsedRecord?.description === 'string' ? parsedRecord.description : null;
    return (
      <a className={styles.resultItem} href={url} rel="noreferrer" target="_blank">
        <span className={styles.resultItemTitle}>
          <ExternalLink size={14} />
          {title}
        </span>
        <span className={styles.resultItemUrl}>{url}</span>
        {description && <span className={styles.resultItemDescription}>{description}</span>}
      </a>
    );
  }

  if (type === 'unsupported') {
    return <div className={styles.resultNotice}>暂不支持预览此类工具返回内容</div>;
  }

  if (typeof parsed === 'string') return <p className={styles.resultText}>{parsed}</p>;

  return (
    <CodeBlock
      height="280px"
      label={`结果 ${index + 1}`}
      language="json"
      value={formatJson(parsed)}
    />
  );
}

function ResultPreview({ result }: { result: unknown }) {
  const record = asRecord(result);
  const blocks = Array.isArray(record?.content) ? (record.content as unknown[]) : null;
  const error = resultError(result);

  if (error) return <div className={styles.resultError}>{error}</div>;
  if (typeof result === 'string') return <p className={styles.resultText}>{result}</p>;
  if (typeof result === 'number' || typeof result === 'boolean') {
    return <p className={styles.resultText}>{String(result)}</p>;
  }
  if (result === null) return <p className={styles.resultNotice}>工具未返回内容</p>;
  if (blocks?.length) {
    return (
      <div className={styles.resultList}>
        {blocks.map((block, index) => {
          const blockType = asRecord(block)?.type;
          const keyType = typeof blockType === 'string' ? blockType : 'block';
          return <ResultBlock block={block} index={index} key={`${index}-${keyType}`} />;
        })}
      </div>
    );
  }
  if (blocks) return <p className={styles.resultNotice}>工具未返回内容</p>;
  return <ResultBlock block={result} index={0} />;
}

export function ToolCallCard({
  item,
  approvalActive,
  approvalResolving,
  onApproval,
}: {
  item: ToolItem;
  approvalActive: boolean;
  approvalResolving: boolean;
  onApproval: (requestId: string, runId: string, decision: 'approve' | 'edit' | 'reject') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = item.status === 'running' || item.status === 'awaiting_approval';
  const displayName = displayToolName(item.tool);

  const StatusIcon =
    item.status === 'completed'
      ? CheckCircle2
      : item.status === 'failed' || item.status === 'cancelled'
        ? CircleX
        : LoaderCircle;

  return (
    <Collapsible.Root
      className={styles.card}
      open={isActive || expanded}
      onOpenChange={setExpanded}
    >
      <section aria-label={`工具：${item.tool}`}>
        <Collapsible.Trigger className={styles.header}>
          <span className={styles.titleGroup}>
            <span className={styles.toolIcon}>
              <Wrench size={16} />
            </span>
            <span className={styles.title}>
              <strong>{displayName}</strong>
              <small>工具调用</small>
            </span>
          </span>
          <span className={styles.headerRight}>
            <span className={styles.status} data-status={item.status}>
              <StatusIcon size={14} />
              {LABELS[item.status]}
            </span>
            <ChevronDown size={16} />
          </span>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.content}>
          {Object.keys(item.arguments).length > 0 && (
            <section className={styles.section} aria-label="工具请求参数">
              <div className={styles.sectionHeader}>
                <span>
                  <FileJson size={14} /> 请求参数
                </span>
                <small>{Object.keys(item.arguments).length} 项</small>
              </div>
              <dl className={styles.arguments}>
                {Object.entries(item.arguments).map(([key, value]) => (
                  <div className={styles.argument} key={key}>
                    <dt>{key}</dt>
                    <dd>{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className={styles.section} aria-label="工具返回结果">
            <div className={styles.sectionHeader}>
              <span>
                <FileJson size={14} /> 返回结果
              </span>
              {item.status === 'running' && <small>处理中</small>}
            </div>
            {item.result !== null ? (
              <ResultPreview result={item.result} />
            ) : (
              <div className={styles.pending}>等待工具返回结果…</div>
            )}
          </section>
          {item.status === 'awaiting_approval' && item.request_id && item.run_id && (
            <div className={styles.approval} aria-label={`工具审核：${item.tool}`}>
              <strong>
                {approvalResolving
                  ? '正在恢复运行…'
                  : approvalActive
                    ? `工具需要审核：${item.tool}`
                    : `工具审核：${item.tool}`}
              </strong>
              <div className={styles.actions} aria-label="审核操作">
                {(['approve', 'edit', 'reject'] as const).map((decision) => (
                  <button
                    disabled={!approvalActive || approvalResolving}
                    key={decision}
                    onClick={() => onApproval(item.request_id!, item.run_id!, decision)}
                    type="button"
                  >
                    {{ approve: '批准', edit: '编辑', reject: '拒绝' }[decision]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(Object.keys(item.arguments).length > 0 || item.result !== null) && (
            <details className={styles.raw}>
              <summary>查看原始数据</summary>
              <CodeBlock
                height="360px"
                label="原始输入与输出"
                language="json"
                value={formatJson({ arguments: item.arguments, result: item.result })}
              />
            </details>
          )}
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}
