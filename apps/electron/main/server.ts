import fs from 'node:fs';
import net, { AddressInfo } from 'node:net';
import path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import type { LogFn } from './logger.js';

interface CreateStandaloneServerManagerOptions {
  isDev: boolean;
  databasePath: string;
  log: LogFn;
  logWarn: LogFn;
  logError: LogFn;
}

export function createStandaloneServerManager({
  isDev,
  databasePath,
  log,
  logWarn,
  logError,
}: CreateStandaloneServerManagerOptions) {
  let cachedServerUrl: string | null = null;
  let nextProc: ChildProcess | null = null;

  function getStandaloneDir() {
    // Matches electron-builder extraResources: { to: "standalone" }
    return path.join(process.resourcesPath, 'standalone');
  }

  function stopStandaloneServer() {
    if (!nextProc) return;
    try {
      log('[electron] stopping Next server...');
      nextProc.kill();
    } catch (error) {
      logError('[electron] stop Next error:', error);
    } finally {
      nextProc = null;
    }
  }

  async function startStandaloneServer(): Promise<string> {
    const standaloneDir = getStandaloneDir();
    const serverPath = path.join(standaloneDir, 'apps/web/server.js');
    const bootstrapPath = path.join(standaloneDir, 'apps/web/dist-scripts/bootstrap.mjs');

    log('[electron] standaloneDir:', standaloneDir);
    log('[electron] bootstrapPath:', bootstrapPath);
    log('[electron] serverPath:', serverPath);

    if (!fs.existsSync(bootstrapPath)) {
      throw new Error(
        `Bootstrap script not found: ${bootstrapPath}\n` +
          'Please confirm apps/web/dist-scripts/bootstrap.mjs is included in release/standalone.',
      );
    }

    if (!fs.existsSync(serverPath)) {
      throw new Error(
        `Next standalone build output not found: ${serverPath}\n` +
          'Please confirm electron-builder copied release/standalone to extraResources/standalone (see build.extraResources).',
      );
    }

    stopStandaloneServer();

    const hostname = '127.0.0.1';
    const port = await findAvailablePort(Number(process.env.PORT) || 3000);

    await new Promise<void>((resolve, reject) => {
      const bootstrapProc = fork(bootstrapPath, [], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: hostname,
          NODE_ENV: 'production',
          DATABASE_URL: databasePath,
          NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
        },
        stdio: 'pipe',
      });

      bootstrapProc.stdout?.on('data', buf => log('[bootstrap stdout]', String(buf).trimEnd()));
      bootstrapProc.stderr?.on('data', buf => logWarn('[bootstrap stderr]', String(buf).trimEnd()));

      bootstrapProc.on('error', error => {
        reject(new Error(`Failed to start bootstrap script: ${String(error)}`));
      });

      bootstrapProc.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(`Bootstrap script exited with code=${String(code)} signal=${String(signal)}`),
        );
      });
    });

    nextProc = fork(serverPath, [], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: hostname,
        DATABASE_URL: databasePath,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
      },
      stdio: 'pipe',
    });

    nextProc.stdout?.on('data', buf => log('[next stdout]', String(buf).trimEnd()));
    nextProc.stderr?.on('data', buf => logWarn('[next stderr]', String(buf).trimEnd()));

    nextProc.on('exit', (code, signal) => {
      logWarn('[electron] Next exited:', code, signal);
      nextProc = null;
    });

    log('[electron] Next running port:', port);

    await waitUntilReady(hostname, port);

    const url = `http://${hostname}:${port}`;
    log('[electron] Next ready:', url);
    return url;
  }

  async function getAppUrl(): Promise<string> {
    if (cachedServerUrl) return cachedServerUrl;

    if (isDev) {
      cachedServerUrl = process.env.ELECTRON_START_URL ?? 'http://localhost:3000';
      return cachedServerUrl;
    }

    cachedServerUrl = await startStandaloneServer();
    return cachedServerUrl;
  }

  return {
    getAppUrl,
    stopStandaloneServer,
  };
}

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      server.close();
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(findAvailablePort(startPort + 1));
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });

    server.listen(startPort, '127.0.0.1');
  });
}

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitUntilReady(host: string, port: number, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Next server startup timed out: ${host}:${port}`);
}
