import { getDBService } from '@dory/database';

import { deleteAnonymousUserLocally } from '@/lib/auth/anonymous';
import { EMBED_DEMO_TTL_MS } from './config';

export async function cleanupExpiredHackerNewsEmbedDemos(now = new Date()) {
    const db = await getDBService();
    const before = new Date(now.getTime() - EMBED_DEMO_TTL_MS);
    const demos = await db.organizations.listExpiredEmbedDemos(before);
    const failures: Array<{ userId: string; error: string }> = [];
    let deleted = 0;

    for (const demo of demos) {
        try {
            await db.resultSets.cleanupExpiredResultSets({ organizationId: demo.organizationId, now, limit: 500 });
            await deleteAnonymousUserLocally(demo.ownerUserId);
            deleted += 1;
        } catch (error) {
            failures.push({ userId: demo.ownerUserId, error: error instanceof Error ? error.message : String(error) });
        }
    }

    const deletedRateBuckets = await db.embedDemo.deleteBucketsUpdatedBefore(new Date(now.getTime() - 8 * EMBED_DEMO_TTL_MS));
    return { before: before.toISOString(), candidates: demos.length, deleted, deletedRateBuckets, failures };
}
