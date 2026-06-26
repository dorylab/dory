import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export type DoryStorageProfileName = 'desktop' | 'headless';

export type ResolveDoryStorageProfileOptions = {
    profile?: DoryStorageProfileName;
    userDataDir?: string;
    pglitePath?: string;
    databaseUrl?: string;
};

export type DoryStorageProfile = {
    profile: DoryStorageProfileName;
    dbType: 'pglite' | 'postgres';
    userDataDir: string;
    pglitePath?: string;
    databaseUrl?: string;
    secretsPath: string;
    dsSecretKey: string;
    betterAuthSecret: string;
    existed: {
        userDataDir: boolean;
        pglitePath: boolean;
        secretsPath: boolean;
    };
};

type DesktopSecretsFile = {
    dsSecretKey?: string;
    betterAuthSecret?: string;
    DS_SECRET_KEY?: string;
    BETTER_AUTH_SECRET?: string;
};

function expandHome(value: string) {
    if (value === '~') return homedir();
    if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
    return value;
}

function base64Secret() {
    return randomBytes(32).toString('base64');
}

function readSecrets(secretsPath: string): DesktopSecretsFile {
    if (!existsSync(secretsPath)) return {};
    try {
        const parsed = JSON.parse(readFileSync(secretsPath, 'utf8'));
        return parsed && typeof parsed === 'object' ? (parsed as DesktopSecretsFile) : {};
    } catch {
        return {};
    }
}

function normalizeSecrets(input: DesktopSecretsFile) {
    return {
        dsSecretKey: input.dsSecretKey ?? input.DS_SECRET_KEY ?? base64Secret(),
        betterAuthSecret: input.betterAuthSecret ?? input.BETTER_AUTH_SECRET ?? base64Secret(),
    };
}

function ensureSecretsFile(secretsPath: string) {
    const existing = readSecrets(secretsPath);
    const normalized = normalizeSecrets(existing);
    mkdirSync(path.dirname(secretsPath), { recursive: true });
    writeFileSync(
        secretsPath,
        `${JSON.stringify(
            {
                BETTER_AUTH_SECRET: normalized.betterAuthSecret,
                DS_SECRET_KEY: normalized.dsSecretKey,
            },
            null,
            2,
        )}\n`,
        { mode: 0o600 },
    );
    return normalized;
}

function macDesktopCandidates() {
    const appSupport = path.join(homedir(), 'Library', 'Application Support');
    return [
        path.join(appSupport, 'Dory'),
        path.join(appSupport, 'Dory Beta'),
        path.join(appSupport, 'dory'),
        path.join(appSupport, 'com.dory.app'),
    ];
}

function desktopUserDataCandidates() {
    if (process.platform === 'darwin') return macDesktopCandidates();
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA ?? path.join(homedir(), 'AppData', 'Roaming');
        return [path.join(appData, 'Dory'), path.join(appData, 'com.dory.app')];
    }
    const configHome = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
    return [path.join(configHome, 'Dory'), path.join(configHome, 'dory')];
}

function resolveDesktopUserDataDir(explicit?: string) {
    if (explicit) return path.resolve(expandHome(explicit));
    const fromEnv = process.env.DORY_DESKTOP_USER_DATA_PATH;
    if (fromEnv) return path.resolve(expandHome(fromEnv));

    const candidates = desktopUserDataCandidates();
    const existing = candidates.find(candidate => existsSync(path.join(candidate, 'data', 'database')) || existsSync(path.join(candidate, 'desktop-secrets.json')));
    return existing ?? candidates[0]!;
}

function resolveHeadlessUserDataDir(explicit?: string) {
    if (explicit) return path.resolve(expandHome(explicit));
    return path.join(homedir(), '.dory');
}

export function resolveDoryStorageProfile(options: ResolveDoryStorageProfileOptions = {}): DoryStorageProfile {
    const profile = options.profile ?? 'headless';
    const isPostgres = Boolean(options.databaseUrl);
    const userDataDir = profile === 'desktop' ? resolveDesktopUserDataDir(options.userDataDir) : resolveHeadlessUserDataDir(options.userDataDir);
    const secretsPath = path.join(userDataDir, 'desktop-secrets.json');
    const secrets = ensureSecretsFile(secretsPath);
    const pglitePath =
        options.pglitePath !== undefined
            ? path.resolve(expandHome(options.pglitePath))
            : profile === 'desktop'
              ? path.join(userDataDir, 'data', 'database')
              : path.join(userDataDir, 'data', 'database');

    return {
        profile,
        dbType: isPostgres ? 'postgres' : 'pglite',
        userDataDir,
        pglitePath: isPostgres ? undefined : pglitePath,
        databaseUrl: options.databaseUrl,
        secretsPath,
        dsSecretKey: secrets.dsSecretKey,
        betterAuthSecret: secrets.betterAuthSecret,
        existed: {
            userDataDir: existsSync(userDataDir),
            pglitePath: existsSync(pglitePath),
            secretsPath: existsSync(secretsPath),
        },
    };
}
