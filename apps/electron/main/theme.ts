import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import Store from 'electron-store';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_BACKGROUND_COLORS = {
    light: '#ffffff',
    dark: '#09090b',
};

const themeStore = new Store<{ theme: ThemeMode }>({
    name: 'preferences',
    defaults: {
        theme: 'system',
    },
});

function isThemeMode(value: unknown): value is ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system';
}

export function getStoredTheme(): ThemeMode {
    const stored = themeStore.get('theme');
    return isThemeMode(stored) ? stored : 'system';
}

export function applyTheme(theme: ThemeMode) {
    nativeTheme.themeSource = theme;
}

export function getThemeBackgroundColor() {
    return nativeTheme.shouldUseDarkColors ? THEME_BACKGROUND_COLORS.dark : THEME_BACKGROUND_COLORS.light;
}

function updateWindowBackgroundColors() {
    const backgroundColor = getThemeBackgroundColor();
    for (const win of BrowserWindow.getAllWindows()) {
        win.setBackgroundColor(backgroundColor);
    }
}

export function setStoredTheme(theme: ThemeMode) {
    themeStore.set('theme', theme);
    applyTheme(theme);
    updateWindowBackgroundColors();
    console.log('[electron][theme] setStoredTheme:', theme);
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('theme:changed', theme);
    }
}

export function registerThemeIpc() {
    ipcMain.handle('theme:get', () => getStoredTheme());
    ipcMain.handle('theme:set', (_event, theme: ThemeMode) => {
        if (!isThemeMode(theme)) return getStoredTheme();
        if (theme !== getStoredTheme()) setStoredTheme(theme);
        return getStoredTheme();
    });
}

nativeTheme.on('updated', updateWindowBackgroundColors);
