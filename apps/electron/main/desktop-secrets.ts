import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { LogFn } from './logger.js';

type DesktopSecrets = {
    betterAuthSecret: string;
    dsSecretKey: string;
};

const DESKTOP_SECRETS_FILE_NAME = 'desktop-secrets.json';

function isValidBase64Secret(value: string | undefined): value is string {
    if (!value) {
        return false;
    }

    try {
        return Buffer.from(value, 'base64').length === 32;
    } catch {
        return false;
    }
}

function readDesktopSecrets(filePath: string, logWarn: LogFn): Partial<Record<'BETTER_AUTH_SECRET' | 'DS_SECRET_KEY', string>> {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<Record<'BETTER_AUTH_SECRET' | 'DS_SECRET_KEY', string>>;
        return raw && typeof raw === 'object' ? raw : {};
    } catch (error) {
        logWarn('[electron] failed to read desktop secrets, regenerating:', error);
        return {};
    }
}

export function ensureDesktopSecrets(userDataPath: string, logWarn: LogFn): DesktopSecrets {
    const secretsFilePath = path.join(userDataPath, DESKTOP_SECRETS_FILE_NAME);
    const existingSecrets = readDesktopSecrets(secretsFilePath, logWarn);
    const betterAuthSecret = isValidBase64Secret(existingSecrets.BETTER_AUTH_SECRET) ? existingSecrets.BETTER_AUTH_SECRET : randomBytes(32).toString('base64');
    const dsSecretKey = isValidBase64Secret(existingSecrets.DS_SECRET_KEY) ? existingSecrets.DS_SECRET_KEY : randomBytes(32).toString('base64');
    const shouldPersist = betterAuthSecret !== existingSecrets.BETTER_AUTH_SECRET || dsSecretKey !== existingSecrets.DS_SECRET_KEY || !fs.existsSync(secretsFilePath);

    if (shouldPersist) {
        try {
            fs.writeFileSync(
                secretsFilePath,
                JSON.stringify(
                    {
                        BETTER_AUTH_SECRET: betterAuthSecret,
                        DS_SECRET_KEY: dsSecretKey,
                    },
                    null,
                    2,
                ),
                { mode: 0o600 },
            );
        } catch (error) {
            logWarn('[electron] failed to persist desktop secrets:', error);
            throw new Error('Desktop encryption key could not be persisted. Check the user data directory permissions.');
        }
    }

    return {
        betterAuthSecret,
        dsSecretKey,
    };
}
