import fs from 'node:fs';
import type { DBService } from '@dory/database';
import { DEMO_SQLITE_CONNECTION_PATH } from './connection-path';
import { getDemoSqlitePath } from './paths';

const DEMO_CONNECTION_NAME = 'Demo Database';
type DemoConnectionService = Pick<DBService, 'connections'>;
export type EnsureDemoConnectionResult = 'created' | 'updated' | 'exists' | 'skipped';

/**
 * Ensure a "Demo Database" SQLite connection exists for the given organization.
 * Idempotent: skips if the connection already exists or if the demo.sqlite file is not available.
 */
export async function ensureDemoConnection(
    db: DemoConnectionService,
    userId: string,
    organizationId: string,
): Promise<EnsureDemoConnectionResult> {
    const demoPath = getDemoSqlitePath();
    if (!demoPath || !fs.existsSync(demoPath)) {
        console.log('[demo] demo.sqlite not found, skipping demo connection creation');
        return 'skipped';
    }

    const existing = await db.connections.list(organizationId);
    const existingDemoConnection = existing.find(item => item.connection.name === DEMO_CONNECTION_NAME);
    if (existingDemoConnection) {
        if (existingDemoConnection.connection.path !== DEMO_SQLITE_CONNECTION_PATH) {
            await db.connections.update(organizationId, existingDemoConnection.connection.id, {
                connection: {
                    organizationId,
                    type: 'sqlite',
                    engine: 'sqlite',
                    name: existingDemoConnection.connection.name,
                    description: existingDemoConnection.connection.description ?? undefined,
                    host: existingDemoConnection.connection.host,
                    port: existingDemoConnection.connection.port,
                    httpPort: existingDemoConnection.connection.httpPort ?? undefined,
                    database: existingDemoConnection.connection.database ?? undefined,
                    options: existingDemoConnection.connection.options,
                    status: existingDemoConnection.connection.status,
                    environment: existingDemoConnection.connection.environment,
                    tags: existingDemoConnection.connection.tags,
                    path: DEMO_SQLITE_CONNECTION_PATH,
                },
                identities: [],
            });
            return 'updated';
        }
        return 'exists';
    }

    console.log(`[demo] creating "${DEMO_CONNECTION_NAME}" connection for org ${organizationId}`);

    await db.connections.create(userId, organizationId, {
        connection: {
            organizationId,
            type: 'sqlite',
            engine: 'sqlite',
            name: DEMO_CONNECTION_NAME,
            description: 'Built-in demo database with sample users, orders, and logs data',
            host: null,
            port: null,
            database: 'main',
            path: DEMO_SQLITE_CONNECTION_PATH,
        },
        identities: [
            {
                id: '',
                connectionId: '',
                organizationId,
                name: 'Default',
                username: 'sqlite',
                role: undefined,
                options: '{}',
                isDefault: true,
                database: 'main',
                enabled: true,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                password: undefined,
            },
        ],
    });

    console.log(`[demo] "${DEMO_CONNECTION_NAME}" connection created`);
    return 'created';
}
