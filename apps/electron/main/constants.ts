import { app } from 'electron';
import { createRequire } from 'node:module';
import path from 'node:path';

import { resolveDistribution, resolveElectronAppId, resolveProtocolScheme, type DistributionPackageMetadata } from './distribution.js';

const require = createRequire(import.meta.url);

function readEnv(name: keyof NodeJS.ProcessEnv): string | null {
    const value = process.env[name];
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

function readPackageMetadata(): DistributionPackageMetadata | null {
    try {
        return require('../../package.json') as DistributionPackageMetadata;
    } catch {
        return null;
    }
}

const packageMetadata = readPackageMetadata();
const packageName = typeof packageMetadata?.name === 'string' ? packageMetadata.name.trim() : '';

export const DISTRIBUTION = resolveDistribution({
    env: process.env,
    packageMetadata,
    appName: app.getName(),
});
export const APP_ID = resolveElectronAppId({
    env: process.env,
    packageMetadata,
    distribution: DISTRIBUTION,
});
export const PROTOCOL = resolveProtocolScheme({
    env: process.env,
    packageMetadata,
    distribution: DISTRIBUTION,
});
export const APP_BASE_URL = readEnv('DORY_APP_BASE_URL');
export const PACKAGE_NAME = packageName || null;
export const isBetaDistribution = DISTRIBUTION === 'beta';
export const isDev = !app.isPackaged;

// Configure this during constants module evaluation so later imports that
// create electron-store instances see the final userData path.
if (process.platform === 'win32' || isBetaDistribution) {
    app.setPath('userData', path.join(app.getPath('appData'), APP_ID));
} else if (process.platform === 'darwin' && PACKAGE_NAME) {
    app.setPath('userData', path.join(app.getPath('appData'), PACKAGE_NAME));
}
