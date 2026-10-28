import { openDataSources } from './helpers/navigation';
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
    dialect: 'ANSI_SQL' as const,
    description: 'Distance of the trip in miles.',
    aliases: ['distance'],
    aiContext: { instructions: 'Use positive trip distance.', synonyms: ['distance'], examples: ['Average trip distance'] },
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
    modelYaml: 'version: 0.2.0.dev0\nname: taxi_knowledge\ndatasets:\n  - name: trips\n    source: trips\n',
    ossieVersion: '0.2.0.dev0' as const,
    modelRevision: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ossieDocument: { version: '0.2.0.dev0', name: 'taxi_knowledge', datasets: [{ name: 'trips', source: 'trips' }], metrics: [], relationships: [] },
    model: { definitions: [definition] },
    dataSources: [{ connectionId: 'connection-1', name: 'Taxi data', type: 'postgres', engine: 'postgres' }],
    verifiedQueryCount: 0,
    knowledgeSourceCount: 0,
    readiness: {
        status: 'ready' as const,
        requirements: { dataSource: true, verifiedDefinition: true },
    },
    agentUnderstands: [{ id: definition.id, name: definition.name, kind: definition.kind }],
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
    await openDataSources(page);
    return new URL(page.url()).pathname.split('/')[1]!;
}

