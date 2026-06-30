#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { inspect } from 'node:util';

import * as serverCore from '@dory/server-core';

import { readActionInput } from './action-input.js';
import { parseArgs, type ProfileOptions } from './args.js';
import { login } from './bridge-auth.js';
import { getBridgeConfigPath, removeCredential, resolveCredential } from './bridge-config.js';
import { createRemoteMcpClient } from './bridge-remote.js';
import { normalizeDoryTarget } from './bridge-url.js';
import { startBridge } from './bridge.js';
import { LOCAL_AI_SCOPES, startCodexAgentBridge } from './local-codex-agent.js';
import {
    getLocalRuntimeServiceStatus,
    installLocalRuntimeService,
    restartLocalRuntimeService,
    stopLocalRuntimeService,
    uninstallLocalRuntimeService,
} from './local-codex-service.js';

function printHelp() {
    console.log(`Dory CLI / Dory Headless Runtime

Usage:
  dory mcp serve --stdio --data standalone
  dory mcp serve --http --host 127.0.0.1 --port 3318 --data standalone
  dory action connection.list --data standalone --projection mcp --json '{}'

  dory doctor --data standalone|desktop|self-hosted
  dory init --data standalone|desktop|self-hosted

  dory agent codex install --url <dory-origin>
  dory runtime run
  dory runtime status
  dory runtime restart

  dory storage detect --data standalone|desktop|self-hosted
  dory storage doctor --data standalone|desktop|self-hosted

  dory action list --data desktop|standalone|self-hosted
  dory action describe <action-id> --data desktop|standalone|self-hosted
  dory action <action-id> --json '<json>' --data desktop|standalone|self-hosted
  dory action <action-id> --input input.json --data desktop|standalone|self-hosted

  dory mcp serve --stdio --data desktop|standalone|self-hosted
  dory mcp serve --http --host 127.0.0.1 --port 3318 --data desktop|standalone|self-hosted
  dory mcp serve --http --host 0.0.0.0 --allow-remote --token <existing-token> --data standalone

  dory mcp token create [--name <name>] --data desktop|standalone|self-hosted
  dory mcp token list --data desktop|standalone|self-hosted
  dory mcp token revoke --id <token-id> --data desktop|standalone|self-hosted

Hosted Dory bridge compatibility:
  dory mcp bridge --url <dory-origin>
  dory mcp login --url <dory-origin>
  dory mcp status --url <dory-origin>
  dory mcp logout --url <dory-origin>

Local Codex Agent:
  dory agent codex install --url <dory-origin>
  dory agent codex status
  dory agent codex restart
  dory agent codex stop
  dory agent codex uninstall
  dory agent codex run --url <dory-origin>    Debug foreground worker.

Data modes:
  --data standalone    Use independent ~/.dory app storage
  --data desktop       Use Dory Desktop local data without opening the app
  --data self-hosted   Use self-hosted Web Postgres app storage via --database-url

HTTP MCP:
  HTTP listens on 127.0.0.1 by default and requires bearer auth.
  Remote binds require --host 0.0.0.0 --allow-remote --token <existing-token>.
  Put public deployments behind a TLS reverse proxy.

Storage overrides:
  --user-data-dir <path>    Override Electron/headless userData directory
  --pglite-path <path>      Override PGlite app storage path
  --database-url <url>      Use Postgres for self-hosted Dory app storage
`);
}

function printJson(value: unknown) {
    console.log(JSON.stringify(value, null, 2));
}

function publicProfile(profile: ReturnType<typeof serverCore.resolveDoryStorageProfile>) {
    const { dsSecretKey: _dsSecretKey, betterAuthSecret: _betterAuthSecret, profile: _profile, ...rest } = profile;
    const data = profile.profile === 'desktop' ? 'desktop' : profile.dbType === 'postgres' ? 'self-hosted' : 'standalone';
    return {
        data,
        ...rest,
        secrets: {
            dsSecretKey: profile.dsSecretKey ? 'configured' : 'missing',
            betterAuthSecret: profile.betterAuthSecret ? 'configured' : 'missing',
        },
    };
}

