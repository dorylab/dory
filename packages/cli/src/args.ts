export type DataMode = 'desktop' | 'standalone' | 'self-hosted';

export type ProfileOptions = {
    data?: DataMode;
    userDataDir?: string;
    pglitePath?: string;
    databaseUrl?: string;
};

export type ServeOptions = ProfileOptions & {
    transport: 'stdio' | 'http';
    host: string;
    port: number;
    origin?: string;
    token?: string;
    allowRemote?: boolean;
};

export type ActionProjection = 'canonical' | 'ui' | 'agent' | 'mcp' | 'automation';

export type ActionOptions = ProfileOptions & {
    actionId: string;
    json?: string;
    input?: string;
    projection?: ActionProjection;
    yes: boolean;
};

export type RuntimeAction = 'install' | 'run' | 'status' | 'restart' | 'stop' | 'uninstall';

export type RuntimeOptions = ProfileOptions & {
    action: RuntimeAction;
    serviceConfigPath?: string;
    codexAgent?: boolean;
    url?: string;
    name?: string;
    codexConfigPath?: string;
    mcpHttp?: boolean;
    host: string;
    port?: number;
    origin?: string;
    token?: string;
    allowRemote?: boolean;
};

export type ParsedArgs =
    | { command: 'help' }
    | { command: 'version' }
    | ({ command: 'doctor' } & ProfileOptions)
    | ({ command: 'init' } & ProfileOptions)
    | ({ command: 'storage'; action: 'detect' | 'doctor' } & ProfileOptions)
    | ({ command: 'action-list' } & ProfileOptions)
    | ({ command: 'action-describe'; actionId: string } & ProfileOptions)
    | { command: 'action-run'; options: ActionOptions }
    | { command: 'runtime'; options: RuntimeOptions }
    | { command: 'mcp-serve'; options: ServeOptions }
    | ({ command: 'mcp-token'; action: 'create' | 'revoke' | 'list'; id?: string; name?: string; scopes?: string[] } & ProfileOptions)
    | { command: 'mcp-bridge' | 'mcp-login' | 'mcp-logout' | 'mcp-status'; url?: string; clientName?: string; configPath?: string; localAi?: boolean };

export function readOption(args: string[], name: string) {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = args[index + 1];
    return value && !value.startsWith('-') ? value : undefined;
}

export function readOptions(args: string[], name: string) {
    const values: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] !== name) continue;
        const value = args[index + 1];
        if (value && !value.startsWith('-')) values.push(value);
    }
    return values;
}

export function hasFlag(args: string[], name: string) {
    return args.includes(name);
}

