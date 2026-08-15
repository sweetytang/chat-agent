/**
 * 由 backend FastAPI OpenAPI schema 生成。
 * 请运行 make generate-api-types 刷新，不要手工修改。
 */

export interface paths {
  "/health": {
    get: operations["health_check_health_get"];
  };
  "/api/runs/stream": {
    post: operations["stream_run_api_runs_stream_post"];
  };
  "/api/runs/{run_id}/cancel": {
    post: operations["cancel_run_api_runs__run_id__cancel_post"];
  };
  "/api/runs/{run_id}/resume": {
    post: operations["resume_run_api_runs__run_id__resume_post"];
  };
  "/api/auth/register": {
    post: operations["register_api_auth_register_post"];
  };
  "/api/auth/token": {
    post: operations["login_api_auth_token_post"];
  };
  "/api/auth/me": {
    get: operations["me_api_auth_me_get"];
  };
  "/api/auth/refresh": {
    post: operations["refresh_api_auth_refresh_post"];
  };
  "/api/auth/logout": {
    post: operations["logout_api_auth_logout_post"];
  };
  "/api/threads": {
    get: operations["list_threads_api_threads_get"];
    post: operations["create_thread_api_threads_post"];
  };
  "/api/threads/{thread_id}": {
    get: operations["get_thread_api_threads__thread_id__get"];
    patch: operations["update_thread_api_threads__thread_id__patch"];
    delete: operations["delete_thread_api_threads__thread_id__delete"];
  };
  "/api/threads/{thread_id}/messages": {
    get: operations["list_messages_api_threads__thread_id__messages_get"];
  };
  "/api/threads/{thread_id}/history": {
    get: operations["get_thread_history_api_threads__thread_id__history_get"];
  };
  "/api/interrupts": {
    post: operations["create_interrupt_api_interrupts_post"];
  };
  "/api/interrupts/{request_id}/resolve": {
    post: operations["resolve_interrupt_api_interrupts__request_id__resolve_post"];
  };
  "/api/interrupts/{request_id}/resume": {
    post: operations["resume_interrupt_api_interrupts__request_id__resume_post"];
  };
  "/api/threads/{thread_id}/interrupts/pending": {
    get: operations["get_pending_interrupt_api_threads__thread_id__interrupts_pending_get"];
  };
  "/api/threads/{thread_id}/checkpoints": {
    post: operations["create_checkpoint_api_threads__thread_id__checkpoints_post"];
    get: operations["list_checkpoints_api_threads__thread_id__checkpoints_get"];
  };
  "/api/threads/{thread_id}/checkpoints/{checkpoint_id}/switch": {
    post: operations["switch_checkpoint_api_threads__thread_id__checkpoints__checkpoint_id__switch_post"];
  };
  "/api/mcp/stdio/definitions": {
    get: operations["list_stdio_definitions_api_mcp_stdio_definitions_get"];
  };
  "/api/mcp/servers": {
    get: operations["list_servers_api_mcp_servers_get"];
    post: operations["create_server_api_mcp_servers_post"];
  };
  "/api/mcp/servers/{server_id}": {
    patch: operations["update_server_api_mcp_servers__server_id__patch"];
    delete: operations["delete_server_api_mcp_servers__server_id__delete"];
  };
  "/api/mcp/admin/servers": {
    get: operations["list_admin_servers_api_mcp_admin_servers_get"];
  };
  "/api/mcp/servers/{server_id}/tools": {
    get: operations["list_server_tools_api_mcp_servers__server_id__tools_get"];
  };
  "/api/mcp/servers/{server_id}/enabled": {
    post: operations["set_server_enabled_api_mcp_servers__server_id__enabled_post"];
  };
  "/api/mcp/servers/{server_id}/refresh": {
    post: operations["refresh_server_api_mcp_servers__server_id__refresh_post"];
  };
  "/api/mcp/tools/{tool_id}/enabled": {
    post: operations["set_tool_enabled_api_mcp_tools__tool_id__enabled_post"];
  };
}

