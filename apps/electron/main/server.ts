import fs from 'node:fs';
import net, { AddressInfo } from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { parse as parseDotEnv } from 'dotenv';
import { APP_BASE_URL, isBetaDistribution } from './constants.js';
import type { LogFn } from './logger.js';

interface CreateStandaloneServerManagerOptions {
    isDev: boolean;
    userDataPath: string;
    databasePath: string;
    log: LogFn;
    logWarn: LogFn;
    logError: LogFn;
}

type DesktopServerEnvOptions = {
    childEnv: NodeJS.ProcessEnv;
    userDataPath: string;
    databasePath: string;
    hostname: string;
    port: number;
    logWarn: LogFn;
};

type DesktopSecrets = {
    betterAuthSecret: string;
    dsSecretKey: string;
};

type DesktopServerPortSelection = {
    port: number;
    shouldPersist: boolean;
};

const DESKTOP_SECRETS_FILE_NAME = 'desktop-secrets.json';
const DESKTOP_SERVER_CONFIG_FILE_NAME = 'desktop-server.json';

export function createStandaloneServerManager({ isDev, userDataPath, databasePath, log, logWarn, logError }: CreateStandaloneServerManagerOptions) {
    let cachedServerUrl: string | null = null;
    let pendingServerUrlPromise: Promise<string> | null = null;
    let nextProc: ChildProcess | null = null;

    function getStandaloneDir() {
        // Matches electron-builder extraResources: { to: "standalone" }
        return path.join(process.resourcesPath, 'standalone');
    }

    function stopStandaloneServer() {
        pendingServerUrlPromise = null;
        if (!nextProc) return;
        try {
            log('[electron] stopping Next server...');
            nextProc.kill();
        } catch (error) {
            logError('[electron] stop Next error:', error);
        } finally {
            nextProc = null;
        }
    }

    async function startStandaloneServer(): Promise<string> {
        const standaloneDir = getStandaloneDir();
        const serverPath = path.join(standaloneDir, 'apps/web/server.js');
        const bootstrapPath = path.join(standaloneDir, 'apps/web/dist-scripts/bootstrap.mjs');
        const childEnv = {
            ...loadStandaloneEnv(standaloneDir),
            ...process.env,
        };

        log('[electron] standaloneDir:', standaloneDir);
        log('[electron] bootstrapPath:', bootstrapPath);
        log('[electron] serverPath:', serverPath);

        if (!fs.existsSync(bootstrapPath)) {
            throw new Error(`Bootstrap script not found: ${bootstrapPath}\n` + 'Please confirm apps/web/dist-scripts/bootstrap.mjs is included in release/standalone.');
        }

        if (!fs.existsSync(serverPath)) {
            throw new Error(
                `Next standalone build output not found: ${serverPath}\n` +
                    'Please confirm electron-builder copied release/standalone to extraResources/standalone (see build.extraResources).',
            );
        }

        stopStandaloneServer();

        const hostname = '127.0.0.1';
        const portSelection = await resolveDesktopServerPort({
            childEnv,
            userDataPath,
            hostname,
            logWarn,
        });
        const port = portSelection.port;

        log(`[electron] Starting bootstrap script on port ${port}...`);

        await new Promise<void>((resolve, reject) => {
            let bootstrapCompleted = false;
            let settled = false;
            const bootstrapProc = fork(bootstrapPath, [], {
                cwd: standaloneDir,
                env: createDesktopServerEnv({
                    childEnv,
                    userDataPath,
                    databasePath,
                    hostname,
                    port,
                    logWarn,
                }),
                stdio: 'pipe',
            });

            console.log('[electron] bootstrapProc PID:', bootstrapProc.pid);
            console.log('[electron] bootstrapProc databasePath:', databasePath);

            const resolveOnce = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            const rejectOnce = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };

            bootstrapProc.stdout?.on('data', buf => {
                const output = String(buf).trimEnd();
                log('[bootstrap stdout]', output);
                if (output.includes('[bootstrap] completed')) {
                    bootstrapCompleted = true;
                    log('[electron] bootstrap completed, starting Next server');
                    resolveOnce();
                    if (bootstrapProc.exitCode === null && !bootstrapProc.killed) {
                        bootstrapProc.kill();
                    }
                }
            });
            bootstrapProc.stderr?.on('data', buf => logWarn('[bootstrap stderr]', String(buf).trimEnd()));

            bootstrapProc.on('error', error => {
                rejectOnce(new Error(`Failed to start bootstrap script: ${String(error)}`));
            });

            bootstrapProc.on('exit', (code, signal) => {
                if (bootstrapCompleted || code === 0) {
                    resolveOnce();
                    return;
                }
                rejectOnce(new Error(`Bootstrap script exited with code=${String(code)} signal=${String(signal)}`));
            });
        });

        nextProc = fork(serverPath, [], {
            cwd: standaloneDir,
            env: createDesktopServerEnv({
                childEnv,
                userDataPath,
                databasePath,
                hostname,
                port,
                logWarn,
            }),
            stdio: 'pipe',
        });

        nextProc.stdout?.on('data', buf => log('[next stdout]', String(buf).trimEnd()));
        nextProc.stderr?.on('data', buf => logWarn('[next stderr]', String(buf).trimEnd()));

        nextProc.on('exit', (code, signal) => {
            logWarn('[electron] Next exited:', code, signal);
            nextProc = null;
        });

        log('[electron] Next running port:', port);

        await waitUntilReady(hostname, port);
        if (portSelection.shouldPersist) {
            persistDesktopServerPort(userDataPath, port, logWarn);
        }

        const url = `http://${hostname}:${port}`;
        log('[electron] Next ready:', url);
        return url;
    }

    async function getAppUrl(): Promise<string> {
        if (cachedServerUrl) return cachedServerUrl;
        if (pendingServerUrlPromise) return pendingServerUrlPromise;

        if (isDev) {
            cachedServerUrl = process.env.ELECTRON_START_URL ?? 'http://localhost:3000';
            return cachedServerUrl;
        }

        pendingServerUrlPromise = (async () => {
            try {
                const url = await startStandaloneServer();
                cachedServerUrl = url;
                return url;
            } finally {
                pendingServerUrlPromise = null;
            }
        })();

        return pendingServerUrlPromise;
    }

    return {
        getAppUrl,
        stopStandaloneServer,
    };
}