function formatError(error: unknown) {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    return {
        message: error instanceof Error ? error.message : String(error),
        code: typeof record.code === 'string' ? record.code : undefined,
        status: typeof record.status === 'number' ? record.status : undefined,
        details: record.details,
    };
}

function dataMode(args: ProfileOptions) {
    return args.data ?? (args.databaseUrl ? 'self-hosted' : 'standalone');
}

function validateSelfHostedOptions(args: ProfileOptions) {
    if (dataMode(args) !== 'self-hosted') return;
    if (!args.databaseUrl) throw new Error('--data self-hosted requires --database-url.');
    if (!process.env.DS_SECRET_KEY) throw new Error('--data self-hosted requires DS_SECRET_KEY to match the Web deployment.');
    if (!process.env.BETTER_AUTH_SECRET) throw new Error('--data self-hosted requires BETTER_AUTH_SECRET to match the Web deployment.');
}

function bootstrapOptions(args: ProfileOptions) {
    const data = dataMode(args);
    validateSelfHostedOptions(args);
    const profile: 'desktop' | 'headless' = data === 'desktop' ? 'desktop' : 'headless';

    return {
        profile,
        userDataDir: args.userDataDir,
        pglitePath: args.pglitePath,
        databaseUrl: args.databaseUrl,
    };
}

function isLocalRuntimeDataMode(args: ProfileOptions) {
    return dataMode(args) !== 'self-hosted';
}

function runtimeCliDataArgs(args: ProfileOptions) {
    const out: string[] = ['--data', dataMode(args)];
    if (args.userDataDir) out.push('--user-data-dir', args.userDataDir);
    if (args.pglitePath) out.push('--pglite-path', args.pglitePath);
    return out;
}

async function waitForLocalRuntime(args: ProfileOptions) {
    for (let attempt = 0; attempt < 75; attempt += 1) {
        const state = await serverCore.readDoryLocalRuntimeState(bootstrapOptions(args));
        if (state && (await serverCore.probeDoryLocalRuntime(state))) {
            return state;
        }
        await sleep(200);
    }
    throw new Error('Timed out waiting for Dory Local Runtime to start.');
}

async function ensureLocalRuntime(args: ProfileOptions) {
    const existing = await serverCore.readDoryLocalRuntimeState(bootstrapOptions(args));
    if (existing && (await serverCore.probeDoryLocalRuntime(existing))) {
        return existing;
    }

    const child = spawn(process.execPath, [process.argv[1]!, 'runtime', 'run', ...runtimeCliDataArgs(args)], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
    });
    child.unref();
    return waitForLocalRuntime(args);
}

async function localRuntimeRequest<T>(args: ProfileOptions, path: string, options: { method?: string; body?: unknown } = {}) {
    const state = await ensureLocalRuntime(args);
    return serverCore.callDoryLocalRuntime<T>(state, path, options);
}

async function ensureLocalRuntimeMcpCredential(args: ProfileOptions) {
    const state = await ensureLocalRuntime(args);
    const created = await serverCore.callDoryLocalRuntime<{
        ok: true;
        token: string;
        tokenRecord: { tokenPrefix?: string | null };
    }>(state, '/api/runtime/mcp-token/create', { method: 'POST', body: { name: 'Dory Local Runtime CLI' } });
    return {
        endpoint: `${state.baseUrl}/api/mcp`,
        token: created.token,
        tokenPrefix: created.tokenRecord.tokenPrefix ?? created.token.slice(0, 17),
    };
}

type DoctorCheck = {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    details?: Record<string, unknown>;
};

type DoctorStorage =
    | ReturnType<typeof publicProfile>
    | {
          data: 'self-hosted';
          dbType: 'postgres';
          databaseUrl: 'configured' | 'missing';
          secrets: {
              dsSecretKey: 'configured' | 'missing';
              betterAuthSecret: 'configured' | 'missing';
          };
      };

