import { app, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, PROTOCOL, isDev } from './main/constants.js';
import { ensureDirectoryExists } from './main/filesystem.js';
import { setupMainLogger } from './main/logger.js';
import { registerProtocolClient } from './main/protocol.js';
import { createStandaloneServerManager } from './main/server.js';
import {
  createMainWindow,
  focusMainWindow,
  hasMainWindow,
  sendAuthCallback,
  setPendingAuthCallback,
} from './main/window.js';
import { getUserDataPath } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
  app.setPath('userData', path.join(app.getPath('appData'), APP_ID));
}

const databasePath = path.join(getUserDataPath(), 'data/database');
ensureDirectoryExists(databasePath);

const { log, logWarn, logError } = setupMainLogger({
  isDev,
  databasePath,
  protocol: PROTOCOL,
});

const serverManager = createStandaloneServerManager({
  isDev,
  databasePath,
  log,
  logWarn,
  logError,
});

async function launch() {
  try {
    const targetUrl = await serverManager.getAppUrl();
    log('[electron] launch targetUrl:', targetUrl);
    createMainWindow({
      targetUrl,
      preloadPath: path.join(__dirname, 'preload.cjs'),
      log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError('[electron] launch error:', error);
    dialog.showErrorBox('Launch Failed', message);
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
log('[electron] singleInstanceLock:', gotLock);

if (!gotLock) {
  log('[electron] another instance owns the lock, quitting');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    log('[electron] second-instance argv:', argv);
    const deepLinkArg = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkArg) sendAuthCallback(deepLinkArg, logWarn);
    focusMainWindow();
  });

  app.on('will-finish-launching', () => {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      log('[electron] open-url:', url);
      sendAuthCallback(url, logWarn);
    });
  });

  app.whenReady().then(() => {
    log('[electron] app ready');
    registerProtocolClient(PROTOCOL, log);

    const deepLinkArg = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkArg) {
      log('[electron] pending deep link on ready:', deepLinkArg);
      setPendingAuthCallback(deepLinkArg);
    }

    launch();
  });

  app.on('activate', () => {
    log('[electron] app activate');
    if (!hasMainWindow()) launch();
  });

  app.on('window-all-closed', () => {
    log('[electron] window-all-closed');
    if (process.platform !== 'darwin') app.quit();
  });
}

app.on('before-quit', () => {
  log('[electron] before-quit');
  serverManager.stopStandaloneServer();
});

ipcMain.handle('auth:openExternal', async (_event, url: string) => {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Invalid URL');
  }
  await shell.openExternal(url);
});
