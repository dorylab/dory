import { getDBService, type DBService } from '@dory/database';

import { bootstrapAnonymousOrganization } from '@/lib/auth/anonymous';
import { ensureHackerNewsDemoConnection } from '@/lib/demo/ensure-hacker-news-demo-connection';

export async function bootstrapHackerNewsEmbedDemo(params: { auth: any; session: any; headers?: Headers }) {
    const organization = await bootstrapAnonymousOrganization({
        auth: params.auth,
        session: params.session,
        headers: params.headers,
        provisioningKind: 'embed_demo',
        ensureDefaults: async (db: DBService, userId: string, organizationId: string) => {
            await ensureHackerNewsDemoConnection(db, userId, organizationId);
        },
    });
    const db = await getDBService();
    const connection = await ensureHackerNewsDemoConnection(db, params.session.user.id, organization.id);
    await db.organizations.setResultSetStorageSettings(organization.id, { retentionDays: 1 });

    return { organization, connection };
}
