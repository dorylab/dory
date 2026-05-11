import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads the PG_VERSION file from a PGlite data directory.
 * Returns the major version number (e.g., 16 or 17), or null if the
 * directory doesn't exist or has no PG_VERSION file (fresh DB).
 */
export async function readPgVersion(dataDir: string): Promise<number | null> {
    try {
        const content = await fs.readFile(path.join(dataDir, 'PG_VERSION'), 'utf8');
        const version = parseInt(content.trim(), 10);
        return Number.isFinite(version) ? version : null;
    } catch {
        return null;
    }
}

/** The PG major version that the current PGlite (0.4.x) produces. */
export const CURRENT_PG_VERSION = 17;