function ensureApiBaseUrl(value: string): string {
    return value.endsWith('/api') ? value : `${value}/api`;
}

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

function ensureDesktopSecrets(userDataPath: string, logWarn: LogFn): DesktopSecrets {
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
        }
    }

    return {
        betterAuthSecret,
        dsSecretKey,
    };
}

function createDesktopServerEnv(options: DesktopServerEnvOptions): NodeJS.ProcessEnv {
    const desktopSecrets = ensureDesktopSecrets(options.userDataPath, options.logWarn);
    const env: NodeJS.ProcessEnv = {
        ...options.childEnv,
        DORY_RUNTIME: 'desktop',
        DB_TYPE: 'pglite',
        NEXT_PUBLIC_DORY_RUNTIME: 'desktop',
        PORT: String(options.port),
        HOSTNAME: options.hostname,
        NODE_ENV: 'production',
        PGLITE_DB_PATH: options.databasePath,
        DORY_DESKTOP_USER_DATA_PATH: options.userDataPath,
        DORY_DEMO_RESOURCE_CACHE_DIR: path.join(options.userDataPath, 'demo-resources'),
        BETTER_AUTH_SECRET: desktopSecrets.betterAuthSecret,
        DS_SECRET_KEY: desktopSecrets.dsSecretKey,
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
    };

    if (isBetaDistribution && APP_BASE_URL) {
        const cloudApiBaseUrl = ensureApiBaseUrl(APP_BASE_URL);
        env.DORY_ELECTRON_ORIGIN = APP_BASE_URL;
        env.NEXT_PUBLIC_DORY_ELECTRON_ORIGIN = APP_BASE_URL;
        env.BETTER_AUTH_URL = APP_BASE_URL;
        env.DORY_CLOUD_API_URL = cloudApiBaseUrl;
        env.NEXT_PUBLIC_DORY_CLOUD_API_URL = cloudApiBaseUrl;
    }

    return env;
}

