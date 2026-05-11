import fs from 'node:fs/promises';
import path from 'node:path';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import migrations from './migrations.json';
import { getPgliteClient, resetPgliteClient, resolvePgliteDataDir } from '../postgres/client/pglite';
import { translateDatabase } from '../i18n';
import { exportWorkspaceRecoverySnapshot, importWorkspaceRecoverySnapshot } from './workspace-recovery';
import { migrateFromPg16IfNeeded } from './pg-version-migration';

async function runDrizzleMigrate(db: any) {
    const dialect = db?.dialect;
    const session = db?.session;

    if (!dialect || typeof dialect.migrate !== 'function' || !session) {
        throw new Error(translateDatabase('Database.Errors.PgliteInvalidInstance'));
    }

    await dialect.migrate(migrations as any, session, {
        migrationsTable: 'drizzle_migrations',
    } satisfies Omit<MigrationConfig, 'migrationsFolder'>);
}

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

async function archivePgliteDataDir(dataDir: string) {
    const archivedDataDir = path.join(
        path.dirname(dataDir),
        `${path.basename(dataDir)}.broken-${createArchiveSuffix()}`,
    );

    await fs.rename(dataDir, archivedDataDir);
    console.warn('[PGlite migrate] Archived broken data directory', {
        from: dataDir,
        to: archivedDataDir,
    });

    return archivedDataDir;
}

export async function migratePgliteDB() {
    const dataDir = await resolvePgliteDataDir();

    // Phase 1: Check for PG major version incompatibility BEFORE opening the DB.
    // PGlite 0.4.x (PG 17) WASM crashes on PG 16 data, so we must detect and
    // migrate using the legacy PGlite version before attempting to open.
    const upgradeResult = await migrateFromPg16IfNeeded(dataDir);

    // Phase 2: Open DB with current PGlite (fresh DB after upgrade, or existing PG 17)
    const db = await getPgliteClient();

    try {
        await runDrizzleMigrate(db);
    } catch (err) {
        console.warn(translateDatabase('Database.Errors.PgliteMigrationFailed'), {
            error: err,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            cause:
                err instanceof Error && 'cause' in err
                    ? (err as Error & { cause?: unknown }).cause
                    : undefined,
        });

        // The PGlite WASM instance may be in a crashed state (e.g. RuntimeError: Aborted),
        // so closing it can also throw — catch and proceed with recovery regardless.
        try {
            await resetPgliteClient();
        } catch (resetError) {
            console.warn('[PGlite migrate] Failed to close crashed PGlite instance, proceeding with recovery', resetError);
        }

        const archivedDataDir = await archivePgliteDataDir(dataDir);
        const snapshotPath = `${archivedDataDir}.workspace-recovery.json`;

        let recoverySnapshot: Awaited<ReturnType<typeof exportWorkspaceRecoverySnapshot>> | null = null;

        try {
            recoverySnapshot = await exportWorkspaceRecoverySnapshot(archivedDataDir, snapshotPath);
        } catch (recoveryError) {
            console.warn('[PGlite migrate] Workspace recovery export failed', {
                archivedDataDir,
                snapshotPath,
                recoveryError,
            });
        }

        const freshDb = await getPgliteClient();
        await runDrizzleMigrate(freshDb);

        if (recoverySnapshot) {
            try {
                await importWorkspaceRecoverySnapshot(freshDb, recoverySnapshot);
            } catch (recoveryError) {
                console.warn('[PGlite migrate] Workspace recovery import failed', {
                    snapshotPath,
                    recoveryError,
                });
            }
        }

        // If we already extracted a PG 16 snapshot, don't try to import it again
        // since the schema migration on the fresh DB already ran above.
        return;
    }

    // Phase 3: If we just did a PG version upgrade, import the extracted data
    if (upgradeResult.migrated && upgradeResult.snapshot) {
        try {
            await importWorkspaceRecoverySnapshot(db, upgradeResult.snapshot);
            console.log('[PGlite upgrade] Successfully imported data into new PG 17 database');
        } catch (importError) {
            console.warn('[PGlite upgrade] Failed to import some data into new database', {
                importError,
            });
        }
    }
}
