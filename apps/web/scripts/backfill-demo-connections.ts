import { ensureOrganizationDefaults } from '../lib/demo/organization-defaults';
import 'dotenv/config';
import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { organizations } from '@dory/database/postgres/schemas/organizations/organizations';

async function main() {
    const client = await getClient();
    const db = await getDBService();

    const rows = await client.select({
        id: organizations.id,
        ownerUserId: organizations.ownerUserId,
        name: organizations.name,
    }).from(organizations);

    let created = 0;
    let updated = 0;
    let exists = 0;
    let skipped = 0;
    let failed = 0;

    for (const organization of rows) {
        try {
            const result = await ensureOrganizationDefaults(db, organization.ownerUserId, organization.id);
            if (result === 'created') created += 1;
            if (result === 'updated') updated += 1;
            if (result === 'exists') exists += 1;
            if (result === 'skipped') skipped += 1;
            console.log(`[backfill-demo] ${result} demo connection for org ${organization.id} (${organization.name})`);
        } catch (error) {
            failed += 1;
            console.error(`[backfill-demo] failed for org ${organization.id} (${organization.name})`, error);
        }
    }

    console.log('[backfill-demo] complete', {
        organizations: rows.length,
        created,
        updated,
        exists,
        skipped,
        failed,
    });

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('[backfill-demo] fatal error', error);
    process.exit(1);
});
