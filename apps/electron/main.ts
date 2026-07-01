import { app, dialog, ipcMain, shell, Menu, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, DISTRIBUTION, PROTOCOL, isDev } from './main/constants.js';
import { ensureDirectoryExists } from './main/filesystem.js';
import { createMainI18n } from './main/i18n.js';
import { getStoredLocale, registerLocaleIpc } from './main/locale.js';
import { getMainLogFilePath, setupMainLogger } from './main/logger.js';
import { createMcpProxyManager } from './main/mcp-proxy.js';
import { registerProtocolClient } from './main/protocol.js';
import { createStandaloneServerManager } from './main/server.js';
import { parseDoryDeepLink } from './main/deep-link.js';
import { setUpdaterLocale, setupUpdater } from './main/updater.js';
import type { UpdateChannel } from './main/updater/types.js';
import {
  createMainWindow,
  focusMainWindow,
  hasMainWindow,
  loadMainWindowUrl,
  sendAuthCallback,
  setPendingAuthCallback,
  setMainWindowQuitting,
} from './main/window.js';
import { applyTheme, getStoredTheme, registerThemeIpc } from './main/theme.js';
import { getUserDataPath } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
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
  userDataPath: getUserDataPath(),
  databasePath,
  log,
  logWarn,
  logError,
});
const mcpProxyManager = createMcpProxyManager({
  log,
  logWarn,
  logError,
});
let launchPromise: Promise<void> | null = null;
let launchDockBounceId: number | null = null;
let pendingWorkspacePath: string | null = null;

registerThemeIpc();
applyTheme(getStoredTheme());
log('[electron] distribution:', DISTRIBUTION);
log('[electron] userData path:', app.getPath('userData'));
log('[electron] stored theme on boot:', getStoredTheme());
log('[electron] stored locale on boot:', getStoredLocale());

function startLaunchDockBounce() {
  if (process.platform !== 'darwin' || launchDockBounceId !== null) return;
  const dock = app.dock;
  if (!dock) return;
  const bounceId = dock.bounce('informational');
  if (bounceId === -1) return;
  launchDockBounceId = bounceId;
  log('[electron] launch dock bounce started:', bounceId);
}

function stopLaunchDockBounce() {
  if (process.platform !== 'darwin' || launchDockBounceId === null) return;
  const dock = app.dock;
  if (!dock) return;
  dock.cancelBounce(launchDockBounceId);
  log('[electron] launch dock bounce stopped:', launchDockBounceId);
  launchDockBounceId = null;
}

function createUpdateChannelMenuItems(options: {
  getUpdateChannel: () => UpdateChannel;
  onSelectUpdateChannel: (channel: UpdateChannel) => void | Promise<void>;
  stableChannelLabel: string;
  betaChannelLabel: string;
}): MenuItemConstructorOptions[] {
  return [
    {
      label: options.stableChannelLabel,
      type: 'radio',
      checked: options.getUpdateChannel() === 'latest',
      click: () => {
        void options.onSelectUpdateChannel('latest');
      },
    },
    {
      label: options.betaChannelLabel,
      type: 'radio',
      checked: options.getUpdateChannel() === 'beta',
      click: () => {
        void options.onSelectUpdateChannel('beta');
      },
    },
  ];
}

function createUpdateChannelSubmenuIfVisible(options: {
  getUpdateChannel: () => UpdateChannel;
  onSelectUpdateChannel: (channel: UpdateChannel) => void | Promise<void>;
  updateChannelLabel: string;
  stableChannelLabel: string;
  betaChannelLabel: string;
}): MenuItemConstructorOptions[] {
  if (!isDev) {
    return [];
  }

  return [{
    label: options.updateChannelLabel,
    submenu: createUpdateChannelMenuItems(options),
  } satisfies MenuItemConstructorOptions];
}

