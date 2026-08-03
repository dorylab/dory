import fs from 'node:fs';

import type { DBService } from '@dory/database';
import { createCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { HACKER_NEWS_DEMO_DUCKDB_CONNECTION_PATH } from './connection-path';
import { resolveHackerNewsDemoDuckDbPath } from './paths';

export const HACKER_NEWS_DEMO_CONNECTION_NAME = 'Hacker News Demo';

type DemoConnectionService = Pick<DBService, 'connections'>;

function createDuckDbIdentity(organizationId: string) {
    const identity = createCredentiallessDefaultIdentity({ type: 'duckdb', engine: 'duckdb', database: 'hacker_news' });
    return {
        ...identity,
        connectionId: '',
        organizationId,
        role: undefined,
        database: 'hacker_news',
        password: undefined,
        options: '{}',
    };
}

export async function ensureHackerNewsDemoConnection(db: DemoConnectionService, userId: string, organizationId: string) {
    const resourcePath = resolveHackerNewsDemoDuckDbPath();
    if (!fs.existsSync(resourcePath)) {
        throw new Error('hacker_news_demo_resource_missing');
    }

    const existing = await db.connections.list(organizationId);
    const current = existing.find(item => item.connection.name === HACKER_NEWS_DEMO_CONNECTION_NAME);
    if (current) {
        return current.connection;
    }

    const created = await db.connections.create(userId, organizationId, {
        connection: {
            organizationId,
            type: 'duckdb',
            engine: 'duckdb',
            name: HACKER_NEWS_DEMO_CONNECTION_NAME,
            description: 'Read-only 30-day Hacker News Top 500 snapshot for the embedded Dory demo',
            host: null,
            port: null,
            database: 'hacker_news',
            path: HACKER_NEWS_DEMO_DUCKDB_CONNECTION_PATH,
            options: JSON.stringify({
                access_mode: 'READ_ONLY',
                instanceOptions: { access_mode: 'READ_ONLY' },
            }),
            status: 'Connected',
            environment: 'demo',
            tags: 'demo,hacker-news,read-only',
        },
        identities: [createDuckDbIdentity(organizationId)],
    });

    return created.connection;
}
