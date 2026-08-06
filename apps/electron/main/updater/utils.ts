import fs from 'node:fs';
import path from 'node:path';
import { app, nativeTheme, type BrowserWindow } from 'electron';
import { getMainWindow } from '../window.js';

export const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
};

export function getDialogHtmlPath(isDev: boolean, dirname: string, fileName: string) {
    if (isDev) {
        return path.resolve(dirname, '../../main', fileName);
    }
    return path.join(dirname, fileName);
}

export function getDialogBackgroundColor() {
    return nativeTheme.shouldUseDarkColors ? '#232326' : '#f3f3f5';
}

export function getCenteredPosition(width: number, height: number) {
    const main = getMainWindow();
    if (!main || main.isDestroyed()) return {};
    const [mx, my] = main.getPosition();
    const [mw, mh] = main.getSize();
    return {
        x: Math.round(mx + (mw - width) / 2),
        y: Math.round(my + (mh - height) / 2),
    };
}

interface ShowDialogOptions {
    focus?: boolean;
}

export function showDialog(window: BrowserWindow, options: ShowDialogOptions = {}) {
    const { focus = false } = options;
    if (!focus) {
        if (!window.isVisible()) {
            window.showInactive();
        }
        return;
    }
    if (window.isMinimized()) {
        window.restore();
    }
    window.show();
    if (process.platform === 'darwin') {
        app.focus({ steal: true });
    }
    window.focus();
}

export function showDialogAndFocus(window: BrowserWindow) {
    showDialog(window, { focus: true });
}

export function compareVersions(a: string, b: string) {
    const clean = (value: string) => value.split('-')[0];
    const pa = clean(a).split('.').map(part => Number(part));
    const pb = clean(b).split('.').map(part => Number(part));
    const length = Math.max(pa.length, pb.length);
    for (let i = 0; i < length; i += 1) {
        const av = Number.isFinite(pa[i]) ? pa[i] : 0;
        const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

export function getAppBundlePath() {
    // /path/MyApp.app/Contents/MacOS/MyApp -> /path/MyApp.app
    return path.resolve(process.execPath, '../../..');
}

export function canInstallUpdateInCurrentLocation() {
    if (process.platform !== 'darwin') return true;
    const appBundlePath = getAppBundlePath();
    if (appBundlePath.startsWith('/Volumes/')) return false;
    try {
        fs.accessSync(appBundlePath, fs.constants.W_OK);
        fs.accessSync(path.dirname(appBundlePath), fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}