function doctorCheck(name: string, status: DoctorCheck['status'], message: string, details?: Record<string, unknown>): DoctorCheck {
    return details ? { name, status, message, details } : { name, status, message };
}

function nodeMajor() {
    return Number(process.versions.node.split('.')[0] ?? '0');
}

async function runDoctor(args: ProfileOptions) {
    const checks: DoctorCheck[] = [];
    const data = dataMode(args);
    checks.push(doctorCheck('product', 'pass', 'Dory CLI / Dory Headless Runtime'));
    checks.push(doctorCheck('platform', 'pass', `${process.platform} ${process.arch}`));
    checks.push(nodeMajor() >= 20 ? doctorCheck('node', 'pass', process.version) : doctorCheck('node', 'fail', `Node >=20 is required, found ${process.version}`));
    checks.push(doctorCheck('data_mode', 'pass', data));

    if (data === 'self-hosted') {
        checks.push(args.databaseUrl ? doctorCheck('database_url', 'pass', '--database-url configured') : doctorCheck('database_url', 'fail', '--data self-hosted requires --database-url'));
        checks.push(process.env.DS_SECRET_KEY ? doctorCheck('ds_secret_key', 'pass', 'DS_SECRET_KEY configured') : doctorCheck('ds_secret_key', 'fail', 'DS_SECRET_KEY must match the Web deployment'));
        checks.push(
            process.env.BETTER_AUTH_SECRET
                ? doctorCheck('better_auth_secret', 'pass', 'BETTER_AUTH_SECRET configured')
                : doctorCheck('better_auth_secret', 'fail', 'BETTER_AUTH_SECRET must match the Web deployment'),
        );
    }

    let storage: DoctorStorage | null = null;
    let identity: Awaited<ReturnType<typeof serverCore.bootstrapDoryRuntime>>['identity'] | null = null;
    let counts: { connections: number; mcpTokens: number } | null = null;
    const canBootstrap = !checks.some(check => check.status === 'fail');
    let detectedProfile: ReturnType<typeof serverCore.resolveDoryStorageProfile> | null = null;

    if (data === 'self-hosted' && !args.databaseUrl) {
        storage = {
            data: 'self-hosted',
            dbType: 'postgres',
            databaseUrl: 'missing',
            secrets: {
                dsSecretKey: process.env.DS_SECRET_KEY ? 'configured' : 'missing',
                betterAuthSecret: process.env.BETTER_AUTH_SECRET ? 'configured' : 'missing',
            },
        };
    } else {
        try {
            const options = canBootstrap ? bootstrapOptions(args) : { profile: data === 'desktop' ? ('desktop' as const) : ('headless' as const), userDataDir: args.userDataDir, pglitePath: args.pglitePath, databaseUrl: args.databaseUrl };
            detectedProfile = serverCore.resolveDoryStorageProfile(options);
            storage = publicProfile(detectedProfile);
            checks.push(doctorCheck('user_data_dir', detectedProfile.existed.userDataDir ? 'pass' : 'warn', detectedProfile.userDataDir, { exists: detectedProfile.existed.userDataDir }));
            if (detectedProfile.dbType === 'pglite') {
                checks.push(doctorCheck('pglite_path', detectedProfile.existed.pglitePath ? 'pass' : 'warn', detectedProfile.pglitePath ?? '', { exists: detectedProfile.existed.pglitePath }));
            } else {
                checks.push(doctorCheck('postgres_storage', 'pass', 'Using Postgres app storage'));
            }
            checks.push(doctorCheck('secrets', detectedProfile.existed.secretsPath ? 'pass' : 'warn', detectedProfile.secretsPath, { exists: detectedProfile.existed.secretsPath }));
        } catch (error) {
            checks.push(doctorCheck('storage_detect', 'fail', error instanceof Error ? error.message : String(error)));
        }
    }

    if (canBootstrap && isLocalRuntimeDataMode(args)) {
        try {
            const state = await ensureLocalRuntime(args);
            const info = await serverCore.callDoryLocalRuntime<{
                ok: true;
                identity: Awaited<ReturnType<typeof serverCore.bootstrapDoryRuntime>>['identity'];
            }>(state, '/api/runtime/info');
            identity = info.identity;
            checks.push(doctorCheck('local_runtime', 'pass', `Dory Local Runtime is running at ${state.baseUrl}`, { pid: state.pid }));
            checks.push(doctorCheck('identity', 'pass', 'Active identity resolved', identity));
        } catch (error) {
            checks.push(doctorCheck('local_runtime', 'fail', error instanceof Error ? error.message : String(error)));
        }
    } else if (canBootstrap) {
        try {
            const runtime = await serverCore.bootstrapDoryRuntime(bootstrapOptions(args));
            try {
                identity = runtime.identity;
                counts = {
                    connections: (await runtime.db.connections.list(runtime.identity.organizationId)).length,
                    mcpTokens: (await runtime.db.mcp.listTokens(runtime.identity.organizationId)).length,
                };
                if (detectedProfile?.dbType === 'pglite' && detectedProfile.pglitePath && storage && 'existed' in storage) {
                    const pgliteExists = existsSync(detectedProfile.pglitePath);
                    storage.existed.pglitePath = pgliteExists;
                    const pgliteCheck = checks.find(check => check.name === 'pglite_path');
                    if (pgliteCheck) {
                        pgliteCheck.status = pgliteExists ? 'pass' : 'warn';
                        pgliteCheck.details = { exists: pgliteExists };
                    }
                }
                checks.push(doctorCheck('bootstrap', 'pass', 'Runtime bootstrap and migrations completed'));
                checks.push(doctorCheck('identity', 'pass', 'Active identity resolved', identity));
                checks.push(doctorCheck('mcp_tokens', 'pass', `${counts.mcpTokens} token(s)`));
                checks.push(doctorCheck('connections', 'pass', `${counts.connections} connection(s)`));
            } finally {
                await serverCore.shutdownDoryRuntime();
            }
        } catch (error) {
            checks.push(doctorCheck('bootstrap', 'fail', error instanceof Error ? error.message : String(error)));
        }
    }

    const ok = !checks.some(check => check.status === 'fail');
    printJson({ ok, product: 'Dory CLI / Dory Headless Runtime', storage, identity, counts, checks });
    if (!ok) process.exitCode = 1;
}

