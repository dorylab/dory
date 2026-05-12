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
  enabled: boolean;
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
      enabled: false,
    },
  });
  let childProc: ChildProcess | null = null;
  let lastError: string | null = null;

  function getState(): McpProxyState {
    return {
      enabled: mcpProxyStore.get('enabled') === true,
      running: Boolean(childProc && !childProc.killed && childProc.exitCode === null),
      endpoint: getProxyEndpoint(),
      error: lastError,
    };
  }

  function stop(options: { persist?: boolean } = {}): McpProxyState {
    if (options.persist !== false) {
      mcpProxyStore.set('enabled', false);
    }

    if (childProc && !childProc.killed) {
      log('[electron] stopping MCP proxy...');
      childProc.kill();
    }
    childProc = null;
    lastError = null;
    return getState();
  }

  async function start(targetUrl: string, options: { persist?: boolean } = {}): Promise<McpProxyState> {
    if (options.persist !== false) {
      mcpProxyStore.set('enabled', true);
    }

    if (childProc && !childProc.killed && childProc.exitCode === null) {
      return getState();
    }

    lastError = null;
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
      throw error;
    });

    return getState();
  }

  return {
    getState,
    start,
    stop,
    isEnabled: () => mcpProxyStore.get('enabled') === true,
  };
}
