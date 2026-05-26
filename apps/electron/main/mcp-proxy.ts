import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Store from 'electron-store';
import type { LogFn } from './logger.js';

export type McpProxyState = {
  enabled: boolean;
  running: boolean;
  endpoint: string;
  error: string | null;
};

type McpProxyStore = {
  enabled?: boolean;
  enabledByUserId?: Record<string, boolean>;
};

type CreateMcpProxyManagerOptions = {
  log: LogFn;
  logWarn: LogFn;
  logError: LogFn;
};

type ChildMessage =
  | {
      type: 'ready';
      endpoint: string;
    }
  | {
      type: 'error';
      error: string;
    };

const DEFAULT_MCP_PROXY_HOST = '127.0.0.1';
const DEFAULT_MCP_PROXY_PORT = 3318;
const START_TIMEOUT_MS = 5000;

function parsePort(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_MCP_PROXY_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DORY_MCP_PORT: ${value}`);
  }
  return port;
}

function getProxyEndpoint() {
  return `http://${DEFAULT_MCP_PROXY_HOST}:${parsePort(process.env.DORY_MCP_PORT)}/api/mcp`;
}

function getChildPath() {
  return fileURLToPath(new URL('./mcp-proxy-child.js', import.meta.url));
}

export function createMcpProxyManager({ log, logWarn, logError }: CreateMcpProxyManagerOptions) {
  const mcpProxyStore = new Store<McpProxyStore>({
    name: 'mcp-proxy',
    defaults: {
      enabledByUserId: {},
    },
  });
  let childProc: ChildProcess | null = null;
  let activeUserId: string | null = null;
  let lastError: string | null = null;

  function readEnabledByUserId() {
    return mcpProxyStore.get('enabledByUserId') ?? {};
  }

  function isEnabledForUser(userId?: string | null) {
    if (!userId) return false;
    return readEnabledByUserId()[userId] === true;
  }

  function setEnabledForUser(userId: string, enabled: boolean) {
    const enabledByUserId = { ...readEnabledByUserId() };
    if (enabled) {
      enabledByUserId[userId] = true;
    } else {
      delete enabledByUserId[userId];
    }
    mcpProxyStore.set('enabledByUserId', enabledByUserId);
    mcpProxyStore.delete('enabled');
  }

  function isRunning() {
    return Boolean(childProc && !childProc.killed && childProc.exitCode === null);
  }

  function isRunningForUser(userId?: string | null) {
    if (!isRunning()) return false;
    return !userId || activeUserId === userId;
  }

  async function stopRunningProxy() {
    const proc = childProc;
    if (!proc || proc.killed || proc.exitCode !== null) {
      childProc = null;
      activeUserId = null;
      return;
    }

    log('[electron] stopping MCP proxy...');
    proc.kill();
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 1000);
      const cleanup = () => {
        clearTimeout(timeout);
        proc.off('exit', cleanup);
        proc.off('error', cleanup);
        resolve();
      };
      proc.once('exit', cleanup);
      proc.once('error', cleanup);
    });

    if (childProc === proc) {
      childProc = null;
      activeUserId = null;
    }
  }

  function getState(userId?: string | null): McpProxyState {
    return {
      enabled: isEnabledForUser(userId),
      running: isRunningForUser(userId),
      endpoint: getProxyEndpoint(),
      error: lastError,
    };
  }

  async function stop(options: { persist?: boolean; userId?: string | null } = {}): Promise<McpProxyState> {
    const targetUserId = options.userId ?? null;
    const shouldStopRunningProxy = !targetUserId || activeUserId === targetUserId;

    if (options.persist !== false && targetUserId) {
      setEnabledForUser(targetUserId, false);
    }

    if (shouldStopRunningProxy) {
      await stopRunningProxy();
      lastError = null;
    }
    return getState(targetUserId);
  }

  async function start(targetUrl: string, desktopGrant: string, userId: string, options: { persist?: boolean } = {}): Promise<McpProxyState> {
    if (!userId.trim()) {
      throw new Error('MCP user id is required.');
    }
    if (!desktopGrant.trim()) {
      throw new Error('MCP desktop grant is required.');
    }

    if (options.persist !== false) {
      setEnabledForUser(userId, true);
    }

    if (isRunningForUser(userId)) {
      return getState(userId);
    }

    if (isRunning()) {
      await stop({ persist: false });
    }

    lastError = null;
    activeUserId = userId;
    const port = parsePort(process.env.DORY_MCP_PORT);
    const childPath = getChildPath();
    log('[electron] starting MCP proxy:', {
      childPath,
      endpoint: getProxyEndpoint(),
      targetUrl,
    });

    childProc = fork(childPath, [], {
      env: {
        ...process.env,
        DORY_MCP_PROXY_HOST: DEFAULT_MCP_PROXY_HOST,
        DORY_MCP_PROXY_PORT: String(port),
        DORY_MCP_PROXY_TARGET_URL: targetUrl,
        DORY_MCP_DESKTOP_GRANT: desktopGrant,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    childProc.stdout?.on('data', buf => log('[mcp-proxy stdout]', String(buf).trimEnd()));
    childProc.stderr?.on('data', buf => logWarn('[mcp-proxy stderr]', String(buf).trimEnd()));
    const proc = childProc;
    childProc.on('exit', (code, signal) => {
      logWarn('[electron] MCP proxy exited:', code, signal);
      if (childProc === proc) {
        childProc = null;
        activeUserId = null;
      }
    });
    childProc.on('error', error => {
      lastError = error.message;
      logError('[electron] MCP proxy process error:', error);
    });

    await new Promise<void>((resolve, reject) => {
      const proc = childProc;
      if (!proc) {
        reject(new Error('MCP proxy process was not created.'));
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('MCP proxy startup timed out.'));
      }, START_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        proc.off('message', onMessage);
        proc.off('exit', onExit);
        proc.off('error', onError);
      };

      const onMessage = (message: ChildMessage) => {
        if (message?.type === 'ready') {
          cleanup();
          resolve();
          return;
        }
        if (message?.type === 'error') {
          cleanup();
          reject(new Error(message.error));
        }
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(new Error(`MCP proxy exited before ready: code=${String(code)} signal=${String(signal)}`));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      proc.on('message', onMessage);
      proc.once('exit', onExit);
      proc.once('error', onError);
    }).catch(error => {
      lastError = error instanceof Error ? error.message : String(error);
      logError('[electron] MCP proxy startup failed:', error);
      if (childProc && !childProc.killed) {
        childProc.kill();
      }
      childProc = null;
      activeUserId = null;
      throw error;
    });

    return getState(userId);
  }

  return {
    getState,
    start,
    stop,
    stopActive: () => stop({ persist: false }),
    isEnabled: isEnabledForUser,
  };
}
