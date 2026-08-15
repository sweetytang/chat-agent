import { useUiStore } from '@/app/store/ui';
import { Chat } from '@/modules/chat/components/Chat';
import { McpSettings } from '@/modules/mcp/components/McpSettings';

export function App() {
  const mcpSettingsOpen = useUiStore((state) => state.mcpSettingsOpen);
  return (
    <>
      <Chat />
      {mcpSettingsOpen && <McpSettings />}
    </>
  );
}