function readPort(args: string[]) {
    const raw = readOption(args, '--port');
    if (!raw) return 3318;
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid --port: ${raw}`);
    }
    return port;
}

function readDataOptions(argv: string[]): ProfileOptions {
    const rawData = readOption(argv, '--data');
    const data = rawData === 'desktop' || rawData === 'standalone' || rawData === 'self-hosted' ? rawData : undefined;
    if (rawData && !data) throw new Error(`Invalid --data: ${rawData}`);

    const rawProfile = readOption(argv, '--profile');
    const legacyData = rawProfile === 'desktop' ? 'desktop' : rawProfile === 'headless' ? 'standalone' : undefined;
    if (rawProfile && !legacyData) throw new Error(`Invalid --profile: ${rawProfile}`);

    return {
        data: data ?? legacyData,
        userDataDir: readOption(argv, '--user-data-dir'),
        pglitePath: readOption(argv, '--pglite-path'),
        databaseUrl: readOption(argv, '--database-url'),
    };
}

function readProjection(argv: string[]): ActionProjection | undefined {
    const raw = readOption(argv, '--projection');
    if (!raw) return undefined;
    if (raw === 'canonical' || raw === 'ui' || raw === 'agent' || raw === 'mcp' || raw === 'automation') return raw;
    throw new Error(`Invalid --projection: ${raw}`);
}

export function parseArgs(argv: string[]): ParsedArgs {
    if (hasFlag(argv, '--version') || hasFlag(argv, '-v')) {
        return { command: 'version' };
    }

    if (!argv.length || hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
        return { command: 'help' };
    }

    const configPath = readOption(argv, '--config');
    const [first, second, third] = argv;
    const profileOptions = readDataOptions(argv);

    if (first === 'doctor') {
        return { command: 'doctor', ...profileOptions };
    }

    if (first === 'init') {
        return { command: 'init', ...profileOptions };
    }

    if (first === 'storage') {
        const action = second === 'doctor' ? 'doctor' : 'detect';
        return { command: 'storage', action, ...profileOptions };
    }

    if (first === 'action') {
        if (second === 'list') {
            return { command: 'action-list', ...profileOptions };
        }
        if (second === 'describe') {
            if (!third || third.startsWith('-')) return { command: 'help' };
            return { command: 'action-describe', actionId: third, ...profileOptions };
        }
        if (!second || second.startsWith('-')) return { command: 'help' };
        return {
            command: 'action-run',
            options: {
                actionId: second,
                json: readOption(argv, '--json'),
                input: readOption(argv, '--input'),
                projection: readProjection(argv),
                yes: hasFlag(argv, '--yes'),
                ...profileOptions,
            },
        };
    }

    if (first === 'agent') {
        return { command: 'help' };
    }

    if (first === 'runtime') {
        const action = second && !second.startsWith('-') ? second : null;
        if (action !== 'install' && action !== 'run' && action !== 'status' && action !== 'restart' && action !== 'stop' && action !== 'uninstall') {
            return { command: 'help' };
        }
        return {
            command: 'runtime',
            options: {
                action,
                serviceConfigPath: configPath,
                codexAgent: hasFlag(argv, '--codex-agent'),
                url: readOption(argv, '--url') ?? readOption(argv, '-u'),
                name: readOption(argv, '--name') ?? readOption(argv, '--client-name'),
                codexConfigPath: readOption(argv, '--codex-config'),
                mcpHttp: hasFlag(argv, '--mcp-http'),
                host: readOption(argv, '--host') ?? '127.0.0.1',
                port: readOption(argv, '--port') ? readPort(argv) : undefined,
                origin: readOption(argv, '--origin'),
                token: readOption(argv, '--token'),
                allowRemote: hasFlag(argv, '--allow-remote'),
                ...profileOptions,
            },
        };
    }

    if (first === 'mcp') {
        if (second === 'serve') {
            return {
                command: 'mcp-serve',
                options: {
                    transport: hasFlag(argv, '--http') ? 'http' : 'stdio',
                    host: readOption(argv, '--host') ?? '127.0.0.1',
                    port: readPort(argv),
                    origin: readOption(argv, '--origin'),
                    token: readOption(argv, '--token'),
                    allowRemote: hasFlag(argv, '--allow-remote'),
                    ...profileOptions,
                },
            };
        }

        if (second === 'token') {
            const action = third === 'create' || third === 'revoke' || third === 'list' ? third : 'list';
            return {
                command: 'mcp-token',
                action,
                id: readOption(argv, '--id') ?? (action === 'revoke' && argv[3] && !argv[3].startsWith('-') ? argv[3] : undefined),
                name: readOption(argv, '--name'),
                scopes: readOptions(argv, '--scope')
                    .flatMap(value => value.split(','))
                    .map(value => value.trim())
                    .filter(Boolean),
                ...profileOptions,
            };
        }

        if (second === 'login' || second === 'logout' || second === 'status' || second === 'bridge') {
            return {
                command: `mcp-${second}`,
                url: readOption(argv, '--url') ?? readOption(argv, '-u'),
                clientName: readOption(argv, '--client-name'),
                configPath,
                localAi: hasFlag(argv, '--local-ai'),
            } as ParsedArgs;
        }
    }

    return { command: 'help' };
}
