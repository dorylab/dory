import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { getBridgeConfigPath } from './bridge-config.js';
import { normalizeDoryTarget } from './bridge-url.js';
import { prepareCodexAgentBridge, type CodexAgentOptions } from './local-codex-agent.js';

const SERVICE_LABEL = 'com.getdory.codex-agent';
const SYSTEMD_SERVICE_NAME = 'dory-codex-agent.service';
const SERVICE_CONFIG_VERSION = 1;

type CommandResult = {
    stdout: string;
    stderr: string;
};

export type RunCommand = (command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; rejectOnError?: boolean }) => Promise<CommandResult>;

export type CodexAgentServiceOptions = CodexAgentOptions & {
    platform?: NodeJS.Platform;
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    uid?: number;
    runCommand?: RunCommand;
    packageVersion?: string;
};

type CodexAgentServicePaths = {
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

type ServiceConfig = {
    version: 1;
    origin: string;
    name: string;
    mcpConfigPath: string;
    installedAt: string;
};

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

function serviceEnv(options: CodexAgentServiceOptions) {
    return options.env ?? process.env;
}

function servicePlatform(options: CodexAgentServiceOptions) {
    return options.platform ?? process.platform;
}

function serviceHomeDir(options: CodexAgentServiceOptions) {
    return options.homeDir ?? homedir();
}

function serviceUid(options: CodexAgentServiceOptions) {
    const uid = options.uid ?? process.getuid?.();
    if (typeof uid !== 'number') {
        throw new Error('Dory Codex Agent service installation requires a POSIX user id.');
    }
    return uid;
}

export function getCodexAgentServicePaths(options: CodexAgentServiceOptions = {}): CodexAgentServicePaths {
    const home = serviceHomeDir(options);
    const serviceDir = join(home, '.dory', 'agent', 'codex');
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

function buildServiceArgs(config: ServiceConfig) {
    return ['agent', 'codex', 'run', '--url', config.origin, '--name', config.name, '--config', config.mcpConfigPath];
}

export function buildMacLaunchAgentPlist(input: { doryBinPath: string; config: ServiceConfig; stdoutPath: string; stderrPath: string; env?: NodeJS.ProcessEnv }) {
    const env = input.env ?? process.env;
    const programArguments = [input.doryBinPath, ...buildServiceArgs(input.config)];
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

export function buildLinuxSystemdUnit(input: { doryBinPath: string; config: ServiceConfig; serviceDir: string; stdoutPath: string; stderrPath: string; env?: NodeJS.ProcessEnv }) {
    const env = input.env ?? process.env;
    const execStart = [input.doryBinPath, ...buildServiceArgs(input.config)].map(systemdQuote).join(' ');
    return `[Unit]
Description=Dory Codex Agent
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

async function installRuntime(paths: CodexAgentServicePaths, options: CodexAgentServiceOptions) {
    const runCommand = options.runCommand ?? defaultRunCommand;
    const version = options.packageVersion ?? (await readCliPackageVersion());
    await mkdir(paths.runtimeDir, { recursive: true, mode: 0o700 });
    await runCommand('npm', ['install', '--prefix', paths.runtimeDir, '--no-audit', '--no-fund', `@getdory/cli@${version}`], {
        env: serviceEnv(options),
    });
}

async function writeServiceFiles(paths: CodexAgentServicePaths, config: ServiceConfig, options: CodexAgentServiceOptions) {
    const platform = servicePlatform(options);
    await mkdir(paths.serviceDir, { recursive: true, mode: 0o700 });
    await mkdir(paths.logDir, { recursive: true, mode: 0o700 });
    await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

    if (platform === 'darwin') {
        await mkdir(dirname(paths.launchAgentPath), { recursive: true, mode: 0o700 });
        await writeFile(
            paths.launchAgentPath,
            buildMacLaunchAgentPlist({
                doryBinPath: paths.doryBinPath,
                config,
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
                config,
                serviceDir: paths.serviceDir,
                stdoutPath: paths.stdoutPath,
                stderrPath: paths.stderrPath,
                env: serviceEnv(options),
            }),
            { mode: 0o644 },
        );
        return;
    }

    throw new Error('Dory Codex Agent background service install is supported on macOS and Linux.');
}

async function startService(paths: CodexAgentServicePaths, options: CodexAgentServiceOptions) {
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

    throw new Error('Dory Codex Agent background service install is supported on macOS and Linux.');
}

export async function installCodexAgentService(options: CodexAgentServiceOptions = {}) {
    const platform = servicePlatform(options);
    if (platform !== 'darwin' && platform !== 'linux') {
        throw new Error('Dory Codex Agent background service install is supported on macOS and Linux.');
    }

    const target = normalizeDoryTarget(options.url);
    const mcpConfigPath = resolve(options.configPath ?? getBridgeConfigPath());
    const name = options.name?.trim() || 'Dory Codex Agent';
    await prepareCodexAgentBridge({
        ...options,
        url: target.origin,
        name,
        configPath: mcpConfigPath,
    });

    const paths = getCodexAgentServicePaths(options);
    await installRuntime(paths, options);
    const config: ServiceConfig = {
        version: SERVICE_CONFIG_VERSION,
        origin: target.origin,
        name,
        mcpConfigPath,
        installedAt: new Date().toISOString(),
    };
    await writeServiceFiles(paths, config, options);
    await startService(paths, options);

    return {
        ok: true,
        platform,
        origin: target.origin,
        serviceDir: paths.serviceDir,
        configPath: paths.configPath,
        logs: {
            stdout: paths.stdoutPath,
            stderr: paths.stderrPath,
        },
    };
}

export async function getCodexAgentServiceStatus(options: CodexAgentServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getCodexAgentServicePaths(options);
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

export async function stopCodexAgentService(options: CodexAgentServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getCodexAgentServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        return getCodexAgentServiceStatus(options);
    }

    if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'stop', SYSTEMD_SERVICE_NAME], { rejectOnError: false });
        return getCodexAgentServiceStatus(options);
    }

    throw new Error('Dory Codex Agent background service is supported on macOS and Linux.');
}

export async function restartCodexAgentService(options: CodexAgentServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getCodexAgentServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        await runCommand('launchctl', ['bootstrap', `gui/${serviceUid(options)}`, paths.launchAgentPath]);
        await runCommand('launchctl', ['kickstart', '-k', `gui/${serviceUid(options)}/${SERVICE_LABEL}`]);
        return getCodexAgentServiceStatus(options);
    }

    if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'restart', SYSTEMD_SERVICE_NAME]);
        return getCodexAgentServiceStatus(options);
    }

    throw new Error('Dory Codex Agent background service is supported on macOS and Linux.');
}

export async function uninstallCodexAgentService(options: CodexAgentServiceOptions = {}) {
    const platform = servicePlatform(options);
    const paths = getCodexAgentServicePaths(options);
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        await runCommand('launchctl', ['bootout', `gui/${serviceUid(options)}`, paths.launchAgentPath], { rejectOnError: false });
        await rm(paths.launchAgentPath, { force: true });
    } else if (platform === 'linux') {
        await runCommand('systemctl', ['--user', 'disable', '--now', SYSTEMD_SERVICE_NAME], { rejectOnError: false });
        await rm(paths.systemdUnitPath, { force: true });
        await runCommand('systemctl', ['--user', 'daemon-reload'], { rejectOnError: false });
    } else {
        throw new Error('Dory Codex Agent background service is supported on macOS and Linux.');
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
