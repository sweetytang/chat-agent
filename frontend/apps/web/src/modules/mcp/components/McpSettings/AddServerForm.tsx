import { AlertCircle } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import type { ServerForm } from './useMcpSettings';
import styles from './index.module.css';

interface AddServerFormProps {
  form: ServerForm;
  setForm: Dispatch<SetStateAction<ServerForm>>;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AddServerForm({ form, setForm, busy, onSubmit }: AddServerFormProps) {
  return (
    <form className={styles.settingsForm} onSubmit={onSubmit}>
      <label>
        名称
        <input
          required
          value={form.name}
          placeholder="例如 GitHub"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label>
        传输方式
        <select
          value={form.transport}
          onChange={(event) =>
            setForm({ ...form, transport: event.target.value as ServerForm['transport'] })
          }
        >
          <option value="STREAMABLE_HTTP">Remote · Streamable HTTP</option>
          <option value="SSE">Remote · SSE（待接入）</option>
          <option value="STDIO">Local · Controlled stdio</option>
        </select>
      </label>
      {form.transport !== 'STDIO' && (
        <label className={styles.fullField}>
          Server 地址
          <input
            required
            type="url"
            value={form.endpoint}
            placeholder="https://example.com/mcp"
            onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
          />
        </label>
      )}
      {form.transport === 'STDIO' && (
        <>
          <label className={styles.fullField}>
            受控命令（管理员预装清单）
            <input
              required
              value={form.command}
              placeholder="例如 tat-mcp"
              onChange={(event) => setForm({ ...form, command: event.target.value })}
            />
          </label>
          <label>
            参数（JSON 数组）
            <input
              value={form.args}
              placeholder='["--config", "mcp.json"]'
              onChange={(event) => setForm({ ...form, args: event.target.value })}
            />
          </label>
          <label>
            环境变量（JSON 对象）
            <input
              value={form.env}
              placeholder='{"KEY":"value"}'
              onChange={(event) => setForm({ ...form, env: event.target.value })}
            />
          </label>
        </>
      )}
      <label className={styles.fullField}>
        自定义 Headers（JSON，可选）
        <textarea
          className={styles.inlineJson}
          value={form.headers}
          placeholder={'{\n  "X-Workspace": "demo"\n}'}
          onChange={(event) => setForm({ ...form, headers: event.target.value })}
        />
      </label>
      <label className={styles.fullField}>
        Bearer Token（可选）
        <input
          type="password"
          autoComplete="off"
          value={form.bearerToken}
          placeholder="将被加密保存"
          onChange={(event) => setForm({ ...form, bearerToken: event.target.value })}
        />
      </label>
      <div className={styles.localHint}>
        <AlertCircle size={16} />
        <span>
          {form.transport === 'STDIO'
            ? 'stdio 仅允许管理员预装的受控服务；当前部署未开放命令、镜像或挂载配置。'
            : form.transport === 'SSE'
              ? 'SSE 配置已保留，但当前 MCP Host 尚未接入 SSE。'
              : '远程 MCP 使用 HTTPS 地址；凭据将加密保存且不会回显。'}
        </span>
      </div>
      <button className={styles.primaryButton} disabled={busy} type="submit">
        {busy ? '正在添加…' : '添加 Server'}
      </button>
    </form>
  );
}
