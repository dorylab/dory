import { contextBridge, ipcRenderer } from 'electron';

ipcRenderer.send('log:renderer', 'info', '[preload] loaded');

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isPackaged: process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true',
    selectSqliteFile: () => ipcRenderer.invoke('filesystem:select-sqlite-file') as Promise<string | null>,
    selectLocalFile: () => ipcRenderer.invoke('filesystem:select-local-file') as Promise<string | null>,
});

contextBridge.exposeInMainWorld('authBridge', {
    openExternal: (url: string) => ipcRenderer.invoke('auth:openExternal', url),
    onCallback: (callback: (url: string) => void) => {
        const listener = (_event: unknown, url: string) => {
            console.log('[electron][preload] auth callback url:', url);
            callback(url);
        };
        ipcRenderer.on('auth:callback', listener);
        return () => ipcRenderer.removeListener('auth:callback', listener);
    },
});

contextBridge.exposeInMainWorld('themeBridge', {
    getTheme: () => ipcRenderer.invoke('theme:get'),
    setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('theme:set', theme),
    onThemeChanged: (callback: (theme: 'light' | 'dark' | 'system') => void) => {
        const listener = (_event: unknown, theme: 'light' | 'dark' | 'system') => {
            callback(theme);
        };
        ipcRenderer.on('theme:changed', listener);
        return () => ipcRenderer.removeListener('theme:changed', listener);
    },
});

contextBridge.exposeInMainWorld('localeBridge', {
    getLocale: () => ipcRenderer.invoke('locale:get') as Promise<'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES'>,
    setLocale: (locale: 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES') => ipcRenderer.invoke('locale:set', locale) as Promise<'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES'>,
    onLocaleChanged: (callback: (locale: 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES') => void) => {
        const listener = (_event: unknown, locale: 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES') => {
            callback(locale);
        };
        ipcRenderer.on('locale:changed', listener);
        return () => ipcRenderer.removeListener('locale:changed', listener);
    },
});

contextBridge.exposeInMainWorld('mcpBridge', {
    getState: () => ipcRenderer.invoke('mcp:get-state') as Promise<{ enabled: boolean; running: boolean; endpoint: string; error: string | null }>,
    start: () => ipcRenderer.invoke('mcp:start') as Promise<{ enabled: boolean; running: boolean; endpoint: string; error: string | null }>,
    stop: () => ipcRenderer.invoke('mcp:stop') as Promise<{ enabled: boolean; running: boolean; endpoint: string; error: string | null }>,
});

contextBridge.exposeInMainWorld('updateBridge', {
    getState: () => ipcRenderer.invoke('updater:get-state') as Promise<{ readyToInstall: boolean; version: string | null }>,
    restartAndInstall: () => ipcRenderer.invoke('updater:restart-and-install') as Promise<boolean>,
    onStateChanged: (callback: (state: { readyToInstall: boolean; version: string | null }) => void) => {
        const listener = (_event: unknown, state: { readyToInstall: boolean; version: string | null }) => {
            callback(state);
        };
        ipcRenderer.on('updater:state', listener);
        return () => ipcRenderer.removeListener('updater:state', listener);
    },
});

contextBridge.exposeInMainWorld('logBridge', {
    log: (level: 'info' | 'warn' | 'error', ...args: unknown[]) => {
        ipcRenderer.send('log:renderer', level, ...args);
    },
});
