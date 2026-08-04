import os from 'node:os';
import path from 'node:path';

function positiveInteger(name: string, fallback: number) {
    const value = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function getImportConfig() {
    return {
        maxFileBytes: positiveInteger('DORY_IMPORT_MAX_FILE_BYTES', 2_147_483_648),
        artifactRetentionDays: positiveInteger('DORY_IMPORT_ARTIFACT_RETENTION_DAYS', 30),
        concurrency: positiveInteger('DORY_IMPORT_CONCURRENCY', 1),
        tempDir: path.resolve(/* turbopackIgnore: true */ process.env.DORY_IMPORT_TEMP_DIR?.trim() || path.join(os.tmpdir(), 'dory-import')),
    };
}
