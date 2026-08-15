import * as Dialog from '@radix-ui/react-dialog';
import { Server } from 'lucide-react';

import { useUiStore } from '@/app/store/ui';

import { AddServerPanel } from './AddServerPanel';
import styles from './index.module.css';
import { ServerDetails } from './ServerDetails';
import { ServerList } from './ServerList';
import { StatusFooter } from './StatusFooter';
import { TopBar } from './TopBar';
import { useMcpSettings } from '../../hooks/useMcpSettings';

export function McpSettings() {
  const open = useUiStore((state) => state.mcpSettingsOpen);
  const setOpen = useUiStore((state) => state.setMcpSettingsOpen);
  const settings = useMcpSettings(open);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Description className={styles.visuallyHidden}>
            连接外部工具，并精确控制向模型暴露的能力
          </Dialog.Description>
          <TopBar />
          <div className={styles.workspace}>
            <ServerList
              servers={settings.servers}
              selectedId={settings.selectedId}
              query={settings.query}
              loading={settings.loading}
              onQueryChange={settings.setQuery}
              onSelect={settings.selectServer}
              onAdd={settings.startAdd}
            />
            <main className={styles.detail}>
              {settings.showAdd ? (
                <AddServerPanel
                  servers={settings.servers}
                  editorMode={settings.editorMode}
                  setEditorMode={settings.setEditorMode}
                  form={settings.form}
                  setForm={settings.setForm}
                  jsonConfig={settings.jsonConfig}
                  setJsonConfig={settings.setJsonConfig}
                  jsonValidation={settings.jsonValidation}
                  busy={settings.busy}
                  onBack={() => settings.setShowAdd(false)}
                  onCreate={(event) => void settings.createServer(event)}
                  onImport={() => void settings.importJson()}
                  onError={settings.setError}
                />
              ) : settings.selected ? (
                <ServerDetails
                  selected={settings.selected}
                  detailTab={settings.detailTab}
                  setDetailTab={settings.setDetailTab}
                  form={settings.form}
                  setForm={settings.setForm}
                  toolQuery={settings.toolQuery}
                  setToolQuery={settings.setToolQuery}
                  filteredTools={settings.filteredTools}
                  busy={settings.busy}
                  onToggleServer={(server) => void settings.toggleServer(server)}
                  onToggleTool={(tool) => void settings.toggleTool(tool)}
                  onSetAllTools={(enabled) => void settings.setAllTools(enabled)}
                  onTestConnection={() => void settings.testConnection()}
                  onRemove={() => void settings.removeSelected()}
                  onSave={(event) => void settings.saveSettings(event)}
                />
              ) : (
                <div className={styles.emptyDetail}>
                  <Server size={30} />
                  <strong>选择一个 MCP Server</strong>
                  <p>查看连接状态、配置与工具暴露范围。</p>
                </div>
              )}
            </main>
          </div>
          <StatusFooter
            error={settings.error}
            notice={settings.notice}
            exposedTools={settings.exposedTools}
            onDismiss={() => {
              settings.setError(null);
              settings.setNotice(null);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