function loadStandaloneEnv(standaloneDir: string): NodeJS.ProcessEnv {
    const envFiles = [path.join(standaloneDir, 'apps/web/.env'), path.join(standaloneDir, 'apps/web/.env.local')];
    const loaded: NodeJS.ProcessEnv = {};

    for (const filePath of envFiles) {
        if (!fs.existsSync(filePath)) {
            continue;
        }

        Object.assign(loaded, parseDotEnv(fs.readFileSync(filePath, 'utf8')));
    }

    return loaded;
}

function parsePortValue(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;

    const port = typeof value === 'number' ? value : Number(value.trim());
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function getDesktopServerConfigPath(userDataPath: string) {
    return path.join(userDataPath, DESKTOP_SERVER_CONFIG_FILE_NAME);
}

function readPersistedDesktopServerPort(userDataPath: string, logWarn: LogFn): number | null {
    const filePath = getDesktopServerConfigPath(userDataPath);
    if (!fs.existsSync(filePath)) return null;

    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { port?: unknown };
        return parsePortValue(raw?.port);
    } catch (error) {
        logWarn('[electron] failed to read desktop server config:', error);
        return null;
    }
}

function persistDesktopServerPort(userDataPath: string, port: number, logWarn: LogFn) {
    try {
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.writeFileSync(
            getDesktopServerConfigPath(userDataPath),
            JSON.stringify(
                {
                    port,
                    updatedAt: new Date().toISOString(),
                },
                null,
                2,
            ),
            { mode: 0o600 },
        );
    } catch (error) {
        logWarn('[electron] failed to persist desktop server port:', error);
    }
}

function canListenOnPort(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer();

        server.once('error', () => resolve(false));

        server.listen(port, host, () => {
            server.close(() => resolve(true));
        });
    });
}

function findAvailablePort(host: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.listen(0, host, () => {
            const { port } = server.address() as AddressInfo;
            server.close(() => resolve(port));
        });

        server.on('error', reject);
    });
}

async function resolveDesktopServerPort(options: {
    childEnv: NodeJS.ProcessEnv;
    userDataPath: string;
    hostname: string;
    logWarn: LogFn;
}): Promise<DesktopServerPortSelection> {
    const envPort = parsePortValue(options.childEnv.DORY_DESKTOP_PORT);
    if (envPort) {
        if (await canListenOnPort(options.hostname, envPort)) {
            return { port: envPort, shouldPersist: false };
        }

        options.logWarn(`[electron] configured DORY_DESKTOP_PORT ${envPort} is unavailable; falling back to stored or ephemeral port`);
    } else if (options.childEnv.DORY_DESKTOP_PORT?.trim()) {
        options.logWarn('[electron] ignoring invalid DORY_DESKTOP_PORT:', options.childEnv.DORY_DESKTOP_PORT);
    }

    const persistedPort = readPersistedDesktopServerPort(options.userDataPath, options.logWarn);
    if (persistedPort) {
        if (await canListenOnPort(options.hostname, persistedPort)) {
            return { port: persistedPort, shouldPersist: false };
        }

        options.logWarn(`[electron] persisted desktop server port ${persistedPort} is unavailable; selecting a new ephemeral port`);
    }

    return {
        port: await findAvailablePort(options.hostname),
        shouldPersist: true,
    };
}

function isPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
            socket.end();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });
}

async function waitUntilReady(host: string, port: number, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isPortOpen(host, port)) return;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Next server startup timed out: ${host}:${port}`);
}
