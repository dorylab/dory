declare module '*.css';

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
declare module '*.worker.js?url' {
  const url: string;
  export default url;
}

declare module 'ssh2';
declare module 'ssh2-no-cpu-features';

type AuthBridge = {
  openExternal: (url: string) => Promise<void>;
  onCallback: (callback: (url: string) => void) => () => void;
};

type UpdateBridgeState = {
  readyToInstall: boolean;
  version: string | null;
};

type McpBridgeState = {
  enabled: boolean;
  running: boolean;
  endpoint: string;
  error: string | null;
};

interface Window {
  authBridge?: AuthBridge;
  localeBridge?: {
    getLocale: () => Promise<'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES'>;
    setLocale: (locale: 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES') => Promise<'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES'>;
    onLocaleChanged: (callback: (locale: 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES') => void) => () => void;
  };
  themeBridge?: {
    getTheme: () => Promise<'light' | 'dark' | 'system'>;
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<'light' | 'dark' | 'system'>;
    onThemeChanged: (callback: (theme: 'light' | 'dark' | 'system') => void) => () => void;
  };
  updateBridge?: {
    getState: () => Promise<UpdateBridgeState>;
    restartAndInstall: () => Promise<boolean>;
    onStateChanged: (callback: (state: UpdateBridgeState) => void) => () => void;
  };
  mcpBridge?: {
    getState: () => Promise<McpBridgeState>;
    start: (desktopGrant: string) => Promise<McpBridgeState>;
    stop: () => Promise<McpBridgeState>;
  };
  logBridge?: {
    log: (level: 'info' | 'warn' | 'error', ...args: unknown[]) => void;
  };
  electron?: {
    platform: string;
    isPackaged: boolean;
    selectSqliteFile?: () => Promise<string | null>;
    selectLocalFile?: () => Promise<string | null>;
  };
}