async function runHostedBridgeCommand(args: Extract<ReturnType<typeof parseArgs>, { command: 'mcp-bridge' | 'mcp-login' | 'mcp-logout' | 'mcp-status' }>) {
    const configPath = args.configPath ?? getBridgeConfigPath();
    const target = normalizeDoryTarget(args.url);

    if (args.command === 'mcp-login') {
        printJson(
            await login({
                url: args.url,
                clientName: args.clientName,
                configPath,
                scopes: LOCAL_AI_SCOPES,
            }),
        );
        return;
    }

    if (args.command === 'mcp-logout') {
        await removeCredential(target.origin, configPath);
        printJson({ ok: true, origin: target.origin });
        return;
    }

    const credential = await resolveCredential(args.url, process.env, configPath);
    if (!credential) {
        throw new Error(`No Dory MCP credential found for ${target.origin}. Run: dory mcp login --url ${target.origin}`);
    }

    if (args.command === 'mcp-status') {
        const remote = await createRemoteMcpClient(credential.endpoint, credential.token);
        try {
            const tools = await remote.client.listTools();
            printJson({
                ok: true,
                origin: credential.origin,
                endpoint: credential.endpoint,
                tokenPrefix: credential.tokenPrefix,
                tools: tools.tools.map(tool => tool.name),
            });
        } finally {
            await remote.close().catch(() => undefined);
        }
        return;
    }

    await startBridge({
        endpoint: credential.endpoint,
        token: credential.token,
    });
}

