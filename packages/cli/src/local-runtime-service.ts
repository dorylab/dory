import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import type { DataMode } from './args.js';
import { getBridgeConfigPath } from './bridge-config.js';
import { normalizeDoryTarget } from './bridge-url.js';
import { prepareCodexAgentBridge, type CodexAgentOptions } from './local-codex-agent.js';

const SERVICE_LABEL = 'com.getdory.runtime';
const SYSTEMD_SERVICE_NAME = 'dory-runtime.service';
const SERVICE_CONFIG_VERSION = 1;

type CommandResult = {
    stdout: string;
    stderr: string;
};

export type RunCommand = (command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; rejectOnError?: boolean }) => Promise<CommandResult>;

export type RuntimeServiceOptions = {
    codexAgent?: boolean;
    url?: string;
    name?: string;
    codexConfigPath?: string;
    mcpHttp?: boolean;
    host?: string;
    port?: number;
    origin?: string;
    token?: string;
    allowRemote?: boolean;
    data?: DataMode;
    userDataDir?: string;
    pglitePath?: string;
    databaseUrl?: string;
    platform?: NodeJS.Platform;
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    uid?: number;
    runCommand?: RunCommand;
    packageVersion?: string;
} & Pick<CodexAgentOptions, 'fetchFn' | 'openUrl' | 'pollIntervalMs'>;

type RuntimeServicePaths = {
    serviceDir: string;
    runtimeDir: string;
    configPath: string;
    logDir: string;
    stdoutPath: string;
    stderrPath: string;
    doryBinPath: string;
    launchAgentPath: string;
    systemdUnitPath: string;
};

export type RuntimeServiceConfig = {
    version: 1;
    installedAt: string;
    data?: DataMode;
    userDataDir?: string;
    pglitePath?: string;
    databaseUrl?: string;
    capabilities: {
        codexAgent?: {
            enabled: true;
            origin: string;
            name: string;
            mcpConfigPath: string;
        };
        mcpHttp?: {
            enabled: true;
            host: string;
            port: number;
            origin?: string;
            token?: string;
            allowRemote?: boolean;
        };
    };
};

export async function readLocalRuntimeServiceConfig(configPath: string): Promise<RuntimeServiceConfig> {
    const parsed = JSON.parse(await readFile(configPath, 'utf8')) as Partial<RuntimeServiceConfig>;
    if (parsed.version !== SERVICE_CONFIG_VERSION || !parsed.capabilities) {
        throw new Error(`Invalid Dory Local Runtime service config: ${configPath}`);
    }
    return parsed as RuntimeServiceConfig;
}

export async function writeLocalRuntimeServiceConfig(configPath: string, config: RuntimeServiceConfig) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function updateLocalRuntimeServiceMcpHttpToken(configPath: string, token: string) {
    const config = await readLocalRuntimeServiceConfig(configPath);
    if (!config.capabilities.mcpHttp) {
        throw new Error(`Dory Local Runtime service config does not enable HTTP MCP: ${configPath}`);
    }
    config.capabilities.mcpHttp.token = token;
    await writeLocalRuntimeServiceConfig(configPath, config);
    return config;
}

function defaultRunCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; rejectOnError?: boolean } = {}): Promise<CommandResult> {
    return new Promise((resolveCommand, rejectCommand) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: {
                ...process.env,
                ...(options.env ?? {}),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => {
            stdout += String(chunk);
        });
        child.stderr.on('data', chunk => {
            stderr += String(chunk);
        });
        child.on('error', rejectCommand);
        child.on('close', code => {
            if ((options.rejectOnError ?? true) && code !== 0) {
                rejectCommand(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}`));
                return;
            }
            resolveCommand({ stdout, stderr });
        });
    });
}

function xmlEscape(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function systemdQuote(value: string) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

function serviceEnv(options: RuntimeServiceOptions) {
    return options.env ?? process.env;
}

function servicePlatform(options: RuntimeServiceOptions) {
    return options.platform ?? process.platform;
}

function serviceHomeDir(options: RuntimeServiceOptions) {
    return options.homeDir ?? homedir();
}

function serviceUid(options: RuntimeServiceOptions) {
    const uid = options.uid ?? process.getuid?.();
    if (typeof uid !== 'number') {
        throw new Error('Dory Local Runtime service installation requires a POSIX user id.');
    }
    return uid;
}

export function getLocalRuntimeServicePaths(options: RuntimeServiceOptions = {}): RuntimeServicePaths {
    const home = serviceHomeDir(options);
    const serviceDir = join(home, '.dory', 'runtime');
    const runtimeDir = join(serviceDir, 'runtime');
    const logDir = join(serviceDir, 'logs');
    return {
        serviceDir,
        runtimeDir,
        configPath: join(serviceDir, 'config.json'),
        logDir,
        stdoutPath: join(logDir, 'stdout.log'),
        stderrPath: join(logDir, 'stderr.log'),
        doryBinPath: join(runtimeDir, 'node_modules', '.bin', 'dory'),
        launchAgentPath: join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`),
        systemdUnitPath: join(home, '.config', 'systemd', 'user', SYSTEMD_SERVICE_NAME),
    };
}

function buildServiceArgs(input: { configPath: string }) {
    return ['runtime', 'run', '--config', input.configPath];
}

export function buildMacLaunchAgentPlist(input: { doryBinPath: string; configPath: string; stdoutPath: string; stderrPath: string; env?: NodeJS.ProcessEnv }) {
    const env = input.env ?? process.env;
    const programArguments = [input.doryBinPath, ...buildServiceArgs({ configPath: input.configPath })];
    const envVars = {
        HOME: env.HOME ?? homedir(),
        PATH: env.PATH ?? '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${programArguments.map(arg => `        <string>${xmlEscape(arg)}</string>`).join('\n')}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${Object.entries(envVars)
    .map(([key, value]) => `        <key>${xmlEscape(key)}</key>\n        <string>${xmlEscape(value)}</string>`)
    .join('\n')}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xmlEscape(input.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(input.stderrPath)}</string>
</dict>
</plist>
`;
}

export function buildLinuxSystemdUnit(input: { doryBinPath: string; configPath: string; serviceDir: string; stdoutPath: string; stderrPath: string; env?: NodeJS.ProcessEnv }) {
    const env = input.env ?? process.env;
    const execStart = [input.doryBinPath, ...buildServiceArgs({ configPath: input.configPath })].map(systemdQuote).join(' ');
    return `[Unit]
Description=Dory Local Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${systemdQuote(input.serviceDir)}
Environment=${systemdQuote(`HOME=${env.HOME ?? homedir()}`)}
Environment=${systemdQuote(`PATH=${env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`)}
ExecStart=${execStart}
Restart=always
RestartSec=5
StandardOutput=append:${input.stdoutPath}
StandardError=append:${input.stderrPath}

[Install]
WantedBy=default.target
`;
}

async function readCliPackageVersion() {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: string };
    if (!parsed.version) throw new Error('Unable to resolve @getdory/cli package version.');
    return parsed.version;
}

async function installRuntime(paths: RuntimeServicePaths, options: RuntimeServiceOptions) {
    const runCommand = options.runCommand ?? defaultRunCommand;
    const version = options.packageVersion ?? (await readCliPackageVersion());
    await mkdir(paths.runtimeDir, { recursive: true, mode: 0o700 });
    await runCommand('npm', ['install', '--prefix', paths.runtimeDir, '--no-audit', '--no-fund', `@getdory/cli@${version}`], {
        env: serviceEnv(options),
    });
}

async function writeServiceFiles(paths: RuntimeServicePaths, config: RuntimeServiceConfig, options: RuntimeServiceOptions) {
    const platform = servicePlatform(options);
    await mkdir(paths.serviceDir, { recursive: true, mode: 0o700 });
    await mkdir(paths.logDir, { recursive: true, mode: 0o700 });
    await writeLocalRuntimeServiceConfig(paths.configPath, config);

    if (platform === 'darwin') {
        await mkdir(dirname(paths.launchAgentPath), { recursive: true, mode: 0o700 });
        await writeFile(
            paths.launchAgentPath,
            buildMacLaunchAgentPlist({
                doryBinPath: paths.doryBinPath,
                configPath: paths.configPath,
                stdoutPath: paths.stdoutPath,
                stderrPath: paths.stderrPath,
                env: serviceEnv(options),
            }),
            { mode: 0o644 },
        );
        return;
    }

    if (platform === 'linux') {
        await mkdir(dirname(paths.systemdUnitPath), { recursive: true, mode: 0o700 });
        await writeFile(
            paths.systemdUnitPath,
            buildLinuxSystemdUnit({
                doryBinPath: paths.doryBinPath,
                configPath: paths.configPath,
                serviceDir: paths.serviceDir,
                stdoutPath: paths.stdoutPath,
                stderrPath: paths.stderrPath,
                env: serviceEnv(options),
            }),
            { mode: 0o644 },
        );
        return;
    }

    throw new Error('Dory Local Runtime background service install is supported on macOS and Linux.');
}

async function startService(paths: RuntimeServicePaths, options: RuntimeServiceOptions) {
    const platform = servicePlatform(options);
    const runCommand = options.runCommand ?? defaultRunCommand;
    if (platform === 'darwin') {
        const uid = serviceUid(options);
        await runCommand('launchctl', ['bootout', `gui/${uid}`, paths.launchAgentPath], { rejectOnError: false });
        await runCommand('launchctl', ['bootstrap', `gui/${uid}`, paths.launchAgentPath]);
        await runCommand('launchctl', ['kickstart', '-k', `gui/${uid}/${SERVICE_LABEL}`]);
        return;
    }

    if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'daemon-reload']);
        await runCommand('systemctl', ['--user', 'enable', '--now', SYSTEMD_SERVICE_NAME]);
        return;
    }

    throw new Error('Dory Local Runtime background service install is supported on macOS and Linux.');
}

function assertRemoteMcpHttpOptions(options: RuntimeServiceOptions) {
    if (!options.mcpHttp) return;
    if (options.host === '0.0.0.0' && !options.allowRemote) {
        throw new Error('Refusing to bind 0.0.0.0 without --allow-remote.');
    }
    if (options.host === '0.0.0.0' && !options.token?.trim()) {
        throw new Error('HTTP remote bind requires --token <existing-token>. Create one with dory mcp token create first.');
    }
}

export async function installLocalRuntimeService(options: RuntimeServiceOptions = {}) {
    const platform = servicePlatform(options);
    if (platform !== 'darwin' && platform !== 'linux') {
        throw new Error('Dory Local Runtime background service install is supported on macOS and Linux.');
    }

    assertRemoteMcpHttpOptions(options);
    const capabilities: RuntimeServiceConfig['capabilities'] = {};

    if (options.codexAgent) {
        const target = normalizeDoryTarget(options.url);
        const mcpConfigPath = resolve(options.codexConfigPath ?? getBridgeConfigPath());
        const name = options.name?.trim() || 'Dory Codex Agent';
        await prepareCodexAgentBridge({
            ...options,
            url: target.origin,
            name,
            configPath: mcpConfigPath,
        });
        capabilities.codexAgent = {
            enabled: true,
            origin: target.origin,
            name,
            mcpConfigPath,
        };
    }

    if (options.mcpHttp) {
        capabilities.mcpHttp = {
            enabled: true,
            host: options.host ?? '127.0.0.1',
            port: options.port ?? 3318,
            origin: options.origin,
            token: options.token,
            allowRemote: options.allowRemote,
        };
    }

    const paths = getLocalRuntimeServicePaths(options);
    await installRuntime(paths, options);
    const config: RuntimeServiceConfig = {
        version: SERVICE_CONFIG_VERSION,
        installedAt: new Date().toISOString(),
        data: options.data,
        userDataDir: options.userDataDir,
        pglitePath: options.pglitePath,
        databaseUrl: options.databaseUrl,
        capabilities,
    };
    await writeServiceFiles(paths, config, options);
    await startService(paths, options);

    return {
        ok: true,
        platform,
        serviceDir: paths.serviceDir,
        configPath: paths.configPath,
        capabilities,
        logs: {
            stdout: paths.stdoutPath,
            stderr: paths.stderrPath,
        },
    };
}

export async function getLocalRuntimeServiceStatus(options: RuntimeServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getLocalRuntimeServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;
    const installed = platform === 'darwin' ? existsSync(paths.launchAgentPath) : platform === 'linux' ? existsSync(paths.systemdUnitPath) : false;
    let running = false;

    if (platform === 'darwin' && installed) {
        const uid = serviceUid(options);
        const status = await runCommand('launchctl', ['print', `gui/${uid}/${SERVICE_LABEL}`], { rejectOnError: false });
        running = !status.stderr && status.stdout.length > 0;
    } else if (platform === 'linux' && installed) {
        const status = await runCommand('systemctl', ['--user', 'is-active', SYSTEMD_SERVICE_NAME], { rejectOnError: false });
        running = status.stdout.trim() === 'active';
    }

    return {
        ok: true,
        platform,
        installed,
        running,
        serviceFile: platform === 'darwin' ? paths.launchAgentPath : platform === 'linux' ? paths.systemdUnitPath : null,
        serviceDir: paths.serviceDir,
        logs: {
            stdout: paths.stdoutPath,
            stderr: paths.stderrPath,
        },
    };
}

export async function stopLocalRuntimeService(options: RuntimeServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getLocalRuntimeServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        return getLocalRuntimeServiceStatus(options);
    }

    if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'stop', SYSTEMD_SERVICE_NAME], { rejectOnError: false });
        return getLocalRuntimeServiceStatus(options);
    }

    throw new Error('Dory Local Runtime background service is supported on macOS and Linux.');
}

export async function restartLocalRuntimeService(options: RuntimeServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getLocalRuntimeServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        await runCommand('launchctl', ['bootstrap', `gui/${serviceUid(options)}`, paths.launchAgentPath]);
        await runCommand('launchctl', ['kickstart', '-k', `gui/${serviceUid(options)}/${SERVICE_LABEL}`]);
        return getLocalRuntimeServiceStatus(options);
    }

    if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'restart', SYSTEMD_SERVICE_NAME]);
        return getLocalRuntimeServiceStatus(options);
    }

    throw new Error('Dory Local Runtime background service is supported on macOS and Linux.');
}

export async function uninstallLocalRuntimeService(options: RuntimeServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getLocalRuntimeServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        await rm(paths.launchAgentPath, { force: true });
    } else if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'disable', '--now', SYSTEMD_SERVICE_NAME], { rejectOnError: false });
        await rm(paths.systemdUnitPath, { force: true });
        await runCommand('systemctl', ['--user', 'daemon-reload'], { rejectOnError: false });
    } else {
        throw new Error('Dory Local Runtime background service is supported on macOS and Linux.');
    }

    await rm(paths.serviceDir, { recursive: true, force: true });
    return {
        ok: true,
        platform,
        installed: false,
        running: false,
        serviceDir: paths.serviceDir,
    };
}
