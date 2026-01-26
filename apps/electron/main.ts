import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import net, { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, type ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ID = 'com.dory.app';
const PROTOCOL = 'dory';

let mainWindow: BrowserWindow | null = null;
let cachedServerUrl: string | null = null;
let pendingAuthCallback: string | null = null;

let nextProc: ChildProcess | null = null;

const isDev = !app.isPackaged;

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
  app.setPath('userData', path.join(app.getPath('appData'), APP_ID));
}

// ---------- logging ----------
const logFile = path.join(app.getPath('userData'), 'protocol.log');
const formatLogArg = (arg: unknown) => {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};
const log = (...args: unknown[]) => {
  const message = args.map(formatLogArg).join(' ');
  console.log(...args);
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // ignore file logging errors
  }
};

log('[electron] logFile:', logFile);
log('[electron] execPath:', process.execPath);
log('[electron] argv:', process.argv);
log('[electron] isPackaged:', app.isPackaged);
log('[electron] defaultApp:', process.defaultApp);
log('[electron] appName:', app.getName());
log('[electron] appPath:', app.getAppPath());
log('[electron] exePath:', app.getPath('exe'));
log('[electron] userData:', app.getPath('userData'));
log('[electron] resourcesPath:', process.resourcesPath);

const startupDeepLink = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
if (startupDeepLink) {
  log('[electron] startup deep link argv:', startupDeepLink);
}

// ---------- window ----------
function resolvePreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function createMainWindow(targetUrl: string) {
  log('[electron] createMainWindow ->', targetUrl);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingAuthCallback) {
      sendAuthCallback(pendingAuthCallback);
      pendingAuthCallback = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------- port helpers ----------
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
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Next server startup timed out: ${host}:${port}`);
}

// ---------- Next standalone server ----------
function getStandaloneDir() {
  // Matches electron-builder extraResources: { to: "standalone" }
  return path.join(process.resourcesPath, 'standalone');
}

function stopStandaloneServer() {
  if (!nextProc) return;
  try {
    log('[electron] stopping Next server...');
    nextProc.kill();
  } catch (e) {
    log('[electron] stop Next error:', e);
  } finally {
    nextProc = null;
  }
}

async function startStandaloneServer(): Promise<string> {
  const standaloneDir = getStandaloneDir();
  const serverPath = path.join(standaloneDir, 'server.js');

  log('[electron] standaloneDir:', standaloneDir);
  log('[electron] serverPath:', serverPath);

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `Next standalone build output not found: ${serverPath}\n` +
      `Please confirm electron-builder copied release/standalone to extraResources/standalone (see build.extraResources).`
    );
  }

  // Stop the previous instance if it's still running
  stopStandaloneServer();

  const hostname = '127.0.0.1';
  const port = await findAvailablePort(Number(process.env.PORT) || 3000);

  // Start Next with fork (child process isolates cwd/env and exits cleanly)
  nextProc = fork(serverPath, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
    },
    stdio: 'pipe',
  });

  nextProc.stdout?.on('data', (buf) => log('[next stdout]', String(buf).trimEnd()));
  nextProc.stderr?.on('data', (buf) => log('[next stderr]', String(buf).trimEnd()));

  nextProc.on('exit', (code, signal) => {
    log('[electron] Next exited:', code, signal);
    nextProc = null;
  });

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

// ---------- app lifecycle ----------
async function launch() {
  try {
    const targetUrl = await getAppUrl();
    log('[electron] launch targetUrl:', targetUrl);
    createMainWindow(targetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('[electron] launch error:', message);
    dialog.showErrorBox('Launch Failed', message);
    app.quit();
  }
}

function registerProtocol() {
  app.removeAsDefaultProtocolClient(PROTOCOL);
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
  log('[electron] isDefaultProtocolClient:', app.isDefaultProtocolClient(PROTOCOL));
}

function sendAuthCallback(url: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingAuthCallback = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('auth:callback', url);
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
log('[electron] singleInstanceLock:', gotLock);

if (!gotLock) {
  log('[electron] another instance owns the lock, quitting');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    log('[electron] second-instance argv:', argv);
    const deepLinkArg = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkArg) sendAuthCallback(deepLinkArg);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS deep link
  app.on('will-finish-launching', () => {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      log('[electron] open-url:', url);
      sendAuthCallback(url);
    });
  });

  app.whenReady().then(() => {
    registerProtocol();

    const deepLinkArg = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkArg) {
      log('[electron] pending deep link on ready:', deepLinkArg);
      pendingAuthCallback = deepLinkArg;
    }

    launch();
  });

  app.on('activate', () => {
    if (mainWindow === null) launch();
  });

  app.on('window-all-closed', () => {
    // macOS convention: keep app running after closing all windows
    if (process.platform !== 'darwin') app.quit();
  });
}

// Clean up Next child process on exit
app.on('before-quit', () => {
  stopStandaloneServer();
});

// ---------- ipc ----------
ipcMain.handle('auth:openExternal', async (_event, url: string) => {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Invalid URL');
  }
  await shell.openExternal(url);
});
