export interface McpToolRule {
  enabled?: boolean;
  require_approval?: boolean;
}

export interface LiveMcpTool {
  name: string;
  description: string;
  enabled: boolean;
  require_approval: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  transport: 'sse' | 'streamable_http' | 'stdio' | string;
  endpoint?: string | null;
  command?: string | null;
  args?: string[];
  process_env?: Record<string, string>;
  request_headers?: Record<string, string>;
  enabled: boolean;
  tool_rules?: {
    tools?: Record<string, McpToolRule>;
  };
  last_error?: string | null;
}
