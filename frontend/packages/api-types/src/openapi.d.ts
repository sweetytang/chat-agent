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
    patch: operations["update_profile_api_auth_me_patch"];
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
  "/api/threads/{thread_id}/timeline": {
    get: operations["get_thread_timeline_api_threads__thread_id__timeline_get"];
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
    get: operations["list_checkpoints_api_threads__thread_id__checkpoints_get"];
  };
  "/api/threads/{thread_id}/checkpoints/{checkpoint_id}/switch": {
    post: operations["switch_checkpoint_api_threads__thread_id__checkpoints__checkpoint_id__switch_post"];
  };
  "/api/mcp/servers": {
    get: operations["list_user_mcp_servers_api_mcp_servers_get"];
    post: operations["create_user_mcp_server_api_mcp_servers_post"];
  };
  "/api/mcp/servers/{server_id}/tools": {
    get: operations["list_server_live_tools_api_mcp_servers__server_id__tools_get"];
  };
  "/api/mcp/servers/{server_id}": {
    patch: operations["update_user_mcp_server_api_mcp_servers__server_id__patch"];
    delete: operations["delete_user_mcp_server_api_mcp_servers__server_id__delete"];
  };
  "/api/mcp/config": {
    put: operations["sync_mcp_json_config_api_mcp_config_put"];
  };
  "/api/skills": {
    get: operations["list_skills_api_skills_get"];
    post: operations["create_skill_api_skills_post"];
  };
  "/api/skills/import": {
    post: operations["import_skill_file_api_skills_import_post"];
  };
  "/api/skills/{skill_id}": {
    get: operations["get_skill_api_skills__skill_id__get"];
    patch: operations["patch_skill_api_skills__skill_id__patch"];
    delete: operations["remove_skill_api_skills__skill_id__delete"];
  };
}

