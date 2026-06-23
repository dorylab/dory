#!/usr/bin/env node
import { spawn } from 'node:child_process';

import { login } from './auth.js';
import { getConfigPath, removeCredential, resolveCredential } from './config.js';
import { createRemoteMcpClient } from './remote.js';
import { normalizeDoryTarget } from './url.js';
import { startBridge } from './bridge.js';

type ParsedArgs = {
    command: 'bridge' | 'login' | 'logout' | 'status' | 'help';
    url?: string;
    clientName?: string;
    configPath?: string;
};

function readOption(args: string[], name: string) {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    return args[index + 1];
}

function parseArgs(argv: string[]): ParsedArgs {
    const commandArg = argv.find(arg => !arg.startsWith('-'));
    const command = commandArg === 'login' || commandArg === 'logout' || commandArg === 'status' ? commandArg : argv.includes('--help') || argv.includes('-h') ? 'help' : 'bridge';
    return {
        command,
        url: readOption(argv, '--url') ?? readOption(argv, '-u'),
        clientName: readOption(argv, '--client-name'),
        configPath: readOption(argv, '--config'),
    };
}

function printHelp() {
    console.log(`Dory MCP

Usage:
  dory-mcp --url <dory-origin>
  dory-mcp login --url <dory-origin>
  dory-mcp status --url <dory-origin>
  dory-mcp logout --url <dory-origin>

Environment:
  DORY_MCP_URL      Default Dory origin or /api/mcp endpoint
  DORY_MCP_TOKEN    Advanced bearer token override
  DORY_MCP_CONFIG   Credential file path
`);
}

async function run() {
    const argv = process.argv.slice(2);
    if (argv[0] === 'serve' || argv[0] === 'token' || argv[0] === 'init') {
        await new Promise<void>((resolve, reject) => {
            const child = spawn('npx', ['-y', '@getdory/cli', ...(argv[0] === 'init' ? argv : ['mcp', ...argv])], {
                stdio: 'inherit',
                env: process.env,
            });
            child.on('error', reject);
            child.on('exit', code => {
                if (code === 0) resolve();
                else reject(new Error(`@getdory/cli exited with code ${code ?? 'unknown'}`));
            });
        });
        return;
    }

    const args = parseArgs(argv);
    const configPath = args.configPath ?? getConfigPath();
    const target = normalizeDoryTarget(args.url);

    if (args.command === 'help') {
        printHelp();
        return;
    }

    if (args.command === 'login') {
        const result = await login({
            url: args.url,
            clientName: args.clientName,
            configPath,
        });
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        return;
    }

    if (args.command === 'logout') {
        await removeCredential(target.origin, configPath);
        console.log(JSON.stringify({ ok: true, origin: target.origin }, null, 2));
        return;
    }

    const credential = await resolveCredential(args.url, process.env, configPath);
    if (!credential) {
        throw new Error(`No Dory MCP credential found for ${target.origin}. Run: dory-mcp login --url ${target.origin}`);
    }

    if (args.command === 'status') {
        const remote = await createRemoteMcpClient(credential.endpoint, credential.token);
        try {
            const tools = await remote.client.listTools();
            console.log(
                JSON.stringify(
                    {
                        ok: true,
                        origin: credential.origin,
                        endpoint: credential.endpoint,
                        tokenPrefix: credential.tokenPrefix,
                        tools: tools.tools.map(tool => tool.name),
                    },
                    null,
                    2,
                ),
            );
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

run().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
