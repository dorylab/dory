import { expect, type Route } from '@playwright/test';

import { test } from './fixtures';

const organization = 'demo-getdory-dev-s-organization-kBU15DBF';
const modelId = 'knowledge-e2e';
const now = new Date('2026-09-10T00:00:00.000Z').toISOString();

const definition = {
    id: 'measure:trip-distance',
    name: 'Trip Distance',
    kind: 'measure' as const,
    status: 'verified' as const,
    sourceConnectionId: 'connection-1',
    source: 'trips',
    expression: 'trip_distance',
    description: 'Distance of the trip in miles.',
    aliases: ['distance'],
    filters: ['trip_distance > 0'],
    timeDimension: 'pickup_datetime',
    dimensions: ['pickup_location_id'],
};

let model = {
    id: modelId,
    organizationId: organization,
    name: 'Taxi knowledge',
    description: null,
    businessContextMd: '',
    modelYaml: '',
    model: { definitions: [definition] },
    dataSources: [{ connectionId: 'connection-1', name: 'Taxi data', type: 'postgres', engine: 'postgres' }],
    verifiedQueryCount: 0,
    createdAt: now,
    updatedAt: now,
};

async function actionResponse(route: Route, data: unknown) {
    await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data, execution: { actionId: 'knowledge.e2e', runId: 'knowledge-e2e', startedAt: now, finishedAt: now } }),
    });
}

async function currentOrganization(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    return new URL(page.url()).pathname.split('/')[1]!;
}

test('knowledge definitions open an editor and save an update', async ({ page }) => {
    let updatedInput: Record<string, unknown> | null = null;
    model = { ...model, model: { definitions: [{ ...definition }] } };

    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input?: Record<string, unknown> };
        if (body.actionId === 'knowledge.get') {
            await actionResponse(route, model);
            return;
        }
        if (body.actionId === 'knowledge.updateDefinition') {
            updatedInput = body.input ?? null;
            const nextDefinition = body.input?.definition as typeof definition;
            model = { ...model, model: { definitions: [nextDefinition] }, updatedAt: new Date().toISOString() };
            await actionResponse(route, model);
            return;
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Definitions' }).click();
    await page.getByRole('cell', { name: 'Trip Distance', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Trip Distance' }).click();

    await expect(page.getByRole('dialog', { name: 'Edit definition' })).toBeVisible();
    await expect(page.getByLabel('Description')).toHaveValue('Distance of the trip in miles.');
    await page.getByLabel('Description').fill('Total distance traveled for a trip.');
    await page.getByRole('button', { name: 'Save definition' }).click();

    await expect.poll(() => updatedInput).not.toBeNull();
    expect(updatedInput).toMatchObject({
        knowledgeModelId: modelId,
        definitionId: definition.id,
        definition: {
            id: definition.id,
            kind: 'measure',
            status: 'verified',
            description: 'Total distance traveled for a trip.',
            aliases: ['distance'],
            filters: ['trip_distance > 0'],
            timeDimension: 'pickup_datetime',
            dimensions: ['pickup_location_id'],
        },
    });
    await expect(page.getByRole('dialog', { name: 'Edit definition' })).toBeHidden();
});

test('knowledge sources present upload and GitHub connection entry points', async ({ page }) => {
    const actionIds: string[] = [];

    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        actionIds.push(body.actionId);
        if (body.actionId === 'knowledge.get') {
            await actionResponse(route, model);
            return;
        }
        if (body.actionId === 'knowledge.listKnowledgeSources') {
            await actionResponse(route, { sources: [] });
            return;
        }
        if (body.actionId === 'knowledge.listConnectors') {
            await actionResponse(route, { connectors: [] });
            return;
        }
        if (body.actionId === 'knowledge.getGitHubConnectorSetup') {
            await actionResponse(route, { configured: false, manualOnly: false, installUrl: null });
            return;
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Knowledge sources' }).click();

    await expect(page.getByRole('heading', { name: 'Add your first knowledge source' })).toBeVisible();
    await expect(page.getByText('Upload files or connect an existing knowledge base so agents can use unified, continuously updated business context.')).toBeVisible();

    await page.getByRole('button', { name: 'Upload file' }).click();
    await expect(page.getByRole('dialog', { name: 'Upload knowledge sources' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Connect knowledge base' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect GitHub' })).toBeVisible();
    await expect(page.getByText('GitHub connections are not configured for this Dory deployment.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByRole('menuitem', { name: 'Upload file' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Connect knowledge base' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Upload file' }).click();
    await expect(page.getByRole('dialog', { name: 'Upload knowledge sources' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('menuitem', { name: 'Connect knowledge base' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect GitHub' })).toBeVisible();
    expect(actionIds).toEqual(expect.arrayContaining(['knowledge.get', 'knowledge.listKnowledgeSources', 'knowledge.listConnectors', 'knowledge.getGitHubConnectorSetup']));
    expect(actionIds).not.toContain('knowledge.createKnowledgeSource');
});

test('GitHub-managed knowledge sources are read-only and connectors can be synchronized', async ({ page }) => {
    const actionIds: string[] = [];
    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        actionIds.push(body.actionId);
        if (body.actionId === 'knowledge.get') return actionResponse(route, model);
        if (body.actionId === 'knowledge.listConnectors') {
            return actionResponse(route, {
                connectors: [
                    {
                        id: 'connector-1',
                        organizationId: organization,
                        knowledgeModelId: modelId,
                        provider: 'github',
                        installationId: '10',
                        repositoryId: '20',
                        repositoryFullName: 'dorylab/docs',
                        defaultBranch: 'main',
                        rootPath: 'docs',
                        status: 'ready',
                        lastCommitSha: 'abc',
                        lastSyncedAt: now,
                        lastError: null,
                        createdBy: 'user-1',
                        createdAt: now,
                        updatedAt: now,
                    },
                ],
            });
        }
        if (body.actionId === 'knowledge.listKnowledgeSources') {
            return actionResponse(route, {
                sources: [
                    {
                        id: 'source-1',
                        organizationId: organization,
                        knowledgeModelId: modelId,
                        connectionId: null,
                        fileName: 'dorylab/docs · docs › readme.md · ector-1',
                        format: 'markdown',
                        byteSize: 7,
                        createdBy: 'user-1',
                        createdAt: now,
                        updatedAt: now,
                        connectorId: 'connector-1',
                        connectorProvider: 'github',
                        remotePath: 'docs/readme.md',
                    },
                ],
            });
        }
        if (body.actionId === 'knowledge.syncConnector') return actionResponse(route, { queued: true });
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Knowledge sources' }).click();
    await expect(page.getByText('dorylab/docs', { exact: true })).toBeVisible();
    await expect(page.getByText('GitHub · Read-only')).toBeVisible();
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect.poll(() => actionIds).toContain('knowledge.syncConnector');
    await page.getByRole('button', { name: /Actions for/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
});