export interface components {
  schemas: {
    AuthRequest: {
      email: string;
      password: string;
    };
    AuthResponse: {
      access_token: string;
      token_type?: string;
      refresh_token: string;
    };
    BranchOptionResponse: {
      checkpoint_id: string;
    };
    CheckpointResponse: {
      id: string;
      thread_id: string;
      parent_id: string | null;
      state: Record<string, unknown>;
      branch_name: string | null;
    };
    CreateCheckpointRequest: {
      state?: Record<string, unknown>;
      parent_id?: string | null;
      branch_name?: string | null;
    };
    CreateInterruptRequest: {
      run_id: string;
      request_id: string;
      kind: string;
      payload?: Record<string, unknown>;
      checkpoint_id?: string | null;
    };
    CreateThreadRequest: {
      title?: string | null;
    };
    HTTPValidationError: {
      detail?: Array<components["schemas"]["ValidationError"]>;
    };
    HistoryMessageResponse: {
      id: string;
      role: string;
      content: string;
      checkpoint_id: string | null;
      parent_checkpoint_id: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
    };
    McpScope: "PRIVATE" | "SHARED";
    McpServerCreate: {
      name: string;
      scope?: components["schemas"]["McpScope"];
      transport?: components["schemas"]["McpTransport"];
      endpoint?: string | null;
      headers?: Record<string, string>;
      bearer_token?: string | null;
      command?: string | null;
      args?: Array<string>;
      env?: Record<string, string>;
    };
    McpServerResponse: {
      id: string;
      name: string;
      scope: components["schemas"]["McpScope"];
      transport: components["schemas"]["McpTransport"];
      endpoint: string | null;
      status: string;
      enabled?: boolean;
      last_error?: string | null;
      credential_configured: boolean;
      security_version: number;
      command?: string | null;
      args?: Array<string>;
      env?: Record<string, string>;
    };
    McpServerUpdate: {
      name?: string | null;
      transport?: components["schemas"]["McpTransport"] | null;
      endpoint?: string | null;
      headers?: Record<string, string> | null;
      bearer_token?: string | null;
      command?: string | null;
      args?: Array<string> | null;
      env?: Record<string, string> | null;
    };
    McpToolResponse: {
      id: string;
      remote_name: string;
      internal_name: string;
      description: string | null;
      compatibility: string;
      is_present: boolean;
      enabled?: boolean;
    };
    McpTransport: "STREAMABLE_HTTP" | "STDIO";
    MessageResponse: {
      id: string;
      thread_id: string;
      run_id: string | null;
      checkpoint_id: string | null;
      role: string;
      content: Record<string, unknown>;
    };
    PendingInterruptResponse: {
      request_id: string;
      run_id: string;
      kind: string;
      tool: string | null;
      payload: Record<string, unknown>;
    };
    RefreshRequest: {
      refresh_token: string;
    };
    ResolveInterruptRequest: {
      decision: string;
      payload?: Record<string, unknown> | null;
    };
    ResumeRequest: {
      request_id: string;
      decision: string;
      payload?: Record<string, unknown> | null;
    };
    RunRequest: {
      thread_id: string;
      content: string;
      checkpoint_id?: string | null;
      mode?: string;
    };
    ThreadHistoryResponse: {
      thread_id: string;
      current_checkpoint_id: string | null;
      messages?: Array<components["schemas"]["HistoryMessageResponse"]>;
    };
    ThreadResponse: {
      id: string;
      title: string | null;
      is_pinned: boolean;
      current_checkpoint_id: string | null;
    };
    TogglePayload: {
      enabled: boolean;
    };
    UpdateThreadRequest: {
      title?: string | null;
      is_pinned?: boolean | null;
    };
    ValidationError: {
      loc: Array<string | number>;
      msg: string;
      type: string;
    };
  };
}

export interface operations {
  health_check_health_get: {
    responses: {
      200: {
        content: { "application/json": Record<string, string> };
      };
    };
  };
  stream_run_api_runs_stream_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["RunRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": unknown };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  cancel_run_api_runs__run_id__cancel_post: {
    parameters: {
      path: {
        run_id: string;
      };
    };
    responses: {
      202: {
        content: { "application/json": Record<string, string> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  resume_run_api_runs__run_id__resume_post: {
    parameters: {
      path: {
        run_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ResumeRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": unknown };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  register_api_auth_register_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["AuthRequest"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["AuthResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  login_api_auth_token_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["AuthRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["AuthResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  me_api_auth_me_get: {
    responses: {
      200: {
        content: { "application/json": Record<string, string> };
      };
    };
  };
  refresh_api_auth_refresh_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["RefreshRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["AuthResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  logout_api_auth_logout_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["RefreshRequest"];
      };
    };
    responses: {
      204: {
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_threads_api_threads_get: {
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["ThreadResponse"]> };
      };
    };
  };
  create_thread_api_threads_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateThreadRequest"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["ThreadResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  get_thread_api_threads__thread_id__get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["ThreadResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  update_thread_api_threads__thread_id__patch: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UpdateThreadRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["ThreadResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  delete_thread_api_threads__thread_id__delete: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      204: {
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_messages_api_threads__thread_id__messages_get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["MessageResponse"]> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  get_thread_history_api_threads__thread_id__history_get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["ThreadHistoryResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  create_interrupt_api_interrupts_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateInterruptRequest"];
      };
    };
    responses: {
      201: {
        content: { "application/json": Record<string, unknown> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  resolve_interrupt_api_interrupts__request_id__resolve_post: {
    parameters: {
      path: {
        request_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ResolveInterruptRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": Record<string, unknown> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  resume_interrupt_api_interrupts__request_id__resume_post: {
    parameters: {
      path: {
        request_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": Record<string, unknown> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  get_pending_interrupt_api_threads__thread_id__interrupts_pending_get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["PendingInterruptResponse"] | null };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  create_checkpoint_api_threads__thread_id__checkpoints_post: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateCheckpointRequest"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["CheckpointResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_checkpoints_api_threads__thread_id__checkpoints_get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["CheckpointResponse"]> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  switch_checkpoint_api_threads__thread_id__checkpoints__checkpoint_id__switch_post: {
    parameters: {
      path: {
        thread_id: string;
      };
      path: {
        checkpoint_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["CheckpointResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_stdio_definitions_api_mcp_stdio_definitions_get: {
    responses: {
      200: {
        content: { "application/json": Array<Record<string, string>> };
      };
    };
  };
  list_servers_api_mcp_servers_get: {
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["McpServerResponse"]> };
      };
    };
  };
  create_server_api_mcp_servers_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["McpServerCreate"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["McpServerResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  update_server_api_mcp_servers__server_id__patch: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["McpServerUpdate"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["McpServerResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  delete_server_api_mcp_servers__server_id__delete: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    responses: {
      204: {
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_admin_servers_api_mcp_admin_servers_get: {
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["McpServerResponse"]> };
      };
    };
  };
  list_server_tools_api_mcp_servers__server_id__tools_get: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["McpToolResponse"]> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  set_server_enabled_api_mcp_servers__server_id__enabled_post: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["TogglePayload"];
      };
    };
    responses: {
      200: {
        content: { "application/json": Record<string, boolean> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  refresh_server_api_mcp_servers__server_id__refresh_post: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["McpServerResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  set_tool_enabled_api_mcp_tools__tool_id__enabled_post: {
    parameters: {
      path: {
        tool_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["TogglePayload"];
      };
    };
    responses: {
      200: {
        content: { "application/json": Record<string, boolean> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
}