function setupAppMenu(options: {
  onCheckUpdate: () => void;
  onSelectUpdateChannel: (channel: UpdateChannel) => void | Promise<void>;
  getUpdateChannel: () => UpdateChannel;
  onResetSkippedUpdate: () => void;
  onOpenUpdateDialogDebug?: () => void;
  checkForUpdatesLabel: string;
  updateChannelLabel: string;
  stableChannelLabel: string;
  betaChannelLabel: string;
  resetSkippedUpdateLabel: string;
  openUpdateDialogDebugLabel: string;
  openLogLabel: string;
  openLogFailedTitle: string;
}) {
  const logFilePath = getMainLogFilePath();
  const debugMenuItems: MenuItemConstructorOptions[] = [];
  const updateChannelMenuItems = createUpdateChannelSubmenuIfVisible(options);
  if (options.onOpenUpdateDialogDebug) {
    const onOpenUpdateDialogDebug = options.onOpenUpdateDialogDebug;
    debugMenuItems.push({
      label: options.openUpdateDialogDebugLabel,
      click: () => {
        onOpenUpdateDialogDebug();
      },
    });
  }

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: options.checkForUpdatesLabel,
              click: () => {
                options.onCheckUpdate();
              },
            },
            ...updateChannelMenuItems,
            {
              label: options.resetSkippedUpdateLabel,
              click: () => {
                options.onResetSkippedUpdate();
              },
            },
            ...debugMenuItems,
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        } satisfies MenuItemConstructorOptions]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(process.platform !== 'darwin'
          ? [
              {
                label: options.checkForUpdatesLabel,
                click: () => {
                  options.onCheckUpdate();
                },
              },
              ...updateChannelMenuItems,
              {
                label: options.resetSkippedUpdateLabel,
                click: () => {
                  options.onResetSkippedUpdate();
                },
              },
              ...debugMenuItems,
            ]
          : []),
        { type: 'separator' },
        {
          label: options.openLogLabel,
          click: async () => {
            const result = await shell.openPath(logFilePath);
            if (result) {
              logWarn('[electron] open log file failed:', result);
              dialog.showErrorBox(options.openLogFailedTitle, result);
            }
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createLocalizedMenuLabels() {
  const { t } = createMainI18n();
  return {
    checkForUpdatesLabel: t('menu.checkForUpdates'),
    updateChannelLabel: t('menu.updateChannel'),
    stableChannelLabel: t('menu.updateChannelStable'),
    betaChannelLabel: t('menu.updateChannelBeta'),
    resetSkippedUpdateLabel: t('menu.resetSkippedUpdate'),
    openUpdateDialogDebugLabel: t('menu.openUpdateDialogDebug'),
    openLogLabel: t('menu.openLog'),
    openLogFailedTitle: t('error.openLogFailed'),
  };
}

async function launch(workspacePath?: string | null) {
  if (workspacePath) {
    pendingWorkspacePath = workspacePath;
  }

  if (launchPromise) {
    log('[electron] launch already in progress');
    return launchPromise;
  }

  launchPromise = (async () => {
    try {
      startLaunchDockBounce();
      const baseUrl = await serverManager.getAppUrl();
      const targetPath = pendingWorkspacePath;
      pendingWorkspacePath = null;
      const targetUrl = targetPath ? new URL(targetPath, baseUrl).toString() : baseUrl;
      log('[electron] launch targetUrl:', targetUrl);
      if (!hasMainWindow()) {
        createMainWindow({
          preloadPath: path.join(__dirname, 'preload.cjs'),
          log,
        });
      }
      loadMainWindowUrl(targetUrl, log, {
        onReveal: stopLaunchDockBounce,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      stopLaunchDockBounce();
      logError('[electron] launch error:', error);
      dialog.showErrorBox('Launch Failed', message);
      app.quit();
    } finally {
      launchPromise = null;
      if (pendingWorkspacePath) {
        void launch();
      }
    }
  })();

  return launchPromise;
}

function handleDoryDeepLink(url: string) {
  const parsed = parseDoryDeepLink(url, PROTOCOL);
  if (!parsed) {
    logWarn('[electron] ignored invalid deep link:', url);
    return;
  }

  if (parsed.type === 'open') {
    if (!app.isReady()) {
      pendingWorkspacePath = parsed.path;
      return;
    }
    void launch(parsed.path);
    return;
  }

  sendAuthCallback(parsed.url, logWarn);
  focusMainWindow();
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
    if (deepLinkArg) {
      handleDoryDeepLink(deepLinkArg);
    } else {
      focusMainWindow();
    }
  });

  app.on('will-finish-launching', () => {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      log('[electron] open-url:', url);
      handleDoryDeepLink(url);
    });
  });

  app.whenReady().then(() => {
    log('[electron] app ready');
    log('[electron] version:', app.getVersion());
    log('[electron] execPath:', process.execPath);
    log('[electron] appPath:', app.getAppPath());
    const { locale, t } = createMainI18n();
    log('[electron] locale:', locale);
    registerProtocolClient(PROTOCOL, log);
    const updater = setupUpdater({ log, logWarn, logError, locale, t });
    const applyAppMenu = () => setupAppMenu({
      onCheckUpdate: () => {
        void updater.checkForUpdatesFromMenu();
      },
      onSelectUpdateChannel: channel => {
        void updater.setUpdateChannelFromMenu(channel);
      },
      getUpdateChannel: () => updater.getUpdateChannel(),
      onResetSkippedUpdate: () => {
        updater.clearSkippedVersionFromMenu();
      },
      onOpenUpdateDialogDebug: isDev
        ? () => {
            updater.openUpdateDialogDebug();
          }
        : undefined,
      ...createLocalizedMenuLabels(),
    });
    applyAppMenu();
    registerLocaleIpc(nextLocale => {
      log('[electron] locale changed:', nextLocale);
      setUpdaterLocale(nextLocale);
      applyAppMenu();
    });

    const deepLinkArg = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    let startupWorkspacePath: string | null = null;
    if (deepLinkArg) {
      log('[electron] pending deep link on ready:', deepLinkArg);
      const parsed = parseDoryDeepLink(deepLinkArg, PROTOCOL);
      if (parsed?.type === 'open') {
        startupWorkspacePath = parsed.path;
      } else if (parsed?.type === 'auth') {
        setPendingAuthCallback(parsed.url);
      } else {
        logWarn('[electron] ignored invalid startup deep link:', deepLinkArg);
      }
    }

    launch(startupWorkspacePath);
    updater.startAutoUpdateChecks();
  });

  app.on('activate', () => {
    log('[electron] app activate');
    if (!hasMainWindow()) launch();
    focusMainWindow();
  });

  app.on('window-all-closed', () => {
    log('[electron] window-all-closed');
    if (process.platform !== 'darwin') app.quit();
  });
}

