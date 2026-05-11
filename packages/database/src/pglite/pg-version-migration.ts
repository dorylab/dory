import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite as LegacyPGlite } from '@electric-sql/pglite-legacy';
import { readPgVersion, CURRENT_PG_VERSION } from './pg-version';
import {
    exportWorkspaceRecoverySnapshot,
    type WorkspaceRecoverySnapshot,
} from './workspace-recovery';

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
 * Checks if the PGlite data directory contains PG 16 data and performs
 * a cross-version migration using the legacy PGlite (0.2.17) to extract data.
 *
 * Must be called BEFORE getPgliteClient() — the new PGlite (0.4.x) crashes
 * when opening PG 16 data directories.
 */
export async function migrateFromPg16IfNeeded(dataDir: string): Promise<PgUpgradeResult> {
    const pgVersion = await readPgVersion(dataDir);

    if (pgVersion === null || pgVersion >= CURRENT_PG_VERSION) {
        return { migrated: false, snapshot: null, archivedDataDir: null };
    }

    console.log(`[PGlite upgrade] Detected PG ${pgVersion} data, migrating to PG ${CURRENT_PG_VERSION}...`);

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

    // 2. Export snapshot using legacy PGlite that can open PG 16 data
    const snapshotPath = `${archivedDataDir}.upgrade-snapshot.json`;
    let snapshot: WorkspaceRecoverySnapshot | null = null;

    try {
        snapshot = await exportWorkspaceRecoverySnapshot(
            archivedDataDir,
            snapshotPath,
            LegacyPGlite as any,
        );
        console.log('[PGlite upgrade] Successfully exported data from old database');
    } catch (error) {
        console.error('[PGlite upgrade] Failed to export data from old database. ' +
            'The archived directory is preserved for manual recovery.', {
            error,
            archivedDataDir,
        });
    }

    return { migrated: true, snapshot, archivedDataDir };
}
