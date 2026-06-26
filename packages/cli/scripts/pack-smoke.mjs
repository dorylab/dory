import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const workDir = mkdtempSync(path.join(tmpdir(), 'dory-cli-pack-smoke-'));
const tarball = path.join(workDir, 'getdory-cli.tgz');
const userDataDir = path.join(workDir, 'userdata');

function run(command, args, options = {}) {
    return execFileSync(command, args, {
        cwd: options.cwd ?? repoRoot,
        env: { ...process.env, ...(options.env ?? {}) },
        stdio: options.stdio ?? 'pipe',
        encoding: options.encoding ?? 'utf8',
    });
}

try {
    run('yarn', ['workspace', '@getdory/cli', 'build'], { stdio: 'inherit' });
    const bundle = path.join(repoRoot, 'packages/cli/dist/cli.js');
    if (!existsSync(bundle)) throw new Error('CLI bundle was not created.');
    const bundledSource = readFileSync(bundle, 'utf8');
    if (bundledSource.includes('@dory/server-core')) {
        throw new Error('CLI bundle still contains a runtime @dory/server-core import.');
    }

    run('yarn', ['workspace', '@getdory/cli', 'pack', '--out', tarball], { stdio: 'inherit' });
    writeFileSync(path.join(workDir, 'package.json'), '{"private":true,"type":"module"}\n');
    run('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: workDir, stdio: 'inherit' });

    run('npx', ['dory', '--help'], { cwd: workDir });
    run('npx', ['dory', 'action', 'list', '--data', 'standalone', '--user-data-dir', userDataDir], { cwd: workDir });

    const smokeScript = `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({
  command: ${JSON.stringify(path.join(workDir, 'node_modules/.bin/dory'))},
  args: ['mcp', 'serve', '--stdio', '--data', 'standalone', '--user-data-dir', ${JSON.stringify(userDataDir)}],
});
const client = new Client({ name: 'dory-pack-smoke', version: '0.0.0' });
await client.connect(transport);
const tools = await client.listTools();
if (!tools.tools.some(tool => tool.name === 'dory_create_work')) {
  throw new Error('Packed CLI MCP server did not expose Dory tools.');
}
await client.close();
`;
    run(process.execPath, ['--input-type=module', '-e', smokeScript], { cwd: workDir, stdio: 'inherit' });
    console.log('Dory CLI pack smoke passed.');
} finally {
    rmSync(workDir, { recursive: true, force: true });
}
