import { useCallback, useEffect, useState } from 'react';

import { listMcpServers, syncMcpConfig } from '@/modules/mcp/services/mcpApi';
import type { McpServer } from '@/modules/mcp/types';
import { parseMcpServersJson, serializeMcpServers } from '@/modules/mcp/domain/config';

export function useMcpSettings(enabled = true) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [jsonConfig, setJsonConfig] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await listMcpServers();
      setServers(items);
      setJsonConfig(serializeMcpServers(items));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void loadData();
  }, [enabled, loadData]);

  const saveConfig = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const mcpServers = parseMcpServersJson(jsonConfig);
      const updated = await syncMcpConfig(mcpServers);
      setServers(updated);
      setJsonConfig(serializeMcpServers(updated));
      setNotice('MCP 配置已成功保存并同步');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请检查 JSON 格式与安全约束');
    } finally {
      setSaving(false);
    }
  };

  return {
    servers,
    setServers,
    jsonConfig,
    setJsonConfig,
    loading,
    saving,
    error,
    notice,
    saveConfig,
    refresh: loadData,
  };
}