app.on('before-quit', () => {
  log('[electron] before-quit');
  setMainWindowQuitting(true);
  void mcpProxyManager.stop({ persist: false });
  serverManager.stopStandaloneServer();
});

ipcMain.handle('auth:openExternal', async (_event, url: string) => {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Invalid URL');
  }
  await shell.openExternal(url);
});

ipcMain.handle('filesystem:select-sqlite-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Database File',
        extensions: ['sqlite', 'db', 'sqlite3', 'duckdb'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle('filesystem:select-local-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Data Files',
        extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson', 'xlsx', 'xlsm'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle('mcp:get-state', async (_event, userId?: string) => {
  return mcpProxyManager.getState(userId);
});

ipcMain.handle('mcp:start', async (_event, desktopGrant: string, userId: string) => {
  if (typeof desktopGrant !== 'string' || !desktopGrant.trim()) {
    throw new Error('MCP desktop grant is required.');
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('MCP user id is required.');
  }
  const targetUrl = await serverManager.getAppUrl();
  return mcpProxyManager.start(targetUrl, desktopGrant, userId);
});

ipcMain.handle('mcp:stop', async (_event, userId?: string) => {
  return mcpProxyManager.stop({ userId });
});

ipcMain.handle('mcp:stop-active', async () => {
  return mcpProxyManager.stopActive();
});

ipcMain.on('log:renderer', (_event, level: string, ...args: unknown[]) => {
  const safeArgs = args.map(arg => {
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  if (level === 'warn') {
    logWarn('[renderer]', ...safeArgs);
    return;
  }
  if (level === 'error') {
    logError('[renderer]', ...safeArgs);
    return;
  }
  log('[renderer]', ...safeArgs);
});
