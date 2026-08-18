import { ArrowLeft, FileJson, SlidersHorizontal } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import { serializeMcpServers } from '@/modules/mcp/domain/config';
import type { McpServer } from '@/modules/mcp/types';

import { AddServerForm } from './AddServerForm';
import styles from './index.module.css';
import { JsonEditor } from './JsonEditor';
import type { EditorMode, ServerForm } from '@/modules/mcp/hooks/useMcpSettings';

const EMPTY_JSON_CONFIG = `{
  "mcpServers": {}
}`;
const JSON_TEMPLATE = `{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}`;

interface AddServerPanelProps {
  servers: McpServer[];
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  form: ServerForm;
  setForm: Dispatch<SetStateAction<ServerForm>>;
  jsonConfig: string;
  setJsonConfig: (value: string) => void;
  jsonValidation: { valid: boolean; label: string; detail: string };
  busy: boolean;
  onBack: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onImport: () => void;
  onError: (message: string) => void;
}

export function AddServerPanel({
  servers,
  editorMode,
  setEditorMode,
  form,
  setForm,
  jsonConfig,
  setJsonConfig,
  jsonValidation,
  busy,
  onBack,
  onCreate,
  onImport,
  onError,
}: AddServerPanelProps) {
  const source = jsonConfig || (servers.length ? serializeMcpServers(servers) : EMPTY_JSON_CONFIG);

  return (
    <section className={styles.addPanel}>
      <div className={styles.detailHeading}>
        <button className={styles.backButton} type="button" onClick={onBack}>
          <ArrowLeft size={16} /> 返回
        </button>
        <div>
          <h2>添加 MCP Server</h2>
          <p>配置远程 HTTP Server，或导入已有 mcp.json。</p>
        </div>
      </div>
      <div className={styles.modeSwitch}>
        <button
          className={editorMode === 'form' ? styles.modeActive : ''}
          type="button"
          onClick={() => setEditorMode('form')}
        >
          <SlidersHorizontal size={15} />
          可视化配置
        </button>
        <button
          className={editorMode === 'json' ? styles.modeActive : ''}
          type="button"
          onClick={() => setEditorMode('json')}
        >
          <FileJson size={15} />
          原始 JSON
        </button>
      </div>
      {editorMode === 'form' ? (
        <AddServerForm form={form} setForm={setForm} busy={busy} onSubmit={onCreate} />
      ) : (
        <JsonEditor
          source={source}
          value={jsonConfig}
          validation={jsonValidation}
          busy={busy}
          onChange={setJsonConfig}
          onImport={onImport}
          onError={onError}
          placeholder={JSON_TEMPLATE}
        />
      )}
    </section>
  );
}
