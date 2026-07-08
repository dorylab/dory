import fs from 'node:fs/promises';
import path from 'node:path';
import { readPgVersion, CURRENT_PG_VERSION } from './pg-version';
import { type WorkspaceRecoverySnapshot } from './workspace-recovery';

function createArchiveSuffix(date = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        '-',
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
}

export type PgUpgradeResult = {
    migrated: boolean;
    snapshot: WorkspaceRecoverySnapshot | null;
    archivedDataDir: string | null;
};

/**
 * Checks if the PGlite data directory contains pre-PG 17 data and archives it
 * before the current PGlite runtime opens the directory.
 *
 * Must be called BEFORE getPgliteClient() because the current PGlite (0.4.x)
 * can abort when opening PG 16 data directories.
 */
export async function migrateFromPg16IfNeeded(dataDir: string): Promise<PgUpgradeResult> {
    const pgVersion = await readPgVersion(dataDir);

    if (pgVersion === null || pgVersion >= CURRENT_PG_VERSION) {
        return { migrated: false, snapshot: null, archivedDataDir: null };
    }

    console.warn(`[PGlite upgrade] Detected PG ${pgVersion} data, archiving before starting PG ${CURRENT_PG_VERSION}.`);

    // 1. Archive old data dir
    const archivedDataDir = path.join(
        path.dirname(dataDir),
        `${path.basename(dataDir)}.pg${pgVersion}-upgrade-${createArchiveSuffix()}`,
    );
    await fs.rename(dataDir, archivedDataDir);
    console.log('[PGlite upgrade] Archived old data directory', {
        from: dataDir,
        to: archivedDataDir,
    });

    console.warn('[PGlite upgrade] Legacy PGlite is no longer bundled, so old data was archived without automatic export.', {
        archivedDataDir,
    });

    return { migrated: true, snapshot: null, archivedDataDir };
}
