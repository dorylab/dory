import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { stringify } from 'yaml';

import type { OssieDocument } from '@dory/database/postgres/schemas';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

test('Knowledge imports and displays the new Ossie format and rejects legacy files without changing the model', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const call = async <T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> => {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(response.ok(), JSON.stringify(body)).toBe(true);
        expect(body.ok).toBe(true);
        return body.data as T;
    };
    const connections = await call<{ connections: Array<{ connection: { id: string } }> }>('connection.list', {});
    expect(connections.connections.length).toBeGreaterThan(0);
    const connectionId = connections.connections[0].connection.id;
    type Model = {
        id: string;
        ossieVersion: string;
        modelRevision: string;
        modelYaml: string;
        ossieDocument: OssieDocument;
        model: { definitions: Array<{ name: string; status: string; datatype?: string; timeDimension?: string }> };
    };
    const created = await call<Model>('knowledge.create', { name: `ossie-contract-${randomUUID()}`, connectionIds: [connectionId] });
    try {
        expect(created.ossieVersion).toBe(OSSIE_VERSION);
        const document: OssieDocument = {
            version: OSSIE_VERSION,
            name: `ossie_contract_${randomUUID().replaceAll('-', '')}`,
            ai_context: { instructions: 'Use the canonical model.', audience: 'test' },
            datasets: [
                {
                    name: 'orders',
                    source: 'public.orders',
                    fields: [
                        { name: 'amount', datatype: 'Decimal', expression: { dialects: [{ dialect: 'BIGQUERY', expression: 'amount' }] } },
                        { name: 'event_time', datatype: 'DateTimeTz', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'event_time' }] } },
                        { name: 'audit_time', datatype: 'DateTime', dimension: { is_time: false }, expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'audit_time' }] } },
                    ],
                },
            ],
            metrics: [
                {
                    name: 'revenue',
                    datatype: 'Decimal',
                    expression: {
                        dialects: [
                            { dialect: 'BIGQUERY', expression: 'SUM(orders.amount)' },
                            { dialect: 'ANSI_SQL', expression: 'SUM(orders.amount)' },
                        ],
                    },
                },
            ],
            custom_extensions: [{ vendor_name: 'DORY_E2E_VENDOR', data: '{"preserved":true}' }],
        };
        const imported = await call<Model>('knowledge.importYaml', { knowledgeModelId: created.id, source: stringify(document), fallbackSourceConnectionId: connectionId });
        expect(imported.ossieDocument.version).toBe(OSSIE_VERSION);
        expect(imported.ossieDocument).not.toHaveProperty('semantic_model');
        expect(imported.ossieDocument.custom_extensions).toEqual(document.custom_extensions);
        expect(imported.ossieDocument.metrics![0].expression).toEqual(document.metrics![0].expression);
        expect(imported.model.definitions.find(item => item.name === 'amount')?.datatype).toBe('Decimal');
        expect(imported.model.definitions.find(item => item.name === 'event_time')?.timeDimension).toBe('event_time');
        expect(imported.model.definitions.find(item => item.name === 'audit_time')?.timeDimension).toBeUndefined();
        expect(imported.model.definitions.every(item => item.status === 'unverified')).toBe(true);

        const legacy = await request.post('/api/actions/execute', {
            data: {
                actionId: 'knowledge.importYaml',
                input: {
                    knowledgeModelId: created.id,
                    source: 'version: 0.1.1\nsemantic_model:\n  - name: legacy\n    datasets:\n      - name: orders\n        source: public.orders\n',
                    fallbackSourceConnectionId: connectionId,
                },
            },
        });
        const rejection = await legacy.json();
        expect(rejection.ok).toBe(false);
        expect(rejection.message).toContain(OSSIE_VERSION);
        const unchanged = await call<Model>('knowledge.get', { knowledgeModelId: created.id });
        expect(unchanged.ossieDocument).toEqual(imported.ossieDocument);
        expect(unchanged.modelRevision).toBe(imported.modelRevision);
        expect(unchanged.modelYaml).toBe(imported.modelYaml);

        await page.goto(`/${organization}/knowledge/${created.id}`);
        await expect(page.getByText(`Apache Ossie ${OSSIE_VERSION} · rev ${imported.modelRevision.slice(0, 8)}`, { exact: true })).toBeVisible();
    } finally {
        await call('knowledge.delete', { knowledgeModelId: created.id }, 'ossie-e2e-cleanup');
    }
});