test('knowledge overview separates readiness from verified query coverage', async ({ page }) => {
    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        if (body.actionId === 'knowledge.get') {
            await actionResponse(route, model);
            return;
        }
        if (body.actionId === 'knowledge.listVerifiedQueries') {
            await actionResponse(route, { queries: [] });
            return;
        }
        if (body.actionId === 'knowledge.listKnowledgeSources') {
            await actionResponse(route, { sources: [] });
            return;
        }
        if (body.actionId === 'knowledge.getGraph') {
            await actionResponse(route, { queryDefinitionEdges: [], sourceAssetEdges: [] });
            return;
        }
        if (body.actionId === 'connection.list') {
            await actionResponse(route, { connections: [] });
            return;
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);

    const pageHeader = page.locator('main > header').first();
    await expect(pageHeader.getByRole('link', { name: 'Knowledge', exact: true })).toHaveAttribute('href', /\/knowledge$/);
    await expect(page.getByText('Ready for Agent', { exact: true })).toBeVisible();
    await expect(page.getByText('1 connected data source', { exact: true })).toBeVisible();
    await expect(page.getByText('1 verified business definition', { exact: true })).toBeVisible();
    await expect(page.getByText('0 verified queries', { exact: true })).toBeVisible();
    await expect(page.getByText('Suggested', { exact: true })).toBeVisible();
    await expect(page.getByText('No verified queries yet', { exact: true })).toBeVisible();
    await expect(page.getByText('Connected Data Sources', { exact: true })).toBeVisible();
    await expect(page.getByText('Knowledge Sources', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent Context', { exact: true })).toBeVisible();
    await expect(page.getByText('Business context and rules', { exact: true })).toBeVisible();
    await expect(page.getByText('Business semantics', { exact: true })).toBeVisible();
    await expect(page.getByText('Trusted query patterns', { exact: true })).toBeVisible();
    await expect(page.getByText('Apache Ossie 0.2.0.dev0 · rev 01234567', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByText('Agent Context', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

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
        if (body.actionId === 'knowledge.listVerifiedQueries') {
            await actionResponse(route, { queries: [] });
            return;
        }
        if (body.actionId === 'knowledge.listKnowledgeSources') {
            await actionResponse(route, { sources: [] });
            return;
        }
        if (body.actionId === 'knowledge.getGraph') {
            await actionResponse(route, { queryDefinitionEdges: [], sourceAssetEdges: [] });
            return;
        }
        if (body.actionId === 'connection.list') {
            await actionResponse(route, { connections: [] });
            return;
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Semantic model' }).click();
    const detailsToggle = page.getByRole('button', { name: 'Show details for Trip Distance' });
    await detailsToggle.click();

    const closeDetailsToggle = page.getByRole('button', { name: 'Hide details for Trip Distance' });
    await expect(closeDetailsToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Business definition', { exact: true })).toBeVisible();
    await expect(page.getByText('Calculation expression', { exact: true })).toBeVisible();
    await expect(page.getByText('No linked items yet', { exact: true })).toHaveCount(2);

    await closeDetailsToggle.focus();
    await page.keyboard.press('Enter');
    const reopenDetailsToggle = page.getByRole('button', { name: 'Show details for Trip Distance' });
    await expect(reopenDetailsToggle).toHaveAttribute('aria-expanded', 'false');
    await reopenDetailsToggle.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Hide details for Trip Distance' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Edit Trip Distance' }).click();

    await expect(page.getByRole('dialog', { name: 'Edit definition' })).toBeVisible();
    await expect(page.getByLabel('Business definition')).toHaveValue('Distance of the trip in miles.');
    await page.getByLabel('Business definition').fill('Total distance traveled for a trip.');
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
            dialect: 'ANSI_SQL',
            aiContext: { instructions: 'Use positive trip distance.', synonyms: ['distance'], examples: ['Average trip distance'] },
        },
    });
    await expect(page.getByRole('dialog', { name: 'Edit definition' })).toBeHidden();
});

test('definition details show query links and edit knowledge source relationships', async ({ page }) => {
    const source = { id: 'source-1', fileName: 'metrics.md', format: 'markdown' as const, connectionId: null };
    const otherSource = {
        id: 'source-2',
        fileName: 'Operations.md · 32ad9c37 · be635b76-4b00-4efc-8129-832bc72d15f8.md',
        format: 'markdown' as const,
        connectionId: null,
        connectorProvider: 'linear',
        connectorId: 'kc_32ad9c37',
        remotePath: 'document/be635b76-4b00-4efc-8129-832bc72d15f8.md',
    };
    const query = {
        id: 'query-1',
        knowledgeModelId: modelId,
        sourceConnectionId: 'connection-1',
        title: 'Average trip distance',
        question: 'What is the average trip distance?',
        sql: 'SELECT AVG(trip_distance) FROM trips',
        description: null,
        definitionIds: [definition.id],
        sourceType: 'manual',
        sourceId: null,
        createdBy: 'user-1',
        updatedBy: 'user-1',
        updatedByName: 'Demo User',
        createdAt: now,
        updatedAt: now,
    };
    let selectedSourceIds = [source.id];
    let updatedSourceIds: string[] | null = null;

    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input?: { sourceIds?: string[] } };
        if (body.actionId === 'knowledge.get') return actionResponse(route, model);
        if (body.actionId === 'knowledge.listVerifiedQueries') return actionResponse(route, { queries: [query] });
        if (body.actionId === 'knowledge.listKnowledgeSources') return actionResponse(route, { sources: [source, otherSource] });
        if (body.actionId === 'knowledge.getGraph') {
            return actionResponse(route, {
                queryDefinitionEdges: [{ queryId: query.id, definitionId: definition.id }],
                sourceAssetEdges: selectedSourceIds.map(sourceId => ({
                    sourceId,
                    assetType: 'definition',
                    assetId: definition.id,
                    relationType: 'provided',
                })),
            });
        }
        if (body.actionId === 'knowledge.replaceAssetSources') {
            updatedSourceIds = body.input?.sourceIds ?? [];
            selectedSourceIds = updatedSourceIds;
            return actionResponse(route, { ok: true });
        }
        if (body.actionId === 'connection.list') return actionResponse(route, { connections: [] });
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Semantic model' }).click();
    await page.getByRole('button', { name: 'Show details for Trip Distance' }).click();

    const queryLink = page.getByRole('link', { name: query.title });
    await expect(queryLink).toHaveAttribute('href', /tab=queries&query=query-1/);
    const sourcesCard = page.getByRole('heading', { name: 'Linked Knowledge Sources', exact: true }).locator('xpath=ancestor::section[1]');
    await expect(sourcesCard.getByRole('link', { name: source.fileName, exact: true })).toBeVisible();
    await expect(sourcesCard.getByRole('checkbox')).toHaveCount(0);
    await expect(sourcesCard.getByText('Operations.md', { exact: true })).toHaveCount(0);
    await expect(sourcesCard.getByText('Provided', { exact: true })).toBeVisible();
    await expect(sourcesCard.getByRole('link', { name: `Open ${source.fileName}` })).toHaveAttribute('href', /tab=sources&source=source-1/);

    await sourcesCard.getByRole('button', { name: 'Edit linked documents' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit linked documents' });
    await expect(dialog.getByRole('checkbox', { name: source.fileName })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Operations.md', exact: true })).not.toBeChecked();
    await expect(dialog.getByRole('link', { name: 'Add Knowledge Source' })).toHaveCount(0);
    await expect(dialog.getByText('Select existing documents to link. Changes apply when saved.', { exact: true })).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'Operations.md', exact: true }).click();
    expect(updatedSourceIds).toBeNull();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(sourcesCard.getByText('Operations.md', { exact: true })).toHaveCount(0);
    expect(updatedSourceIds).toBeNull();

    await sourcesCard.getByRole('button', { name: 'Edit linked documents' }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Operations.md', exact: true })).not.toBeChecked();
    await dialog.getByRole('textbox', { name: 'Search documents' }).fill('Operations');
    await dialog.getByRole('checkbox', { name: 'Operations.md', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => updatedSourceIds).toEqual([source.id, otherSource.id]);
    await expect(sourcesCard.getByRole('link', { name: 'Operations.md', exact: true })).toBeVisible();
    await expect(sourcesCard).not.toContainText('32ad9c37');
    await expect(sourcesCard.getByRole('checkbox')).toHaveCount(0);

    await sourcesCard.getByRole('button', { name: 'Edit linked documents' }).click();
    await dialog.getByRole('checkbox', { name: source.fileName }).click();
    await dialog.getByRole('checkbox', { name: 'Operations.md', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => updatedSourceIds).toEqual([]);
    await expect(sourcesCard.getByText('No linked items yet', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByRole('heading', { name: 'Verified Queries using this definition' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked Knowledge Sources' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('verified query details identify the updater and organize relationships', async ({ page }) => {
    const source = { id: 'source-1', fileName: 'query-rules.md', format: 'markdown' as const, connectionId: null };
    const otherSource = { ...source, id: 'source-2', fileName: 'operations.md' };
    const otherDefinition = { ...definition, id: 'measure:other', name: 'Other trip measure' };
    const queryModel = { ...model, model: { definitions: [definition, otherDefinition] } };
    let selectedSourceIds = [source.id];
    let selectedDefinitionIds = [definition.id];
    const sourceWrites: string[][] = [];
    const definitionWrites: string[][] = [];
    const query = {
        id: 'query-1',
        knowledgeModelId: modelId,
        sourceConnectionId: 'connection-1',
        title: 'Average trip distance',
        question: 'What is the average trip distance?',
        sql: 'SELECT AVG(trip_distance) FROM trips',
        description: null,
        definitionIds: [definition.id],
        sourceType: 'workspace',
        sourceId: null,
        createdBy: 'user-1',
        updatedBy: 'user-2',
        updatedByName: 'Avery Chen',
        createdAt: now,
        updatedAt: now,
    };

    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as {
            actionId: string;
            input: { assetType?: string; assetId?: string; sourceIds?: string[]; definitionIds?: string[]; knowledgeSourceIds?: string[]; sql?: string };
        };
        if (body.actionId === 'knowledge.get') return actionResponse(route, queryModel);
        if (body.actionId === 'knowledge.listVerifiedQueries') return actionResponse(route, { queries: [{ ...query, definitionIds: selectedDefinitionIds }] });
        if (body.actionId === 'knowledge.listKnowledgeSources') return actionResponse(route, { sources: [source, otherSource] });
        if (body.actionId === 'knowledge.getGraph') {
            return actionResponse(route, {
                queryDefinitionEdges: selectedDefinitionIds.map(definitionId => ({ queryId: query.id, definitionId })),
                sourceAssetEdges: selectedSourceIds.map(sourceId => ({ sourceId, assetType: 'verified_query', assetId: query.id, relationType: 'provided' })),
            });
        }
        if (body.actionId === 'knowledge.replaceAssetSources') {
            expect(body.input.assetType).toBe('verified_query');
            expect(body.input.assetId).toBe(query.id);
            selectedSourceIds = body.input.sourceIds ?? [];
            sourceWrites.push(selectedSourceIds);
            return actionResponse(route, { ok: true });
        }
        if (body.actionId === 'knowledge.updateVerifiedQuery') {
            expect(body.input.sql).toBe(query.sql);
            expect(body.input.knowledgeSourceIds).toEqual(selectedSourceIds);
            selectedDefinitionIds = body.input.definitionIds ?? [];
            definitionWrites.push(selectedDefinitionIds);
            return actionResponse(route, { ...query, definitionIds: selectedDefinitionIds });
        }
        if (body.actionId === 'connection.list') return actionResponse(route, { connections: [] });
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Verified queries' }).click();

    await expect(page.getByText('Updated by Avery Chen', { exact: false })).toBeVisible();
    await expect(page.getByText('workspace', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Average trip distance', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Referenced Definitions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked Knowledge Sources' })).toBeVisible();
    const definitionsCard = page.getByRole('heading', { name: 'Referenced Definitions', exact: true }).locator('xpath=ancestor::section[1]');
    const sourcesCard = page.getByRole('heading', { name: 'Linked Knowledge Sources', exact: true }).locator('xpath=ancestor::section[1]');
    await expect(definitionsCard.getByRole('link', { name: definition.name, exact: true })).toBeVisible();
    await expect(sourcesCard.getByRole('link', { name: source.fileName, exact: true })).toBeVisible();
    await expect(definitionsCard.getByRole('checkbox')).toHaveCount(0);
    await expect(sourcesCard.getByRole('checkbox')).toHaveCount(0);
    await expect(definitionsCard.getByText(otherDefinition.name, { exact: true })).toHaveCount(0);
    await expect(sourcesCard.getByText(otherSource.fileName, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Provided', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: `Open ${source.fileName}` })).toHaveAttribute('href', /tab=sources&source=source-1/);

    await sourcesCard.getByRole('button', { name: 'Edit linked documents' }).click();
    const sourceDialog = page.getByRole('dialog', { name: 'Edit linked documents' });
    await expect(sourceDialog.getByRole('link')).toHaveCount(0);
    await expect(sourceDialog.getByRole('checkbox', { name: source.fileName })).toBeChecked();
    await sourceDialog.getByRole('checkbox', { name: otherSource.fileName }).click();
    expect(sourceWrites).toEqual([]);
    await sourceDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sourcesCard.getByText(otherSource.fileName, { exact: true })).toHaveCount(0);
    await sourcesCard.getByRole('button', { name: 'Edit linked documents' }).click();
    await expect(sourceDialog.getByRole('checkbox', { name: otherSource.fileName })).not.toBeChecked();
    await sourceDialog.getByRole('checkbox', { name: otherSource.fileName }).click();
    await sourceDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(sourceDialog).toBeHidden();
    await expect(sourcesCard.getByRole('link', { name: otherSource.fileName, exact: true })).toBeVisible();
    expect(sourceWrites).toEqual([[source.id, otherSource.id]]);

    await definitionsCard.getByRole('button', { name: 'Edit linked definitions' }).click();
    const definitionDialog = page.getByRole('dialog', { name: 'Edit linked definitions' });
    await expect(definitionDialog.getByRole('link')).toHaveCount(0);
    await expect(definitionDialog.getByRole('checkbox', { name: definition.name })).toBeChecked();
    await definitionDialog.getByRole('checkbox', { name: otherDefinition.name }).click();
    expect(definitionWrites).toEqual([]);
    await definitionDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(definitionsCard.getByText(otherDefinition.name, { exact: true })).toHaveCount(0);
    await definitionsCard.getByRole('button', { name: 'Edit linked definitions' }).click();
    await expect(definitionDialog.getByRole('checkbox', { name: otherDefinition.name })).not.toBeChecked();
    await definitionDialog.getByRole('textbox', { name: 'Search definitions' }).fill('Other trip');
    await definitionDialog.getByRole('checkbox', { name: otherDefinition.name }).click();
    await definitionDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(definitionDialog).toBeHidden();
    await expect(definitionsCard.getByRole('link', { name: otherDefinition.name, exact: true })).toBeVisible();
    expect(definitionWrites).toEqual([[definition.id, otherDefinition.id]]);
    await expect(definitionsCard.getByRole('checkbox')).toHaveCount(0);
    await expect(sourcesCard.getByRole('checkbox')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByRole('heading', { name: 'Referenced Definitions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked Knowledge Sources' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    await page.getByRole('dialog').getByRole('button', { name: 'GitHub', exact: true }).click();
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
    await page.getByRole('dialog').getByRole('button', { name: 'GitHub', exact: true }).click();
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
        if (body.actionId === 'knowledge.getKnowledgeSource') {
            return actionResponse(route, {
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
                contentText: '# GitHub source snapshot',
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
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'dorylab/docs · docs › readme.md' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GitHub source snapshot' })).toBeVisible();
    await page.getByRole('dialog', { name: 'dorylab/docs · docs › readme.md' }).getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(page).not.toHaveURL(/\bsource=/);
    await page.getByRole('button', { name: /Actions for/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
});

test('knowledge source viewer reads Linear snapshots, local text and YAML, and handles empty content and retries', async ({ page }) => {
    let linearLoads = 0;
    const sourceBase = {
        organizationId: organization,
        knowledgeModelId: modelId,
        connectionId: null,
        byteSize: 100,
        createdBy: 'user-1',
        createdAt: now,
        updatedAt: now,
    };
    const linearSource = {
        ...sourceBase,
        id: 'linear-source',
        fileName: 'Linear guide.md',
        format: 'markdown',
        connectorId: 'linear-connector',
        connectorProvider: 'linear',
        sourceUrl: 'https://linear.app/example/document/guide',
        remotePath: 'document/guide',
    };
    const localSource = {
        ...sourceBase,
        id: 'local-source',
        fileName: 'Local notes.txt',
        format: 'text',
        connectorId: null,
        connectorProvider: null,
        sourceUrl: null,
        remotePath: null,
    };
    const yamlSource = { ...localSource, id: 'yaml-source', fileName: 'Schema.yaml', format: 'yaml' };
    const emptySource = { ...localSource, id: 'empty-source', fileName: 'Empty.txt' };
    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input?: { id?: string } };
        if (body.actionId === 'knowledge.get') return actionResponse(route, model);
        if (body.actionId === 'knowledge.listKnowledgeSources') return actionResponse(route, { sources: [linearSource, localSource, yamlSource, emptySource] });
        if (body.actionId === 'knowledge.listConnectors') return actionResponse(route, { connectors: [] });
        if (body.actionId === 'knowledge.getLinearConnectorSetup') return actionResponse(route, { canManage: false, configured: true });
        if (body.actionId === 'knowledge.getKnowledgeSource') {
            if (body.input?.id === linearSource.id) {
                linearLoads += 1;
                if (linearLoads === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Temporary failure' }) });
                return actionResponse(route, { ...linearSource, contentText: '# Linear snapshot\n\n| Metric | Value |\n| --- | --- |\n| GMV | USD |' });
            }
            if (body.input?.id === localSource.id) return actionResponse(route, { ...localSource, contentText: 'Line one\nLine two' });
            if (body.input?.id === yamlSource.id) return actionResponse(route, { ...yamlSource, contentText: 'version: 1\nname: Example' });
            return actionResponse(route, { ...emptySource, contentText: '' });
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.getByRole('tab', { name: 'Knowledge sources' }).click();
    const linearRow = page.getByRole('row').filter({ hasText: 'Linear guide.md' });
    await linearRow.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const linearViewer = page.getByRole('dialog', { name: 'Linear guide.md' });
    await expect(linearViewer.getByText('Could not load the knowledge source.')).toBeVisible();
    await linearViewer.getByRole('button', { name: 'Retry' }).click();
    await expect(linearViewer.getByRole('heading', { name: 'Linear snapshot' })).toBeVisible();
    await expect(linearViewer.getByRole('cell', { name: 'GMV' })).toBeVisible();
    await expect(linearViewer.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', linearSource.sourceUrl);
    await linearViewer.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(page).not.toHaveURL(/\bsource=/);

    const localRow = page.getByRole('row').filter({ hasText: 'Local notes.txt' });
    await localRow.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const localViewer = page.getByRole('dialog', { name: 'Local notes.txt' });
    await expect(localViewer.locator('pre')).toHaveText('Line one\nLine two');
    await expect(localViewer.getByRole('link', { name: 'Open original' })).toHaveCount(0);
    await localViewer.getByRole('button', { name: 'Close', exact: true }).first().click();

    const yamlRow = page.getByRole('row').filter({ hasText: 'Schema.yaml' });
    await yamlRow.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const yamlViewer = page.getByRole('dialog', { name: 'Schema.yaml' });
    await expect(yamlViewer.locator('pre')).toHaveText('version: 1\nname: Example');
    await yamlViewer.getByRole('button', { name: 'Close', exact: true }).first().click();

    const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
    await page.setViewportSize({ width: 375, height: 812 });
    const emptyRow = page.getByRole('row').filter({ hasText: 'Empty.txt' });
    await emptyRow.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const emptyViewer = page.getByRole('dialog', { name: 'Empty.txt' });
    await expect(emptyViewer.getByText('This source has no content.')).toBeVisible();
    const bounds = await emptyViewer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(await emptyViewer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

for (const scenario of ['no sources', 'unselected source', 'selected source'] as const) {
    test(`AI suggestions can be generated and saved with ${scenario}`, async ({ page }) => {
        const source = { id: 'source-1', fileName: 'metrics.md', format: 'markdown', connectionId: null };
        const expectedIds = scenario === 'selected source' ? [source.id] : [];
        let generatedInput: Record<string, unknown> | undefined;
        let linkedInput: Record<string, unknown> | undefined;
        let releaseGeneration!: () => void;
        const generationGate = new Promise<void>(resolve => (releaseGeneration = resolve));

        await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
        await page.route('**/api/actions/execute', async route => {
            const body = route.request().postDataJSON() as { actionId: string; input: Record<string, unknown> };
            if (body.actionId === 'knowledge.get') return actionResponse(route, model);
            if (body.actionId === 'knowledge.listVerifiedQueries') return actionResponse(route, { queries: [] });
            if (body.actionId === 'knowledge.listKnowledgeSources') return actionResponse(route, { sources: scenario === 'no sources' ? [] : [source] });
            if (body.actionId === 'knowledge.getGraph') return actionResponse(route, { queryDefinitionEdges: [], sourceAssetEdges: [] });
            if (body.actionId === 'connection.list') return actionResponse(route, { connections: [] });
            if (body.actionId === 'knowledge.generateSuggestions') {
                generatedInput = body.input;
                await generationGate;
                return actionResponse(route, { suggestions: [{ ...definition, id: 'suggestion-1', name: 'Suggested distance' }] });
            }
            if (body.actionId === 'knowledge.saveDefinitions') return actionResponse(route, { ...model, model: { definitions: body.input.definitions } });
            if (body.actionId === 'knowledge.replaceAssetSources') {
                linkedInput = body.input;
                return actionResponse(route, { ok: true });
            }
            await route.fallback();
        });

        await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
        await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Ask AI' });
        if (scenario === 'no sources') await expect(dialog.getByText('Knowledge sources are optional. Add one to provide additional context.')).toBeVisible();
        if (scenario === 'selected source') await dialog.getByRole('checkbox', { name: source.fileName }).check();
        await dialog.getByRole('button', { name: 'Generate suggestions' }).click();
        await expect.poll(() => generatedInput).toMatchObject({ knowledgeSourceIds: expectedIds });
        await expect(dialog.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
        releaseGeneration();
        await expect(dialog.getByText('Suggested distance')).toBeVisible();
        await dialog.getByRole('button', { name: /Review and add/i }).click();
        await expect.poll(() => linkedInput).toMatchObject({ assetId: 'suggestion-1', sourceIds: expectedIds, relationType: 'generated' });
    });
}
