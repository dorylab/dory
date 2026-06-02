import assert from 'node:assert/strict';
import test from 'node:test';

import { getConnectionLocationLabel } from '@/lib/connection/display';
import {
    normalizeClickhouseConnectionForForm,
    normalizeClickhouseConnectionForSubmit,
} from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/clickhouse';

test('ClickHouse SSL connection keeps HTTPS host and HTTP port across save, display, and edit', () => {
    const submitted = normalizeClickhouseConnectionForSubmit({
        type: 'clickhouse',
        name: 'SSL ClickHouse',
        host: 'https://192.168.0.165',
        port: 9000,
        httpPort: 8443,
        ssl: true,
        database: '',
    });

    assert.equal(submitted.httpPort, 8443);
    assert.equal(JSON.parse(submitted.options).protocol, 'https');
    assert.equal(JSON.parse(submitted.options).httpPort, 8443);

    assert.equal(
        getConnectionLocationLabel({
            ...submitted,
            id: 'connection-id',
            createdByUserId: 'user-id',
            organizationId: 'organization-id',
            engine: 'clickhouse',
            description: null,
            path: null,
            status: 'Connected',
            configVersion: 1,
            validationErrors: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lastUsedAt: null,
            environment: '',
            tags: '',
        }),
        'https://192.168.0.165:8443',
    );

    assert.equal(normalizeClickhouseConnectionForForm(submitted).host, 'https://192.168.0.165');
    assert.equal(normalizeClickhouseConnectionForForm(submitted).httpPort, 8443);
});

test('ClickHouse display prefers configured HTTP port over native port', () => {
    assert.equal(
        getConnectionLocationLabel({
            type: 'clickhouse',
            engine: 'clickhouse',
            host: '192.168.0.165',
            port: 9000,
            httpPort: 8443,
            options: JSON.stringify({ ssl: true, useSSL: true, protocol: 'https', httpPort: 8443 }),
        } as any),
        'https://192.168.0.165:8443',
    );
});

