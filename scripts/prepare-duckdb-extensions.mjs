// Provision signed extensions for the native DuckDB binary used by this build.
// Runtime never downloads extensions. A missing/incompatible bundle fails here.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'apps/web/public/resources/duckdb');
const extension = path.join(directory, 'excel.duckdb_extension');
const metadata = path.join(directory, 'manifest.json');
const instance = await DuckDBInstance.create(':memory:', { autoinstall_known_extensions: 'false', autoload_known_extensions: 'false' });
const connection = await instance.connect();
try {
    const version = String((await connection.runAndReadAll('SELECT version() AS version')).getRowObjectsJson()[0].version);
    const platform = String((await connection.runAndReadAll('PRAGMA platform')).getRowObjectsJson()[0].platform);
    const requestedArch = process.env.DORY_BUILD_ARCH;
    const nativeArch = ['x86_64', 'x64', 'amd64'].includes(requestedArch) ? 'amd64' : ['arm64', 'aarch64'].includes(requestedArch) ? 'arm64' : requestedArch;
    if (nativeArch && !platform.endsWith(nativeArch)) {
        throw new Error(`Build architecture must match the native DuckDB platform (${platform}). Provision extensions on the target build host.`);
    }
    const url = `https://extensions.duckdb.org/${version}/${platform}/excel.duckdb_extension.gz`;
    let valid = false;
    try {
        const saved = JSON.parse(await readFile(metadata, 'utf8'));
        const hash = createHash('sha256')
            .update(await readFile(extension))
            .digest('hex');
        valid = saved.version === version && saved.platform === platform && saved.sha256 === hash;
    } catch {
        /* A fresh build provisions its own matching extension. */
    }
    if (!valid) {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`DuckDB extension download failed (${response.status}): ${url}`);
        const bytes = gunzipSync(Buffer.from(await response.arrayBuffer()), { maxOutputLength: 64 * 1024 * 1024 });
        await mkdir(directory, { recursive: true });
        const staging = await mkdtemp(path.join(directory, 'stage-'));
        const temporary = path.join(staging, 'excel.duckdb_extension');
        try {
            await writeFile(temporary, bytes);
            // LOAD verifies DuckDB's extension signature, version and platform before publishing.
            await connection.run(`LOAD '${temporary.replace(/'/g, "''")}'`);
            await rename(temporary, extension);
            await writeFile(metadata, JSON.stringify({ version, platform, url, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
        } finally {
            await rm(staging, { force: true, recursive: true });
        }
    } else {
        await connection.run(`LOAD '${extension.replace(/'/g, "''")}'`);
    }
    console.log(`DuckDB Excel ready for offline use: ${version}/${platform}`);
} finally {
    connection.closeSync();
    instance.closeSync();
}
