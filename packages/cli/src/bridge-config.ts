import { mkdir, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeDoryTarget } from './bridge-url.js';

export type DoryMcpCredential = {
    endpoint: string;
    token: string;
    tokenPrefix?: string;
    createdAt: string;
};

export type DoryMcpConfig = {
    version: 1;
    credentials: Record<string, DoryMcpCredential>;
};

export type ResolvedCredential = DoryMcpCredential & {
    origin: string;
};

export function getBridgeConfigPath(env: NodeJS.ProcessEnv = process.env) {
    return env.DORY_MCP_CONFIG?.trim() || path.join(os.homedir(), '.dory', 'mcp.json');
}

export function emptyBridgeConfig(): DoryMcpConfig {
    return {
        version: 1,
        credentials: {},
    };
}

export async function readBridgeConfig(configPath = getBridgeConfigPath()): Promise<DoryMcpConfig> {
    try {
        const parsed = JSON.parse(await readFile(configPath, 'utf8')) as Partial<DoryMcpConfig>;
        return {
            version: 1,
            credentials: parsed.credentials && typeof parsed.credentials === 'object' ? (parsed.credentials as Record<string, DoryMcpCredential>) : {},
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyBridgeConfig();
        throw error;
    }
}

export async function writeBridgeConfig(config: DoryMcpConfig, configPath = getBridgeConfigPath()) {
    await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
    const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, configPath);
    await chmod(configPath, 0o600);
}

export async function saveCredential(origin: string, credential: DoryMcpCredential, configPath = getBridgeConfigPath()) {
    const config = await readBridgeConfig(configPath);
    config.credentials[origin] = credential;
    await writeBridgeConfig(config, configPath);
}

export async function removeCredential(origin: string, configPath = getBridgeConfigPath()) {
    const config = await readBridgeConfig(configPath);
    delete config.credentials[origin];
    await writeBridgeConfig(config, configPath);
}

export async function deleteBridgeConfig(configPath = getBridgeConfigPath()) {
    await rm(configPath, { force: true });
}

export async function resolveCredential(url?: string | null, env: NodeJS.ProcessEnv = process.env, configPath = getBridgeConfigPath(env)): Promise<ResolvedCredential | null> {
    const target = normalizeDoryTarget(url ?? env.DORY_MCP_URL);
    const envToken = env.DORY_MCP_TOKEN?.trim();
    if (envToken) {
        return {
            origin: target.origin,
            endpoint: target.endpoint,
            token: envToken,
            tokenPrefix: envToken.slice(0, 17),
            createdAt: new Date().toISOString(),
        };
    }

    const config = await readBridgeConfig(configPath);
    const credential = config.credentials[target.origin];
    return credential
        ? {
              origin: target.origin,
              ...credential,
              endpoint: credential.endpoint || target.endpoint,
          }
        : null;
}