export interface components {
  schemas: {
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
    ErrorItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      message: string;
      status: string;
    };
    GenerativeUiItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      value: unknown;
      status: "streaming" | "completed" | "failed" | "cancelled";
    };
    HTTPValidationError: {
      detail?: Array<components["schemas"]["ValidationError"]>;
    };
    LoginRequest: {
      email: string;
      password: string;
    };
    McpConfigSyncRequest: {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    MessageItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      logical_message_id: string;
      role: "user" | "assistant";
      content: string;
      status: "streaming" | "completed" | "failed" | "cancelled";
      terminal_segment: boolean;
    };
    PendingInterruptResponse: {
      request_id: string;
      run_id: string;
      kind: string;
      tool: string | null;
      payload: Record<string, unknown>;
    };
    ReasoningItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      content: string;
      status: "streaming" | "completed" | "failed" | "cancelled";
    };
    RefreshRequest: {
      refresh_token: string;
    };
    RegisterRequest: {
      email: string;
      password: string;
      name?: string | null;
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
      model?: string | null;
      skill_id?: string | null;
      skill_ids?: Array<string>;
    };
    SkillCreate: {
      name: string;
      description: string;
      content: string;
      enabled?: boolean;
    };
    SkillImportRequest: {
      raw_content: string;
      name?: string | null;
      description?: string | null;
      enabled?: boolean;
    };
    SkillResponse: {
      name: string;
      description: string;
      content: string;
      enabled?: boolean;
      id: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    };
    SkillUpdate: {
      name?: string | null;
      description?: string | null;
      content?: string | null;
      enabled?: boolean | null;
    };
    StructuredOutputItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      value: unknown;
      status: "streaming" | "completed" | "failed" | "cancelled";
    };
    ThreadResponse: {
      id: string;
      title: string | null;
      is_pinned: boolean;
      current_checkpoint_id: string | null;
    };
    ThreadTimelineResponse: {
      thread_id: string;
      current_checkpoint_id: string | null;
      timeline: components["schemas"]["TimelineSnapshotResponse"];
    };
    TimelineSnapshotResponse: {
      version: number;
      items?: Array<components["schemas"]["MessageItemResponse"] | components["schemas"]["ReasoningItemResponse"] | components["schemas"]["ToolItemResponse"] | components["schemas"]["StructuredOutputItemResponse"] | components["schemas"]["GenerativeUiItemResponse"] | components["schemas"]["ErrorItemResponse"]>;
    };
    ToolItemResponse: {
      id: string;
      kind: string;
      run_id: string | null;
      sequence: number;
      checkpoint_id?: string | null;
      parent_checkpoint_id?: string | null;
      branch_options?: Array<components["schemas"]["BranchOptionResponse"]>;
      branch_index?: number | null;
      tool: string;
      arguments?: Record<string, unknown>;
      request_id?: string | null;
      result?: unknown;
      status: "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
    };
    UpdateProfileRequest: {
      name: string;
    };
    UpdateThreadRequest: {
      title?: string | null;
      is_pinned?: boolean | null;
    };
    UserMcpServerCreate: {
      name: string;
      transport?: string;
      endpoint?: string | null;
      command?: string | null;
      args?: Array<string>;
      process_env?: Record<string, string>;
      request_headers?: Record<string, string>;
      enabled?: boolean;
      tool_rules?: Record<string, unknown>;
    };
    UserMcpServerResponse: {
      id: string;
      name: string;
      transport: string;
      endpoint?: string | null;
      command?: string | null;
      args?: Array<string>;
      process_env?: Record<string, string>;
      request_headers?: Record<string, string>;
      enabled: boolean;
      tool_rules?: Record<string, unknown>;
      last_error?: string | null;
    };
    UserMcpServerUpdate: {
      name?: string | null;
      transport?: string | null;
      endpoint?: string | null;
      command?: string | null;
      args?: Array<string> | null;
      process_env?: Record<string, string> | null;
      request_headers?: Record<string, string> | null;
      enabled?: boolean | null;
      tool_rules?: Record<string, unknown> | null;
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
        "application/json": components["schemas"]["RegisterRequest"];
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
        "application/json": components["schemas"]["LoginRequest"];
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
        content: { "application/json": Record<string, unknown> };
      };
    };
  };
  update_profile_api_auth_me_patch: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["UpdateProfileRequest"];
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
  get_thread_timeline_api_threads__thread_id__timeline_get: {
    parameters: {
      path: {
        thread_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["ThreadTimelineResponse"] };
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
  list_user_mcp_servers_api_mcp_servers_get: {
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["UserMcpServerResponse"]> };
      };
    };
  };
  create_user_mcp_server_api_mcp_servers_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["UserMcpServerCreate"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["UserMcpServerResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_server_live_tools_api_mcp_servers__server_id__tools_get: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": Array<Record<string, unknown>> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  update_user_mcp_server_api_mcp_servers__server_id__patch: {
    parameters: {
      path: {
        server_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UserMcpServerUpdate"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["UserMcpServerResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  delete_user_mcp_server_api_mcp_servers__server_id__delete: {
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
  sync_mcp_json_config_api_mcp_config_put: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["McpConfigSyncRequest"];
      };
    };
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["UserMcpServerResponse"]> };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  list_skills_api_skills_get: {
    responses: {
      200: {
        content: { "application/json": Array<components["schemas"]["SkillResponse"]> };
      };
    };
  };
  create_skill_api_skills_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["SkillCreate"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["SkillResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  import_skill_file_api_skills_import_post: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["SkillImportRequest"];
      };
    };
    responses: {
      201: {
        content: { "application/json": components["schemas"]["SkillResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  get_skill_api_skills__skill_id__get: {
    parameters: {
      path: {
        skill_id: string;
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["SkillResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  patch_skill_api_skills__skill_id__patch: {
    parameters: {
      path: {
        skill_id: string;
      };
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SkillUpdate"];
      };
    };
    responses: {
      200: {
        content: { "application/json": components["schemas"]["SkillResponse"] };
      };
      422: {
        content: { "application/json": components["schemas"]["HTTPValidationError"] };
      };
    };
  };
  remove_skill_api_skills__skill_id__delete: {
    parameters: {
      path: {
        skill_id: string;
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
}
