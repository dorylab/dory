import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
    buildLinuxSystemdUnit,
    buildMacLaunchAgentPlist,
    getCodexAgentServiceStatus,
    installCodexAgentService,
    restartCodexAgentService,
    stopCodexAgentService,
    uninstallCodexAgentService,
    type RunCommand,
} from './local-codex-service.js';

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify({ code: 0, data }), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function serviceConfig() {
    return {
        version: 1 as const,
        origin: 'https://dory.test',
        name: 'Dory Codex Agent',
        mcpConfigPath: '/tmp/dory-mcp.json',
        installedAt: '2026-01-01T00:00:00.000Z',
    };
}

test('service templates do not include bearer tokens', () => {
    const config = serviceConfig();
    const plist = buildMacLaunchAgentPlist({
        doryBinPath: '/Users/test/.dory/agent/codex/runtime/node_modules/.bin/dory',
        config,
        stdoutPath: '/Users/test/.dory/agent/codex/logs/stdout.log',
        stderrPath: '/Users/test/.dory/agent/codex/logs/stderr.log',
        env: {
            HOME: '/Users/test',
            PATH: '/usr/local/bin:/usr/bin',
            DORY_MCP_TOKEN: 'secret-token',
        },
    });
    const unit = buildLinuxSystemdUnit({
        doryBinPath: '/home/test/.dory/agent/codex/runtime/node_modules/.bin/dory',
        config,
        serviceDir: '/home/test/.dory/agent/codex',
        stdoutPath: '/home/test/.dory/agent/codex/logs/stdout.log',
        stderrPath: '/home/test/.dory/agent/codex/logs/stderr.log',
        env: {
            HOME: '/home/test',
            PATH: '/usr/local/bin:/usr/bin',
            DORY_MCP_TOKEN: 'secret-token',
        },
    });

    assert.ok(plist.includes('agent'));
    assert.ok(plist.includes('codex'));
    assert.ok(plist.includes('run'));
    assert.ok(unit.includes('ExecStart='));
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
        const result = await installCodexAgentService({
            platform: 'darwin',
            homeDir: dir,
            uid: 501,
            url: 'https://dory.test',
            name: 'Mac Agent',
            configPath: join(dir, 'mcp.json'),
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
        const plist = await readFile(join(dir, 'Library', 'LaunchAgents', 'com.getdory.codex-agent.plist'), 'utf8');
        assert.ok(plist.includes('<string>run</string>'));
        assert.equal(plist.includes('dory_mcp_token'), false);
    } finally {
        process.env.PATH = previousPath;
    }
});

test('linux service management uses systemctl user service', async () => {
    const homeDir = join(tmpdir(), `dory-codex-service-linux-${Date.now()}`);
    await mkdir(join(homeDir, '.config', 'systemd', 'user'), { recursive: true });
    await writeFile(join(homeDir, '.config', 'systemd', 'user', 'dory-codex-agent.service'), '[Unit]\n');

    const commands: Array<{ command: string; args: string[] }> = [];
    const runCommand: RunCommand = async (command, args) => {
        commands.push({ command, args });
        if (args.includes('is-active')) return { stdout: 'active\n', stderr: '' };
        return { stdout: '', stderr: '' };
    };

    const status = await getCodexAgentServiceStatus({ platform: 'linux', homeDir, runCommand });
    assert.equal(status.installed, true);
    assert.equal(status.running, true);

    await restartCodexAgentService({ platform: 'linux', homeDir, runCommand });
    await stopCodexAgentService({ platform: 'linux', homeDir, runCommand });
    await uninstallCodexAgentService({ platform: 'linux', homeDir, runCommand });

    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user restart dory-codex-agent.service'));
    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user stop dory-codex-agent.service'));
    assert.ok(commands.some(command => command.command === 'systemctl' && command.args.join(' ') === '--user disable --now dory-codex-agent.service'));
    await assert.rejects(() => stat(join(homeDir, '.dory', 'agent', 'codex')));
});

test('windows service install is explicitly unsupported', async () => {
    await assert.rejects(() => installCodexAgentService({ platform: 'win32' }), /macOS and Linux/);
});
