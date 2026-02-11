import { BrowserWindow, shell } from 'electron';
import type { LogFn } from './logger.js';

let mainWindow: BrowserWindow | null = null;
let pendingAuthCallback: string | null = null;

interface CreateMainWindowOptions {
  preloadPath: string;
  targetUrl: string;
  log: LogFn;
}

export function createMainWindow({ preloadPath, targetUrl, log }: CreateMainWindowOptions) {
  log('[electron] createMainWindow ->', targetUrl);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
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
    if (!pendingAuthCallback) return;
    mainWindow?.webContents.send('auth:callback', pendingAuthCallback);
    pendingAuthCallback = null;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export function sendAuthCallback(url: string, logWarn: LogFn) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logWarn('[electron] main window unavailable, queueing auth callback');
    pendingAuthCallback = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('auth:callback', url);
}

export function setPendingAuthCallback(url: string) {
  pendingAuthCallback = url;
}

export function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

export function hasMainWindow() {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}