async function ensureServeAuth(runtime: Awaited<ReturnType<typeof serverCore.bootstrapDoryRuntime>>, token?: string | null) {
    if (token) {
        return (await serverCore.authenticateDoryMcpToken(runtime.db, token)).auth;
    }

    const existing = await serverCore.getFirstActiveDoryMcpToken(runtime.db, runtime.identity.organizationId, runtime.identity.userId);
    if (existing) {
        return serverCore.buildDoryMcpAuthContextForTokenRecord(runtime.db, existing);
    }

    const created = await serverCore.createDoryMcpToken({
        db: runtime.db,
        organizationId: runtime.identity.organizationId,
        userId: runtime.identity.userId,
        name: 'Dory Headless MCP',
    });
    process.stderr.write(`Created local Dory MCP token for this data mode. Save it for HTTP clients:\n${created.token}\n\n`);
    return serverCore.buildDoryMcpAuthContextForTokenRecord(runtime.db, created.record);
}

async function runActionCommand(args: Extract<ReturnType<typeof parseArgs>, { command: 'action-list' | 'action-describe' | 'action-run' }>) {
    try {
        if (args.command === 'action-list') {
            printJson({ ok: true, actions: serverCore.listDoryActions() });
            return;
        }

        if (args.command === 'action-describe') {
            const action = serverCore.getDoryAction(args.actionId);
            if (!action) throw Object.assign(new Error(`Unknown action: ${args.actionId}`), { code: 'ACTION_NOT_FOUND', status: 404 });
            printJson({ ok: true, action });
            return;
        }

        const action = serverCore.getDoryAction(args.options.actionId);
        if (!action) throw Object.assign(new Error(`Unknown action: ${args.options.actionId}`), { code: 'ACTION_NOT_FOUND', status: 404 });
        if ((action.risk === 'write' || action.risk === 'destructive') && !args.options.yes) {
            throw Object.assign(new Error(`Action "${action.id}" has ${action.risk} risk. Re-run with --yes to execute it.`), {
                code: 'ACTION_CONFIRMATION_REQUIRED',
                status: 403,
            });
        }

        const input = await readActionInput({ json: args.options.json, input: args.options.input });
        if (isLocalRuntimeDataMode(args.options)) {
            const result = await localRuntimeRequest(args.options, '/api/runtime/action', {
                method: 'POST',
                body: {
                    actionId: action.id,
                    input,
                    projection: args.options.projection,
                    confirmationToken: args.options.yes ? 'cli-confirmed' : null,
                },
            });
            printJson(result);
            return;
        }

        const runtime = await serverCore.bootstrapDoryRuntime(bootstrapOptions(args.options));
        try {
            const actionCtx = await serverCore.createHeadlessUserActionContext({
                db: runtime.db,
                userId: runtime.identity.userId,
                organizationId: runtime.identity.organizationId,
            });
            const result = await serverCore.executeDoryAction(actionCtx, action.id, input, {
                projection: args.options.projection,
                confirmationToken: args.options.yes ? 'cli-confirmed' : null,
            });
            printJson({ ok: true, ...result });
        } finally {
            await serverCore.shutdownDoryRuntime();
        }
    } catch (error) {
        printJson({ ok: false, error: formatError(error) });
        process.exitCode = 1;
    }
}

