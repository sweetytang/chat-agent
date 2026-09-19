/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OPEN_AGENT_API_ROOT?: string;
  readonly OPEN_AGENT_API_URL?: string;
  readonly OPEN_AGENT_API_KEY?: string;
  readonly VITE_API_ROOT?: string;
  readonly VITE_API_URL?: string;
  readonly LUI_AGENT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
