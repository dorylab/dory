import type { DBService } from '@dory/database';

import { ensureDemoConnection } from './ensure-demo-connection';

export function ensureOrganizationDefaults(db: DBService, userId: string, organizationId: string) {
    return ensureDemoConnection(
        {
            connections: db.connections,
        },
        userId,
        organizationId,
    );
}