async function run() {
    const args = parseArgs(process.argv.slice(2));

    if (args.command === 'help') {
        printHelp();
        return;
    }

    if (args.command === 'mcp-bridge' || args.command === 'mcp-login' || args.command === 'mcp-logout' || args.command === 'mcp-status') {
        await runHostedBridgeCommand(args);
        return;
    }

    if (args.command === 'doctor') {
        await runDoctor(args);
        return;
    }

    if (args.command === 'storage') {
        if (args.action === 'detect') {
            const profile = serverCore.resolveDoryStorageProfile(bootstrapOptions(args));
            printJson({ ok: true, storage: publicProfile(profile) });
            return;
        }
        await runDoctor(args);
        return;
    }

    if (args.command === 'init') {
        if (isLocalRuntimeDataMode(args)) {
            const info = await localRuntimeRequest(args, '/api/runtime/info');
            const created = await localRuntimeRequest(args, '/api/runtime/mcp-token/create', {
                method: 'POST',
                body: { name: 'Dory Headless MCP' },
            });
            printJson({
                ok: true,
                runtime: info,
                token: created,
            });
            return;
        }

        const runtime = await serverCore.bootstrapDoryRuntime(bootstrapOptions(args));
        const activeToken = await serverCore.getFirstActiveDoryMcpToken(runtime.db, runtime.identity.organizationId, runtime.identity.userId);
        const created =
            activeToken ??
            (
                await serverCore.createDoryMcpToken({
                    db: runtime.db,
                    organizationId: runtime.identity.organizationId,
                    userId: runtime.identity.userId,
                    name: 'Dory Headless MCP',
                })
            ).record;
        printJson({
            ok: true,
            storage: publicProfile(runtime.profile),
            identity: runtime.identity,
            tokenRecord: {
                id: created.id,
                name: created.name,
                tokenPrefix: created.tokenPrefix,
                enabled: created.enabled,
                createdAt: created.createdAt,
            },
        });
        await serverCore.shutdownDoryRuntime();
        return;
    }

    if (args.command === 'action-list' || args.command === 'action-describe' || args.command === 'action-run') {
        await runActionCommand(args);
        return;
    }

    if (args.command === 'runtime') {
        if (args.options.action === 'run') {
            await serverCore.startDoryLocalRuntimeServer({
                ...bootstrapOptions(args.options),
                host: args.options.host,
                port: args.options.port,
                onReady: state => {
                    process.stderr.write(`Dory Local Runtime listening at ${state.baseUrl}\n`);
                },
            });
            if (args.options.url || args.options.configPath) {
                void startCodexAgentBridge({
                    url: args.options.url,
                    name: args.options.name,
                    configPath: args.options.configPath,
                }).catch(error => {
                    process.stderr.write(`Dory Codex Agent capability failed: ${error instanceof Error ? error.message : String(error)}\n`);
                });
            }
            await new Promise<void>(() => {});
            return;
        }
        if (args.options.action === 'status') {
            const service = await getLocalRuntimeServiceStatus(args.options);
            const state = await serverCore.readDoryLocalRuntimeState(bootstrapOptions(args.options));
            printJson({
                ...service,
                runtime: state
                    ? {
                          running: await serverCore.probeDoryLocalRuntime(state),
                          endpoint: state.baseUrl,
                          pid: state.pid,
                      }
                    : {
                          running: false,
                          endpoint: null,
                          pid: null,
                      },
            });
            return;
        }
        if (args.options.action === 'restart') {
            printJson(await restartLocalRuntimeService(args.options));
            return;
        }
        if (args.options.action === 'stop') {
            printJson(await stopLocalRuntimeService(args.options));
            return;
        }
        if (args.options.action === 'uninstall') {
            printJson(await uninstallLocalRuntimeService(args.options));
            return;
        }
        return;
    }

    if (args.command === 'agent-codex') {
        if (args.options.action === 'run') {
            await startCodexAgentBridge({
                url: args.options.url,
                name: args.options.name,
                configPath: args.options.configPath,
            });
            return;
        }
        if (args.options.action === 'install') {
            printJson(await installLocalRuntimeService(args.options));
            return;
        }
        if (args.options.action === 'status') {
            printJson(await getLocalRuntimeServiceStatus(args.options));
            return;
        }
        if (args.options.action === 'restart') {
            printJson(await restartLocalRuntimeService(args.options));
            return;
        }
        if (args.options.action === 'stop') {
            printJson(await stopLocalRuntimeService(args.options));
            return;
        }
        if (args.options.action === 'uninstall') {
            printJson(await uninstallLocalRuntimeService(args.options));
            return;
        }
        return;
    }

    if (args.command === 'mcp-token') {
        if (isLocalRuntimeDataMode(args)) {
            if (args.action === 'create') {
                const created = await localRuntimeRequest(args, '/api/runtime/mcp-token/create', {
                    method: 'POST',
                    body: { name: args.name ?? 'Dory MCP' },
                });
                printJson(created);
                return;
            }
            if (args.action === 'revoke') {
                if (!args.id) throw new Error('Missing token id.');
                printJson(await localRuntimeRequest(args, '/api/runtime/mcp-token/revoke', { method: 'POST', body: { id: args.id } }));
                return;
            }
            printJson(await localRuntimeRequest(args, '/api/runtime/mcp-token/list'));
            return;
        }

        const runtime = await serverCore.bootstrapDoryRuntime(bootstrapOptions(args));
        if (args.action === 'create') {
            const created = await serverCore.createDoryMcpToken({
                db: runtime.db,
                organizationId: runtime.identity.organizationId,
                userId: runtime.identity.userId,
                name: args.name ?? 'Dory MCP',
            });
            printJson({ ok: true, token: created.token, tokenRecord: created.record });
            await serverCore.shutdownDoryRuntime();
            return;
        }
        if (args.action === 'revoke') {
            if (!args.id) throw new Error('Missing token id.');
            printJson({ ok: true, revoked: await runtime.db.mcp.revokeToken(runtime.identity.organizationId, args.id) });
            await serverCore.shutdownDoryRuntime();
            return;
        }
        printJson({
            ok: true,
            tokens: (await runtime.db.mcp.listTokens(runtime.identity.organizationId)).map((token: Awaited<ReturnType<typeof runtime.db.mcp.listTokens>>[number]) => ({
                id: token.id,
                name: token.name,
                tokenPrefix: token.tokenPrefix,
                enabled: token.enabled,
                createdAt: token.createdAt,
                revokedAt: token.revokedAt ?? null,
                lastUsedAt: token.lastUsedAt ?? null,
            })),
        });
        await serverCore.shutdownDoryRuntime();
        return;
    }

    if (args.command === 'mcp-serve') {
        if (isLocalRuntimeDataMode(args.options)) {
            if (args.options.transport === 'http') {
                const credential = await ensureLocalRuntimeMcpCredential(args.options);
                printJson({
                    ok: true,
                    endpoint: credential.endpoint,
                    tokenPrefix: credential.tokenPrefix,
                });
                return;
            }

            const credential = await ensureLocalRuntimeMcpCredential(args.options);
            await startBridge({
                endpoint: credential.endpoint,
                token: credential.token,
            });
            return;
        }

        const runtime = await serverCore.bootstrapDoryRuntime(bootstrapOptions(args.options));
        try {
            const auth = await ensureServeAuth(runtime, args.options.token ?? null);

            if (args.options.transport === 'http') {
                if (args.options.host === '0.0.0.0' && !args.options.token) {
                    throw new Error('HTTP remote bind requires --token <existing-token>. Create one with dory mcp token create first.');
                }
                await serverCore.startDoryMcpHttpServer({
                    host: args.options.host,
                    port: args.options.port,
                    origin: args.options.origin,
                    allowRemote: args.options.allowRemote,
                    allowedOrigins: [
                        ...(process.env.TRUSTED_ORIGINS ?? '')
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean),
                    ],
                    context: {
                        db: runtime.db,
                        tokenAuthFallback: auth,
                    },
                });
                return;
            }

            await serverCore.serveDoryMcpStdio({
                db: runtime.db,
                auth,
                requestOrigin: args.options.origin ?? null,
            });
        } finally {
            if (args.options.transport === 'stdio') {
                await serverCore.shutdownDoryRuntime();
            }
        }
        return;
    }

    throw new Error(`Unsupported command: ${inspect(args)}`);
}

run().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
