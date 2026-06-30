import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
    buildLinuxSystemdUnit,
    buildMacLaunchAgentPlist,
    getLocalRuntimeServiceStatus,
    installLocalRuntimeService,
    restartLocalRuntimeService,
    stopLocalRuntimeService,
    uninstallLocalRuntimeService,
    type RunCommand,
} from './local-runtime-service.js';

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify({ code: 0, data }), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

test('service templates do not include bearer tokens', () => {
    const configPath = '/Users/test/.dory/runtime/config.json';
    const plist = buildMacLaunchAgentPlist({
        doryBinPath: '/Users/test/.dory/runtime/runtime/node_modules/.bin/dory',
        configPath,
        stdoutPath: '/Users/test/.dory/runtime/logs/stdout.log',
        stderrPath: '/Users/test/.dory/runtime/logs/stderr.log',
        env: {
            HOME: '/Users/test',
            PATH: '/usr/local/bin:/usr/bin',
            DORY_MCP_TOKEN: 'secret-token',
        },
    });
    const unit = buildLinuxSystemdUnit({
        doryBinPath: '/home/test/.dory/runtime/runtime/node_modules/.bin/dory',
        configPath: '/home/test/.dory/runtime/config.json',
        serviceDir: '/home/test/.dory/runtime',
        stdoutPath: '/home/test/.dory/runtime/logs/stdout.log',
        stderrPath: '/home/test/.dory/runtime/logs/stderr.log',
        env: {
            HOME: '/home/test',
            PATH: '/usr/local/bin:/usr/bin',
            DORY_MCP_TOKEN: 'secret-token',
        },
    });

    assert.ok(plist.includes('com.getdory.runtime'));
    assert.ok(plist.includes('runtime'));
    assert.ok(plist.includes('run'));
    assert.ok(plist.includes('--config'));
    assert.ok(plist.includes(configPath));
    assert.ok(unit.includes('dory-runtime.service') === false);
    assert.ok(unit.includes('ExecStart='));
    assert.ok(unit.includes('runtime'));
    assert.ok(unit.includes('run'));
    assert.ok(unit.includes('--config'));
    assert.equal(plist.includes('secret-token'), false);
    assert.equal(unit.includes('secret-token'), false);
});

test('install writes macOS service files, installs runtime, and starts LaunchAgent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dory-codex-service-mac-'));
    const binDir = join(dir, 'bin');
    await mkdir(binDir, { recursive: true });
    const codexPath = join(binDir, 'codex');
    await writeFile(codexPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ''}`;

    const commands: Array<{ command: string; args: string[] }> = [];
    const runCommand: RunCommand = async (command, args) => {
        commands.push({ command, args });
        return { stdout: '', stderr: '' };
    };
    const fetchFn = async (url: string | URL, init?: RequestInit) => {
        const parsed = new URL(String(url));
        if (parsed.pathname === '/api/mcp/link/start') {
            return jsonResponse({
                requestId: 'request-1',
                authorizeUrl: 'https://dory.test/mcp/authorize?requestId=request-1',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
        }
        if (parsed.pathname === '/api/mcp/link/poll') {
            return jsonResponse({
                status: 'approved',
                token: 'dory_mcp_token',
                record: { tokenPrefix: 'dory_mcp' },
            });
        }
        if (parsed.pathname === '/api/mcp/local-ai/bridges/register') {
            return jsonResponse({ bridge: { id: 'bridge-1', provider: 'codex-agent', name: 'Mac Agent' } });
        }
        throw new Error(`Unexpected URL: ${url} ${String(init?.body ?? '')}`);
    };

    try {
        const result = await installLocalRuntimeService({
            platform: 'darwin',
            homeDir: dir,
            uid: 501,
            codexAgent: true,
            url: 'https://dory.test',
            name: 'Mac Agent',
            codexConfigPath: join(dir, 'mcp.json'),
            mcpHttp: true,
            host: '127.0.0.1',
            port: 3318,
            token: 'dory_mcp_token',
            packageVersion: '0.1.0',
            runCommand,
            fetchFn,
            openUrl: () => undefined,
            pollIntervalMs: 0,
            env: {
                HOME: dir,
                PATH: process.env.PATH,
            },
        });

        assert.equal(result.ok, true);
        assert.ok(commands.some(command => command.command === 'npm' && command.args.includes('@getdory/cli@0.1.0')));
        assert.ok(commands.some(command => command.command === 'launchctl' && command.args[0] === 'bootstrap'));
        assert.ok(commands.some(command => command.command === 'launchctl' && command.args[0] === 'kickstart'));
        const plist = await readFile(join(dir, 'Library', 'LaunchAgents', 'com.getdory.runtime.plist'), 'utf8');
        assert.ok(plist.includes('<string>com.getdory.runtime</string>'));
        assert.ok(plist.includes('<string>runtime</string>'));
        assert.ok(plist.includes('<string>run</string>'));
        assert.ok(plist.includes('<string>--config</string>'));
        assert.equal(plist.includes('dory_mcp_token'), false);
        const configPath = join(dir, '.dory', 'runtime', 'config.json');
        const config = JSON.parse(await readFile(configPath, 'utf8')) as {
            capabilities: {
                codexAgent?: { origin: string; name: string; mcpConfigPath: string };
                mcpHttp?: { host: string; port: number; token: string };
            };
        };
        assert.deepEqual(config.capabilities.codexAgent, {
            enabled: true,
            origin: 'https://dory.test',
            name: 'Mac Agent',
            mcpConfigPath: join(dir, 'mcp.json'),
        });
        assert.deepEqual(config.capabilities.mcpHttp, {
            enabled: true,
            host: '127.0.0.1',
            port: 3318,
            token: 'dory_mcp_token',
        });
        assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    } finally {
        process.env.PATH = previousPath;
    }
});

test('linux service management uses systemctl user service', async () => {
    const homeDir = join(tmpdir(), `dory-codex-service-linux-${Date.now()}`);
    await mkdir(join(homeDir, '.config', 'systemd', 'user'), { recursive: true });
    await writeFile(join(homeDir, '.config', 'systemd', 'user', 'dory-runtime.service'), '[Unit]\n');

    const commands: Array<{ command: string; args: string[] }> = [];
    const runCommand: RunCommand = async (command, args) => {
        commands.push({ command, args });
        if (args.includes('is-active')) return { stdout: 'active\n', stderr: '' };
        return { stdout: '', stderr: '' };
    };

    const status = await getLocalRuntimeServiceStatus({ platform: 'linux', homeDir, runCommand });
    assert.equal(status.installed, true);
    assert.equal(status.running, true);

    await restartLocalRuntimeService({ platform: 'linux', homeDir, runCommand });
    await stopLocalRuntimeService({ platform: 'linux', homeDir, runCommand });
    await uninstallLocalRuntimeService({ platform: 'linux', homeDir, runCommand });

    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user restart dory-runtime.service'));
    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user stop dory-runtime.service'));
    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user disable --now dory-runtime.service'));
    await assert.rejects(() => stat(join(homeDir, '.dory', 'runtime')));
});

test('windows service install is explicitly unsupported', async () => {
    await assert.rejects(() => installLocalRuntimeService({ platform: 'win32' }), /Dory Local Runtime/);
});

test('remote MCP HTTP service install requires explicit token', async () => {
    await assert.rejects(() => installLocalRuntimeService({ platform: 'linux', mcpHttp: true, host: '0.0.0.0', allowRemote: true }), /--token/);
});
