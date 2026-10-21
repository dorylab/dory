import { randomUUID } from 'node:crypto';
import type { OssieDocument } from '@dory/database/postgres/schemas';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';
import { expect, test } from '@playwright/test';
import { stringify } from 'yaml';

test('internal placeholder datasets stay hidden while metrics-only models can be edited and emptied', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    type Model = { id: string; model: { definitions: Array<{ id: string; name: string; expression?: string; description?: string }> } };
    async function call<T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, `${actionId}: ${body.message ?? response.status()}`).toBe(true);
        return body.data;
    }
    const connections = await call<{ connections: Array<{ connection: { id: string } }> }>('connection.list', {});
    const connectionId = connections.connections[0].connection.id;
    const created = await call<Model>('knowledge.create', { name: `电商 ${randomUUID()}`, connectionIds: [connectionId] });
    const scope = { knowledgeModelId: created.id };
    try {
        expect(created.model.definitions).toEqual([]);
        await page.goto(`/${organization}/knowledge/${created.id}?tab=definitions`);
        await expect(page.getByRole('tab', { name: /Semantic model|语义模型/ })).toHaveAttribute('data-state', 'active');
        await expect(page.getByText('item_dataset', { exact: true })).toHaveCount(0);
        await expect(page.getByText('__unconfigured__', { exact: true })).toHaveCount(0);
        const definition = {
            id: 'metric:net-revenue',
            name: 'Net revenue test',
            kind: 'metric',
            status: 'unverified',
            sourceConnectionId: connectionId,
            expression: 'SUM(net_amount)',
        };
        const added = await call<Model>('knowledge.createDefinition', { ...scope, definition });
        expect(added.model.definitions).toHaveLength(1);
        expect(added.model.definitions[0].id).toBe(definition.id);
        await page.reload();
        await expect(
            page
                .getByRole('button', { name: `Show details for ${definition.name}` })
                .or(page.getByRole('button', { name: new RegExp(definition.name) }))
                .first(),
        ).toBeVisible();
        await expect(page.getByText('__unconfigured__', { exact: true })).toHaveCount(0);
        const edited = await call<Model>('knowledge.updateDefinition', {
            ...scope,
            definitionId: definition.id,
            definition: { ...definition, description: 'Exclude failed orders.' },
        });
        expect(edited.model.definitions[0]).toMatchObject({ id: definition.id, expression: definition.expression, description: 'Exclude failed orders.' });
        const listed = await call<{ definitions: Array<{ id: string }> }>('knowledge.listDefinitions', scope);
        expect(listed.definitions.map(item => item.id)).toEqual([definition.id]);
        const emptied = await call<Model>('knowledge.deleteDefinition', { ...scope, definitionId: definition.id });
        expect(emptied.model.definitions).toEqual([]);
        await page.reload();
        await expect(page.getByText(definition.name, { exact: true })).toHaveCount(0);
        await expect(page.getByText('__unconfigured__', { exact: true })).toHaveCount(0);
    } finally {
        await call('knowledge.delete', scope, 'placeholder-e2e-cleanup');
    }
});

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
