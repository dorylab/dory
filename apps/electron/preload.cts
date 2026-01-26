import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isPackaged: process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true',
});

contextBridge.exposeInMainWorld('authBridge', {
    openExternal: (url: string) => ipcRenderer.invoke('auth:openExternal', url),
    onCallback: (callback: (url: string) => void) => {
        const listener = (_event: unknown, url: string) => callback(url);
        ipcRenderer.on('auth:callback', listener);
        return () => ipcRenderer.removeListener('auth:callback', listener);
    },
});
