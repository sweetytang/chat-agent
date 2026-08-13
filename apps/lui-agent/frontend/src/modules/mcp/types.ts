export interface McpTool {
  id: string;
  remote_name: string;
  internal_name: string;
  description?: string | null;
  compatibility: string;
  is_present: boolean;
  enabled: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  scope: 'PRIVATE' | 'SHARED';
  transport: 'STREAMABLE_HTTP' | 'STDIO';
  endpoint?: string | null;
  status: string;
  credential_configured: boolean;
  security_version: number;
  tools?: McpTool[];
}
