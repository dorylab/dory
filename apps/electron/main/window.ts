import { BrowserWindow, screen, shell } from 'electron';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Store from 'electron-store';
import type { LogFn } from './logger.js';

let mainWindow: BrowserWindow | null = null;
let pendingAuthCallback: string | null = null;
let windowStateSaveTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let isMainAppLoaded = false;
const MIN_WINDOW_WIDTH = 480;
const MIN_WINDOW_HEIGHT = 360;
const loadingHtmlPath = fileURLToPath(new URL('./loading.html', import.meta.url));

interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
}

const windowStateStore = new Store<{ bounds: WindowState }>({
    name: 'window-state',
    defaults: {
        bounds: {
            width: 1280,
            height: 800,
            isMaximized: false,
        },
    },
});

interface CreateMainWindowOptions {
    preloadPath: string;
    log: LogFn;
}

export function createMainWindow({ preloadPath, log }: CreateMainWindowOptions) {
    log('[electron] createMainWindow');
    log('[electron] preloadPath ->', preloadPath, 'exists:', fs.existsSync(preloadPath));

    const windowState = loadWindowState(log);
    mainWindow = new BrowserWindow({
        width: windowState?.width ?? 1280,
        height: windowState?.height ?? 800,
        x: windowState?.x,
        y: windowState?.y,
        show: true,
        frame: true,
        alwaysOnTop: false,
        transparent: false,
        backgroundColor: '#0b1020',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        fullscreenable: true,
        titleBarStyle: 'default',
        maximizable: true,
        resizable: true,
        movable: true,
    });

    if (windowState?.isMaximized) {
        mainWindow.maximize();
    }

    mainWindow.loadFile(loadingHtmlPath);

    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const levelName = level >= 3 ? 'error' : level === 2 ? 'warn' : 'info';
        log(`[renderer:${levelName}]`, message, sourceId ? `${sourceId}:${line}` : '');
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        log('[electron] render process gone:', details.reason, details.exitCode);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    const scheduleWindowStateSave = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
        windowStateSaveTimer = setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            saveWindowState(mainWindow, log);
        }, 250);
    };

    mainWindow.on('move', scheduleWindowStateSave);
    mainWindow.on('resize', scheduleWindowStateSave);
    mainWindow.on('maximize', scheduleWindowStateSave);
    mainWindow.on('unmaximize', scheduleWindowStateSave);

    mainWindow.on('close', event => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        if (!isQuitting) {
            event.preventDefault();
            if (mainWindow.isFullScreen()) {
                mainWindow.setFullScreen(false);
            } else {
                mainWindow.hide();
            }
        }

        saveWindowState(mainWindow, log);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        isMainAppLoaded = false;
    });
}

export function loadMainWindowUrl(targetUrl: string, log: LogFn) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    log('[electron] loadMainWindowUrl ->', targetUrl);
    isMainAppLoaded = false;
    const targetOrigin = new URL(targetUrl).origin;

    const handleAppLoad = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const currentUrl = mainWindow.webContents.getURL();
        if (!currentUrl.startsWith(targetOrigin)) return;
        mainWindow.webContents.off('did-finish-load', handleAppLoad);
        isMainAppLoaded = true;
        mainWindow?.webContents
            .executeJavaScript(
                '({ hasThemeBridge: !!window.themeBridge, hasLogBridge: !!window.logBridge, hasElectron: !!window.electron })',
                true,
            )
            .then(result => {
                log('[electron] renderer globals:', result);
            })
            .catch(error => {
                log('[electron] renderer globals check failed:', error instanceof Error ? error.message : String(error));
            });
        flushPendingAuthCallback();
    };

    mainWindow.webContents.on('did-finish-load', handleAppLoad);
    mainWindow.loadURL(targetUrl);
}

export function sendAuthCallback(url: string, logWarn: LogFn) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        logWarn('[electron] main window unavailable, queueing auth callback:', url);
        pendingAuthCallback = url;
        return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    if (!isMainAppLoaded) {
        logWarn('[electron] main app not loaded, queueing auth callback:', url);
        pendingAuthCallback = url;
        return;
    }
    logWarn('[electron] sending auth callback to renderer:', url);
    mainWindow.webContents.send('auth:callback', url);
}

export function setPendingAuthCallback(url: string) {
    pendingAuthCallback = url;
}

export function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
}

export function hasMainWindow() {
    return Boolean(mainWindow && !mainWindow.isDestroyed());
}

export function getMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow;
}

export function setMainWindowQuitting(quitting: boolean) {
    isQuitting = quitting;
}

function flushPendingAuthCallback() {
    if (!mainWindow || mainWindow.isDestroyed() || !pendingAuthCallback) return;
    mainWindow.webContents.send('auth:callback', pendingAuthCallback);
    pendingAuthCallback = null;
}

function loadWindowState(log: LogFn): WindowState | null {
    try {
        const parsed = windowStateStore.get('bounds') as WindowState | undefined;
        if (!parsed || typeof parsed !== 'object') return null;

        const width = Number(parsed.width);
        const height = Number(parsed.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

        const sanitized: WindowState = {
            width: Math.max(MIN_WINDOW_WIDTH, Math.round(width)),
            height: Math.max(MIN_WINDOW_HEIGHT, Math.round(height)),
        };

        if (typeof parsed.isMaximized === 'boolean') {
            sanitized.isMaximized = parsed.isMaximized;
        }

        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            const x = Math.round(parsed.x!);
            const y = Math.round(parsed.y!);
            if (isWindowVisibleOnSomeDisplay(x, y, sanitized.width, sanitized.height)) {
                sanitized.x = x;
                sanitized.y = y;
            }
        }

        return sanitized;
    } catch (error) {
        log('[electron] window state load failed:', error);
        return null;
    }
}

function isWindowVisibleOnSomeDisplay(x: number, y: number, width: number, height: number) {
    const margin = 40;
    return screen.getAllDisplays().some(display => {
        const area = display.workArea;
        const withinX = x + width > area.x + margin && x < area.x + area.width - margin;
        const withinY = y + height > area.y + margin && y < area.y + area.height - margin;
        return withinX && withinY;
    });
}

function saveWindowState(window: BrowserWindow, log: LogFn) {
    try {
        const isMaximized = window.isMaximized();
        const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
        const state: WindowState = {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.max(MIN_WINDOW_WIDTH, Math.round(bounds.width)),
            height: Math.max(MIN_WINDOW_HEIGHT, Math.round(bounds.height)),
            isMaximized,
        };

        windowStateStore.set('bounds', state);
    } catch (error) {
        log('[electron] window state save failed:', error);
    }
}
