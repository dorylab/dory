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

test('knowledge keeps the workspace fixed while the directory and document scroll independently', async ({ page }) => {
    const source = { id: 'scroll-document', fileName: 'Scrolling.md', format: 'markdown', updatedAt: now, folderId: null };
    const folders = Array.from({ length: 30 }, (_, index) => ({ id: 'folder-' + index, name: 'Folder ' + String(index).padStart(2, '0'), parentId: null }));
    const contentText = ['# Scrolling document', ...Array.from({ length: 55 }, (_, index) => 'Paragraph ' + index), 'End of document'].join('\n\n');
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        if (actionId === 'knowledge.get') return actionResponse(route, model);
        if (actionId === 'knowledge.listDirectory') return actionResponse(route, { canWrite: true, folders, connectors: [] });
        if (actionId === 'knowledge.listKnowledgeSources') return actionResponse(route, { sources: [source] });
        if (actionId === 'knowledge.getKnowledgeSource') return actionResponse(route, { ...source, contentText });
        await route.fallback();
    });

    await page.setViewportSize({ width: 1280, height: 550 });
    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}?file=${source.id}`);
    const breadcrumb = page.getByRole('navigation', { name: 'Folder path' });
    const search = page.getByRole('searchbox');
    const lastFolder = page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'Folder 29 0', exact: true });
    const heading = page.getByRole('heading', { name: 'Scrolling document', exact: true });
    const end = page.getByText('End of document', { exact: true });
    const workspace = page.locator('[data-slot="sidebar-inset"] > div').first();
    const workspaceOverflow = () => workspace.evaluate(element => element.scrollHeight - element.clientHeight);

    await expect(heading).toBeVisible();
    expect(await workspaceOverflow()).toBe(0);
    const breadcrumbTop = (await breadcrumb.boundingBox())!.y;
    const directoryTitle = page.getByRole('heading', { name: 'Knowledge base', exact: true });
    const directoryTop = (await directoryTitle.boundingBox())!.y;
    await expect(lastFolder).not.toBeInViewport();
    await search.hover();
    await page.mouse.wheel(0, 4000);
    await expect(lastFolder).toBeInViewport();
    expect((await directoryTitle.boundingBox())!.y).toBe(directoryTop);
    await expect(heading).toBeInViewport();

    await heading.hover();
    await page.mouse.wheel(0, 6000);
    await expect(end).toBeInViewport();
    await page.mouse.wheel(0, 1000);
    expect((await breadcrumb.boundingBox())!.y).toBe(breadcrumbTop);
    expect(await workspaceOverflow()).toBe(0);
    await expect(lastFolder).toBeInViewport();

    await page.setViewportSize({ width: 390, height: 600 });
    await page.getByRole('button', { name: 'Directory', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Directory', exact: true });
    await drawer.getByRole('searchbox').hover();
    await page.mouse.wheel(0, 4000);
    await expect(drawer.getByRole('button', { name: 'Folder 29 0', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    expect(await workspaceOverflow()).toBe(0);
});

test('knowledge opens on documents and keeps model metadata in source details', async ({ page }) => {
    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        if (body.actionId === 'knowledge.listDirectory') return actionResponse(route, { canWrite: true, folders: [], connectors: [] });
        if (body.actionId === 'knowledge.get') {
            await actionResponse(route, {
                ...model,
                dataSources: [
                    ...model.dataSources,
                    { connectionId: 'secondary', name: 'operations', type: 'sqlite', engine: 'sqlite' },
                    { connectionId: 'reports', name: '报表', type: 'postgres', engine: 'postgres' },
                    { connectionId: 'archive', name: 'Archive', type: 'sqlite', engine: 'sqlite' },
                ],
            });
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

    const pageHeader = page.locator('main header').last();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: model.name, exact: true })).toBeVisible();
    await expect(pageHeader.getByText('Connected Data Sources', { exact: true })).toHaveCount(0);
    const names = 'Taxi data · operations · 报表 · Archive';
    const group = pageHeader.getByRole('button', { name: names, exact: true });
    await expect(pageHeader).not.toContainText('Taxi data');
    await expect(group.locator('[data-slot="avatar-group"] [data-slot="avatar"]')).toHaveText(['T', 'O', '报']);
    await expect(group.getByText('+1', { exact: true })).toBeVisible();
    await group.hover();
    const card = page.getByRole('dialog', { name: 'Connected to', exact: true });
    await expect(card.getByText('Connected to', { exact: true })).toBeVisible();
    for (const [name, type] of [
        ['Taxi data', 'PostgreSQL'],
        ['operations', 'SQLite'],
        ['报表', 'PostgreSQL'],
        ['Archive', 'SQLite'],
    ]) {
        const row = card.getByRole('listitem').filter({ hasText: name });
        await expect(row.getByRole('img', { name: type, exact: true })).toBeVisible();
        await expect(row.getByText(name, { exact: true })).toBeVisible();
    }
    await card.hover();
    await expect(card).toBeVisible();
    await pageHeader.getByRole('button', { name: 'Root directory' }).hover();
    await expect(page.getByRole('dialog')).toBeHidden();
    await pageHeader.getByRole('button', { name: 'Root directory' }).focus();
    await page.keyboard.press('Tab');
    await expect(group).toBeFocused();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(pageHeader).not.toContainText('Apache Ossie');
    await expect(page.getByRole('button', { name: 'New knowledge base', exact: true })).toBeVisible();
    await page.goto(new URL('?tab=definitions', page.url()).href);
    await expect(page.getByText('Apache Ossie 0.2.0.dev0 · rev 01234567', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Root directory', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'Directory', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New knowledge base', exact: true })).toBeVisible();
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
    await page.goto(new URL('?tab=definitions', page.url()).href);
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
    await page.goto(new URL('?tab=definitions', page.url()).href);
    await page.getByRole('button', { name: 'Show details for Trip Distance' }).click();

    const queryLink = page.getByRole('link', { name: query.title });
    await expect(queryLink).toHaveAttribute('href', /tab=queries&query=query-1/);
    const sourcesCard = page.getByRole('heading', { name: 'Linked Knowledge Sources', exact: true }).locator('xpath=ancestor::section[1]');
    await expect(sourcesCard.getByRole('link', { name: source.fileName, exact: true })).toBeVisible();
    await expect(sourcesCard.getByRole('checkbox')).toHaveCount(0);
    await expect(sourcesCard.getByText('Operations.md', { exact: true })).toHaveCount(0);
    await expect(sourcesCard.getByText('Provided', { exact: true })).toBeVisible();
    await expect(sourcesCard.getByRole('link', { name: `Open ${source.fileName}` })).toHaveAttribute('href', /tab=documents&file=source-1/);

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
        if (body.actionId === 'knowledge.queryEntries') return actionResponse(route, { entries: [query] });
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
    const tree = page.getByRole('navigation', { name: 'Directory' });
    const modelButton = tree.getByRole('button', { name: queryModel.name, exact: true });
    const queryFolder = tree.getByRole('button', { name: 'Verified Queries', exact: true });
    const currentRow = tree.locator('button[aria-current="page"]');
    await expect(currentRow).toHaveText(queryModel.name);
    await queryFolder.click();
    await expect(currentRow).toHaveText('Verified Queries');

    await expect(page.getByText('Updated by Avery Chen', { exact: false })).toBeVisible();
    await expect(page.getByText('workspace', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'What is the average trip distance?', exact: true }).click();

    await expect(currentRow).toHaveText(query.title);
    const transparent = 'rgba(0, 0, 0, 0)';
    await page.mouse.move(0, 0);
    await expect(modelButton.locator('..')).toHaveCSS('background-color', transparent);
    await expect(queryFolder.locator('..')).toHaveCSS('background-color', transparent);
    await expect(currentRow).not.toHaveCSS('background-color', transparent);
    await tree.getByRole('button', { name: 'Collapse Verified Queries' }).click();
    await expect(currentRow).toHaveCount(0);
    await tree.getByRole('button', { name: 'Expand Verified Queries' }).press('Enter');
    await expect(currentRow).toHaveText(query.title);
    await queryFolder.press('Enter');
    await expect(currentRow).toHaveText('Verified Queries');
    await tree.getByRole('button', { name: query.title, exact: true }).press('Enter');
    await expect(currentRow).toHaveText(query.title);
    await expect(page.getByRole('button', { name: 'Open in workspace' })).toBeDisabled();
    await expect(page.getByText('This data source is unavailable to your account.')).toBeVisible();
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
    await expect(page.getByRole('link', { name: `Open ${source.fileName}` })).toHaveAttribute('href', /tab=documents&file=source-1/);

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

test('knowledge sources show four connection types and open provider setup', async ({ page }) => {
    const actionIds: string[] = [];
    let authorized = false;
    let driveConnected = false;
    const drive = { id: 'drive-test', provider: 'drive', displayName: 'Operations', driveFolderId: 'ops', status: 'ready', lastSyncedAt: now };

    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input: Record<string, unknown> };
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
            await actionResponse(route, { canWrite: true, canManageLinear: true, connectors: driveConnected ? [drive] : [] });
            return;
        }
        if (body.actionId === 'knowledge.getGitHubConnectorSetup') {
            await actionResponse(route, { configured: false, manualOnly: false, installUrl: null });
            return;
        }
        if (body.actionId === 'knowledge.beginDriveAuthorization') return actionResponse(route, { id: 'drive-session', url: 'https://accounts.google.com/o/oauth2/v2/auth' });
        if (body.actionId === 'knowledge.driveAuthorizationStatus') return actionResponse(route, { status: authorized ? 'ready' : 'pending' });
        if (body.actionId === 'knowledge.listDriveFolders') return actionResponse(route, { folders: body.input.folderId === 'root' ? [{ id: 'ops', name: 'Operations' }] : [] });
        if (body.actionId === 'knowledge.connectDriveFolder') {
            expect(body.input).toMatchObject({ id: 'drive-session', folderId: 'ops', knowledgeModelId: modelId });
            driveConnected = true;
            return actionResponse(route, { id: drive.id });
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    await page.goto(new URL('?tab=sources', page.url()).href);

    const panel = page.locator('main').last();
    for (const name of ['Local folder', 'GitHub', 'Linear', 'Google Drive']) await expect(panel.getByRole('button', { name: name + ' 0 sources' })).toBeVisible();
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /Upload|Add source|Semantic model|Business rules/ })).toHaveCount(0);
    await panel.getByRole('button', { name: /GitHub/ }).click();
    await expect(page.getByRole('dialog', { name: 'Connect GitHub' })).toBeVisible();
    await expect(page.getByText('GitHub connections are not configured for this Dory deployment.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await panel.getByRole('button', { name: /Google Drive/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Connect Google account' }).click();
    await expect(dialog.getByRole('link', { name: 'Authorize with Google' })).toHaveAttribute('href', 'https://accounts.google.com/o/oauth2/v2/auth');
    authorized = true;
    await dialog.getByRole('button', { name: 'Operations' }).click();
    await dialog.getByRole('button', { name: 'Sync Operations' }).click();
    const driveRow = panel.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Operations' }) });
    await expect(driveRow).toBeVisible();
    await expect(driveRow.getByRole('link', { name: 'View in documents' })).toHaveAttribute('href', '?tab=documents&folder=drive-test');
    expect(actionIds).not.toContain('knowledge.createKnowledgeSource');
});

test('GitHub-managed knowledge sources are read-only and connectors can be synchronized', async ({ page }) => {
    const actionIds: string[] = [];
    let revision = 'abc';
    await page.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        actionIds.push(body.actionId);
        if (body.actionId === 'knowledge.listDirectory')
            return actionResponse(route, {
                canWrite: true,
                folders: [],
                connectors: [{ id: 'connector-1', provider: 'github', repositoryFullName: 'dorylab/docs', rootPath: 'docs', linearWorkspaceName: null }],
            });
        if (body.actionId === 'knowledge.get') return actionResponse(route, model);
        if (body.actionId === 'knowledge.listConnectors') {
            return actionResponse(route, {
                canWrite: true,
                canManageLinear: true,
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
                        fileName: 'dorylab/docs · docs › policies › orders › readme.md · nector-1',
                        format: 'markdown',
                        byteSize: 7,
                        createdBy: 'user-1',
                        createdAt: now,
                        updatedAt: now,
                        connectorId: 'connector-1',
                        connectorProvider: 'github',
                        remotePath: 'docs/policies/orders/readme.md',
                        sourceUrl: 'https://github.com/dorylab/docs/blob/main/docs/policies/orders/readme.md',
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
                fileName: 'dorylab/docs · docs › policies › orders › readme.md · nector-1',
                format: 'markdown',
                byteSize: 7,
                createdBy: 'user-1',
                createdAt: now,
                updatedAt: now,
                connectorId: 'connector-1',
                connectorProvider: 'github',
                remotePath: 'docs/policies/orders/readme.md',
                sourceUrl: 'https://github.com/dorylab/docs/blob/main/docs/policies/orders/readme.md',
                remoteRevision: revision,
                contentText: revision === 'abc' ? '# GitHub source snapshot' : '# Updated GitHub source snapshot',
            });
        }
        if (body.actionId === 'knowledge.syncConnector') {
            revision = 'def';
            return actionResponse(route, { queued: true });
        }
        await route.fallback();
    });

    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    const documentName = 'readme.md';
    await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'dorylab/docs / docs 1', exact: true }).click();
    for (const folder of ['policies', 'orders']) {
        await page.getByRole('button', { name: folder + ' 1 document', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'New knowledge base', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: documentName, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'GitHub source snapshot' })).toBeVisible();
    await expect(page.getByRole('region').getByText('Synced version · abc')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', /github.com\/dorylab/);
    await expect(page.getByRole('region').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.goto(new URL('?tab=sources', page.url()).href);
    await expect(page.getByText('dorylab/docs', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect.poll(() => actionIds).toContain('knowledge.syncConnector');
    await page.getByRole('listitem').filter({ hasText: 'dorylab/docs' }).getByRole('link', { name: 'View in documents' }).click();
    await expect(page).toHaveURL(/folder=connector-1/);
    await page.goto(new URL('?tab=sources&source=source-1', page.url()).href);
    await expect(page.getByRole('heading', { name: 'Updated GitHub source snapshot' })).toBeVisible();
    await expect(page).toHaveURL(/file=source-1/);
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
        projectId: 'p-1',
        projectName: 'Revenue',
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
        if (body.actionId === 'knowledge.listDirectory')
            return actionResponse(route, {
                canWrite: true,
                folders: [{ id: 'ordinary-folder', name: 'Archive', parentId: null }],
                connectors: [{ id: 'linear-connector', provider: 'linear', linearWorkspaceName: 'Analytics', repositoryFullName: null, rootPath: '' }],
            });
        if (body.actionId === 'knowledge.listKnowledgeSources')
            return actionResponse(route, {
                sources: [
                    linearSource,
                    { ...linearSource, id: 'history', fileName: 'Historical guide.md', projectId: null, projectName: null },
                    { ...localSource, id: 'overview', fileName: 'Overview.md', format: 'markdown' },
                    localSource,
                    yamlSource,
                    emptySource,
                ],
            });
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

    const tree = page.getByRole('navigation', { name: 'Directory' });
    const modelRow = tree.getByRole('button', { name: model.name, exact: true }).locator('xpath=ancestor::li[1]');
    const labels = modelRow.locator(':scope > ul > li > div > button:not([aria-label]) > span.truncate, :scope > ul > li > button > span.truncate');
    await expect(labels).toHaveText(['Verified Queries', 'Analytics', 'Archive', 'Overview.md']);
    const columns = await labels.evaluateAll(nodes =>
        nodes.map(node => ({
            icon: node.parentElement!.querySelector('svg')!.getBoundingClientRect().left,
            label: node.getBoundingClientRect().left,
        })),
    );
    expect(columns.every(({ icon, label }) => icon === columns[0]!.icon && label === columns[0]!.label)).toBe(true);
    const cards = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Folders', exact: true }) });
    await expect(cards.locator('button > span[title]')).toHaveText(['Verified Queries', 'Analytics', 'Archive']);
    await page.getByRole('button', { name: 'Analytics 2', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'Historical guide.md', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revenue 1 document', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'Linear guide.md', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions for Linear guide.md' })).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'Linear guide.md', exact: true }).click();
    const inline = page.getByRole('region', { name: 'Linear guide.md' });
    await expect(inline.getByText('Could not load the knowledge source.')).toBeVisible();
    await inline.getByRole('button', { name: 'Retry' }).click();
    await expect(inline.getByRole('cell', { name: 'GMV' })).toBeVisible();
    await expect(inline.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', linearSource.sourceUrl);
    await expect(inline.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.goto(new URL('?tab=sources&source=local-source', page.url()).href);
    const localViewer = page.getByRole('dialog', { name: 'Local notes.txt' });
    await expect(localViewer.locator('pre')).toHaveText('Line one\nLine two');
    await expect(localViewer.getByRole('link', { name: 'Open original' })).toHaveCount(0);
    await localViewer.getByRole('button', { name: 'Close', exact: true }).first().click();

    await page.goto(new URL('?tab=sources&source=yaml-source', page.url()).href);
    const yamlViewer = page.getByRole('dialog', { name: 'Schema.yaml' });
    await expect(yamlViewer.locator('pre')).toHaveText('version: 1\nname: Example');
    await yamlViewer.getByRole('button', { name: 'Close', exact: true }).first().click();

    const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(new URL('?tab=sources&source=empty-source', page.url()).href);
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

        await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}?tab=definitions`);
        await page.getByRole('button', { name: 'Add definition', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Generate definition suggestions' }).click();
        const dialog = page.getByRole('dialog', { name: 'Generate definition suggestions' });
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

test('database generation runs in background, survives navigation and refresh, retries unreadable tables and saves only after review', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const messageErrors: string[] = [];
    page.on('console', message => {
        if (message.type() === 'error' && message.text().includes('MISSING_MESSAGE')) messageErrors.push(message.text());
    });
    const source = {
        id: 'linear-file',
        fileName: 'Refund policy.md',
        format: 'markdown',
        connectorId: 'linear',
        connectorProvider: 'linear',
        remotePath: 'policy.md',
        contentText: 'Use the requested date.',
        updatedAt: now,
    };
    const directory = {
        canWrite: true,
        folders: [{ id: 'orders-folder', parentId: null, name: 'Orders' }],
        connectors: [{ id: 'linear', displayName: 'Linear', provider: 'linear', rootPath: '' }],
    };
    const draft = {
        fileName: 'Guide.md',
        contentText: '# Read orders\n\nStart with the orders table.',
        proof: 'test-proof',
        evidence: { database: 'shop', tables: [{ name: 'orders', digest: 'a'.repeat(64) }], references: [] },
    };
    type Task = import('../../packages/shared/src/types/knowledge-document-draft').DocumentGenerationTaskDetail;
    const tasks = new Map<string, Task>();
    let writes = 0;
    let empty = true;
    let rejectSubmission = true;
    let rejectSave = true;
    const savedBatchIds: string[] = [];
    const draftInputs: Record<string, unknown>[] = [];
    const submittedIds: string[] = [];
    function finish(id: string) {
        const task = tasks.get(id)!;
        const failed = task.input.tables.includes('restricted');
        task.status = failed ? 'failed' : 'ready';
        task.phase = task.status;
        task.completedTables = task.totalTables;
        task.error = failed ? 'TABLES_UNAVAILABLE' : null;
        task.draft = failed ? { failedTables: ['restricted'], topics: [] } : { topics: [{ name: 'Orders', documents: [draft] }], failedTables: [] };
    }
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        switch (actionId) {
            case 'knowledge.get':
                return actionResponse(route, model);
            case 'knowledge.listDirectory':
                return actionResponse(route, empty ? { canWrite: true, folders: [], connectors: [] } : directory);
            case 'knowledge.listKnowledgeSources':
                return actionResponse(route, {
                    sources: empty
                        ? []
                        : [
                              source,
                              { id: 'existing', fileName: 'Guide.md', folderId: 'orders-folder', format: 'markdown' },
                              ...(writes ? [{ ...draft, id: 'saved', fileName: 'New guide.md', folderId: 'orders-folder', format: 'markdown', updatedAt: now }] : []),
                          ],
                });
            case 'knowledge.getKnowledgeSource':
                return actionResponse(route, input.id === 'saved' ? { ...draft, id: 'saved', fileName: 'New guide.md', format: 'markdown', updatedAt: now } : source);
            case 'knowledge.queryEntries':
                return actionResponse(route, { entries: [] });
            case 'schema.listDatabases':
                return actionResponse(route, { databases: [{ value: 'shop', label: 'shop' }] });
            case 'schema.listTables':
                return actionResponse(route, { tables: [{ name: 'orders' }, { name: 'restricted' }] });
            case 'knowledge.listDocumentGenerationTasks':
                return actionResponse(route, { tasks: [...tasks.values()].reverse().map(({ input: _input, draft: _draft, ...task }) => task) });
            case 'knowledge.getDocumentGenerationTask':
                return actionResponse(route, tasks.get(input.id));
            case 'knowledge.createDocumentGenerationTask':
            case 'knowledge.retryDocumentGenerationTask': {
                submittedIds.push(input.id);
                if (rejectSubmission) {
                    rejectSubmission = false;
                    return route.fulfill({ status: 503, json: { ok: false, message: 'Temporary submission failure' } });
                }
                const { id, submissionId: _submissionId, folderId, ...generationInput } = input;
                draftInputs.push(generationInput);
                const task: Task = {
                    id,
                    input: generationInput,
                    knowledgeModelId: modelId,
                    modelName: model.name,
                    database: input.database,
                    folderId,
                    folderName: folderId ? 'Orders' : null,
                    status: 'queued',
                    phase: 'queued',
                    completedTables: 0,
                    totalTables: input.tables.length,
                    error: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    documents: [],
                    draft: null,
                };
                tasks.set(id, task);
                return actionResponse(route, task);
            }
            case 'knowledge.createDocumentBatch': {
                expect(input.folderId).toBeNull();
                expect(input.topics[0].documents[0].fileName).toBe('New guide.md');
                expect(input.batchId).toBe(input.taskId);
                savedBatchIds.push(input.batchId);
                if (rejectSave) {
                    rejectSave = false;
                    return route.fulfill({ status: 503, json: { ok: false, message: 'Temporary save failure' } });
                }
                writes++;
                const task = tasks.get(input.taskId)!;
                task.status = 'saved';
                task.phase = 'saved';
                task.documents = [{ id: 'saved', folderId: 'orders-folder' }];
                return actionResponse(route, { documents: task.documents });
            }
            default:
                return route.fallback();
        }
    });
    const organization = await currentOrganization(page);
    const base = `/${organization}/knowledge/${modelId}`;
    const dialog = page.getByRole('dialog', { name: 'Generate from database' });
    const list = page.getByRole('dialog', { name: 'Background tasks' });
    async function openTask(id: string, checkCompletion = false) {
        if (checkCompletion) await expect(page.getByText('Draft generated, ready to review', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Background tasks', exact: true }).click();
        const link = list.locator(`a[href*="generationTask=${id}"]`);
        await expect(link).toBeVisible();
        await link.click();
        await expect(dialog).toBeVisible();
    }
    await page.goto(base);
    const emptyEntry = page.locator('section').getByRole('button', { name: 'Generate from database', exact: true });
    await emptyEntry.click();
    await expect(dialog.getByLabel('Destination folder')).toHaveText(model.name);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    empty = false;
    await page.goto(base + '?folder=orders-folder');
    await page.getByRole('button', { name: 'Generate from database', exact: true }).first().click();
    await expect(dialog.getByLabel('Destination folder')).toHaveText('Orders');
    await dialog.getByRole('checkbox', { name: 'orders', exact: true }).check();
    await dialog.getByRole('button', { name: 'Generate draft' }).click();
    await expect(dialog.getByText('Temporary submission failure')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'orders', exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: 'Generate draft' }).click();
    await expect(dialog).toBeHidden();
    expect(submittedIds[0]).toBe(submittedIds[1]);
    const first = [...tasks.keys()][0];
    expect(writes).toBe(0);
    // The task remains accessible from another product page and after a full reload.
    await page.goto(`/${organization}/work`);
    await page.getByRole('button', { name: 'Background tasks', exact: true }).click();
    await expect(list.getByRole('status')).toHaveText('Queued');
    await page.keyboard.press('Escape');
    tasks.get(first)!.status = 'running';
    tasks.get(first)!.phase = 'reading';
    await page.reload();
    await page.getByRole('button', { name: 'Background tasks', exact: true }).click();
    await expect(list.getByText('Reading schema · 0/1 tables')).toBeVisible();
    await page.keyboard.press('Escape');
    finish(first);
    tasks.get(first)!.folderId = 'removed-folder';
    tasks.get(first)!.folderName = null;
    await openTask(first, true);
    await expect(dialog.getByText('Start with the orders table.')).toBeVisible();
    await expect(dialog.getByText('The destination folder was removed. Choose another folder.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Create .* document/ })).toBeDisabled();
    await dialog.getByLabel('Destination folder').click();
    await page.getByRole('option', { name: model.name, exact: true }).click();
    await expect(dialog.getByText('The destination folder was removed. Choose another folder.')).toBeHidden();
    await page.reload();
    await expect(dialog.getByText('Start with the orders table.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toBe(0);

    await page.goto(base + '?tab=documents&file=linear-file');
    await page.getByRole('button', { name: 'Generate from database', exact: true }).first().click();
    await expect(dialog.getByLabel('Destination folder')).toHaveText(model.name);
    await dialog.getByLabel('orders', { exact: true }).check();
    await dialog.getByLabel('restricted', { exact: true }).check();
    await dialog.getByText('Additional context (optional)').click();
    const ref = dialog.getByRole('checkbox', { name: /Current document/ });
    await expect(ref).not.toBeChecked();
    await ref.check();
    await dialog.getByRole('button', { name: 'Generate draft' }).click();
    await expect(dialog).toBeHidden();
    const second = [...tasks.keys()].at(-1)!;
    finish(second);
    await openTask(second);
    await dialog.getByRole('button', { name: 'Exclude failed tables' }).click();
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(dialog).toBeHidden();
    finish(second);
    await openTask(second);
    await expect(dialog.getByText('Start with the orders table.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create 0 folders and 1 document' })).toBeDisabled();
    await dialog.getByLabel('Document name').fill('New guide.md');
    expect(writes).toBe(0);
    expect(draftInputs.at(-1)).toMatchObject({ tables: ['orders'], documentIds: ['linear-file'], queryIds: [] });
    await dialog.getByRole('button', { name: 'Create 0 folders and 1 document' }).click();
    await expect(dialog.getByText('Temporary save failure')).toBeVisible();
    await expect(dialog.getByLabel('Document name')).toHaveValue('New guide.md');
    await dialog.getByRole('button', { name: 'Create 0 folders and 1 document' }).click();
    expect(savedBatchIds).toHaveLength(2);
    expect(savedBatchIds[0]).toBe(savedBatchIds[1]);
    await expect(page).toHaveURL(/file=saved/);
    await expect(page).not.toHaveURL(/generationTask=/);
    expect(writes).toBe(1);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'Background tasks', exact: true }).click();
    await expect(list.getByText('Saved', { exact: true })).toBeVisible();
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('background-tasks-dark-mobile.png') });
    expect(messageErrors).toEqual([]);
});

test('database generation selects filtered tables in bulk, preserves hidden selections and respects the 20 table limit', async ({ page }) => {
    test.setTimeout(120_000);
    let releaseTables!: () => void;
    let releaseSubmission!: () => void;
    let submitted: Record<string, unknown> | undefined;
    const tableGate = new Promise<void>(resolve => {
        releaseTables = resolve;
    });
    const submissionGate = new Promise<void>(resolve => {
        releaseSubmission = resolve;
    });
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        switch (actionId) {
            case 'knowledge.get':
                return actionResponse(route, model);
            case 'knowledge.listDirectory':
                return actionResponse(route, { canWrite: true, folders: [], connectors: [] });
            case 'knowledge.listKnowledgeSources':
                return actionResponse(route, { sources: [] });
            case 'knowledge.queryEntries':
                return actionResponse(route, { entries: [] });
            case 'knowledge.listDocumentGenerationTasks':
                return actionResponse(route, { tasks: [] });
            case 'schema.listDatabases':
                return actionResponse(route, {
                    databases: [
                        { value: 'shop', label: 'shop' },
                        { value: 'large', label: 'large' },
                    ],
                });
            case 'schema.listTables':
                if (input.database === 'shop') {
                    await tableGate;
                    return actionResponse(route, { tables: ['outside', 'orders', 'order_items'].map(name => ({ name })) });
                }
                return actionResponse(route, { tables: [...Array.from({ length: 21 }, (_, i) => ({ name: 'order_' + String(i + 1).padStart(2, '0') })), { name: 'outside' }] });
            case 'knowledge.createDocumentGenerationTask':
                submitted = input;
                await submissionGate;
                return route.fulfill({ status: 503, json: { ok: false, message: 'Submission failed for test' } });
            default:
                return route.fallback();
        }
    });
    try {
        await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
        await page.getByRole('button', { name: 'Generate from database', exact: true }).first().click();
        const dialog = page.getByRole('dialog', { name: 'Generate from database' });
        const selectAll = dialog.getByRole('button', { name: 'Select all', exact: true });
        const deselectAll = dialog.getByRole('button', { name: 'Deselect all', exact: true });
        const search = dialog.getByLabel('Search tables');
        const table = (name: string) => dialog.getByRole('checkbox', { name, exact: true });
        const count = (selected: number) => dialog.getByRole('heading', { name: `Tables (${selected}/20)`, exact: true });
        await expect(selectAll).toBeDisabled();
        await expect(deselectAll).toBeDisabled();
        releaseTables();
        await expect(selectAll).toBeEnabled();
        await selectAll.click();
        await expect(count(3)).toBeVisible();
        await expect(table('outside')).toBeChecked();
        await expect(table('orders')).toBeChecked();
        await expect(table('order_items')).toBeChecked();
        await expect(selectAll).toBeDisabled();
        await deselectAll.click();
        await expect(count(0)).toBeVisible();
        await table('outside').check();
        await table('orders').check();
        await search.fill('ORDER');
        await selectAll.click();
        await expect(count(3)).toBeVisible();
        await deselectAll.click();
        await expect(count(1)).toBeVisible();
        await search.fill('');
        await expect(table('outside')).toBeChecked();
        await expect(table('orders')).not.toBeChecked();
        await search.fill('missing');
        await expect(selectAll).toBeDisabled();
        await expect(deselectAll).toBeDisabled();
        await expect(dialog.getByText('No matching tables', { exact: true })).toBeVisible();
        await dialog.getByLabel('Database', { exact: true }).click();
        await page.getByRole('option', { name: 'large', exact: true }).click();
        await expect(count(0)).toBeVisible();
        await expect(table('outside')).toBeVisible();
        await table('outside').check();
        await selectAll.click();
        await expect(count(20)).toBeVisible();
        await expect(table('outside')).toBeChecked();
        await expect(table('order_19')).toBeChecked();
        await expect(table('order_20')).not.toBeChecked();
        await expect(table('order_21')).not.toBeChecked();
        await expect(table('order_20')).toBeDisabled();
        await expect(dialog.getByText('Up to 20 tables can be selected. Your existing choices were kept and the selection was filled to the limit.')).toBeVisible();
        await search.fill('order_0');
        await deselectAll.click();
        await expect(count(11)).toBeVisible();
        await selectAll.click();
        await expect(count(20)).toBeVisible();
        await search.fill('outside');
        await table('outside').uncheck();
        await expect(count(19)).toBeVisible();
        await search.fill('order_2');
        await selectAll.click();
        await expect(count(20)).toBeVisible();
        await expect(table('order_20')).toBeChecked();
        await expect(table('order_21')).not.toBeChecked();
        await search.fill('');
        await expect(table('outside')).not.toBeChecked();
        await expect(table('order_01')).toBeChecked();
        await deselectAll.click();
        await expect(count(0)).toBeVisible();
        await search.fill('order_21');
        await selectAll.click();
        await search.fill('order_2');
        await expect(selectAll).toBeEnabled();
        await expect(deselectAll).toBeEnabled();
        await dialog.getByRole('button', { name: 'Generate draft', exact: true }).click();
        await expect.poll(() => submitted).toMatchObject({ tables: ['order_21'] });
        await expect(selectAll).toBeDisabled();
        await expect(deselectAll).toBeDisabled();
        releaseSubmission();
        await expect(dialog.getByText('Submission failed for test')).toBeVisible();
        await expect(table('order_21')).toBeChecked();
        await expect(count(1)).toBeVisible();
        await page.setViewportSize({ width: 375, height: 812 });
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    } finally {
        releaseTables();
        releaseSubmission();
    }
});

test('knowledge folder names toggle expansion and clickable controls use pointer cursors', async ({ page }) => {
    test.setTimeout(120_000);
    const source = { id: 'detail-doc', fileName: 'Details.md', folderId: 'details', format: 'markdown', updatedAt: now };
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        switch (actionId) {
            case 'knowledge.get':
                return actionResponse(route, model);
            case 'knowledge.listDirectory':
                return actionResponse(route, {
                    canWrite: true,
                    folders: [
                        { id: 'parent', name: 'Parent', parentId: null },
                        { id: 'details', name: 'Operating details', parentId: 'parent' },
                    ],
                    connectors: [],
                });
            case 'knowledge.listKnowledgeSources':
                return actionResponse(route, { sources: [source] });
            case 'knowledge.getKnowledgeSource':
                return actionResponse(route, { ...source, contentText: '# Detail guide' });
            case 'knowledge.queryEntries':
                return actionResponse(route, { entries: [{ id: 'example-query', title: 'Example query', question: 'Example question' }] });
            case 'knowledge.listDocumentGenerationTasks':
                return actionResponse(route, { tasks: [] });
            default:
                return route.fallback();
        }
    });
    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}?file=${source.id}`);
    const tree = page.getByRole('navigation', { name: 'Directory', exact: true });
    const folder = tree.getByRole('button', { name: 'Operating details 1', exact: true });
    const leaf = tree.getByRole('button', { name: 'Details.md', exact: true });
    await expect(leaf).toBeVisible();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(folder).toHaveCSS('cursor', 'pointer');
    await expect(leaf).toHaveCSS('cursor', 'pointer');
    await folder.click();
    await expect(page).toHaveURL(/folder=details/);
    await expect(page).not.toHaveURL(/file=detail-doc/);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(leaf).toBeHidden();
    await folder.click();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(leaf).toBeVisible();
    await folder.press('Enter');
    await expect(leaf).toBeHidden();
    const expand = tree.getByRole('button', { name: 'Expand Operating details', exact: true });
    await expect(expand).toHaveCSS('cursor', 'pointer');
    await expand.click();
    await expect(leaf).toBeVisible();
    await folder.press('Space');
    await expect(leaf).toBeHidden();
    await tree.getByRole('button', { name: 'Actions for Operating details', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'New folder', exact: true })).toHaveCSS('cursor', 'pointer');
    await page.keyboard.press('Escape');
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await tree.getByRole('button', { name: 'Parent 1', exact: true }).click();
    await expect(folder).toBeHidden();
    await tree.getByRole('button', { name: 'Parent 1', exact: true }).click();
    await expect(folder).toBeVisible();
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await folder.click();
    await leaf.click();
    await expect(page.getByRole('heading', { name: 'Detail guide', exact: true })).toBeVisible();
    const queries = tree.getByRole('button', { name: 'Verified Queries', exact: true });
    await queries.click();
    await expect(queries).toHaveAttribute('aria-expanded', 'true');
    await expect(tree.getByRole('button', { name: 'Example query', exact: true })).toBeVisible();
    await queries.click();
    await expect(queries).toHaveAttribute('aria-expanded', 'false');
    await expect(tree.getByRole('button', { name: 'Example query', exact: true })).toBeHidden();
    const root = tree.getByRole('button', { name: model.name, exact: true });
    await root.click();
    await expect(root).toHaveAttribute('aria-expanded', 'false');
    await expect(folder).toBeHidden();
    await root.click();
    await expect(root).toHaveAttribute('aria-expanded', 'true');
    await expect(folder).toBeVisible();
});

test('background task entry is visible only for queued, running or reviewable tasks', async ({ page }) => {
    test.setTimeout(120_000);
    type Task = import('../../packages/shared/src/types/knowledge-document-draft').DocumentGenerationTask;
    const task: Task = {
        id: 'bf38ce89-61e7-49d4-a5b9-df2ef79fc80a',
        knowledgeModelId: modelId,
        modelName: model.name,
        database: 'shop',
        folderId: null,
        folderName: null,
        status: 'queued',
        phase: 'queued',
        completedTables: 0,
        totalTables: 1,
        error: null,
        createdAt: now,
        updatedAt: now,
        documents: [],
    };
    let tasks: Task[] = [];
    let listRequests = 0;
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        switch (actionId) {
            case 'knowledge.get':
                return actionResponse(route, model);
            case 'knowledge.listDirectory':
                return actionResponse(route, { canWrite: true, folders: [], connectors: [] });
            case 'knowledge.listKnowledgeSources':
                return actionResponse(route, { sources: [] });
            case 'knowledge.listDocumentGenerationTasks':
                listRequests++;
                return actionResponse(route, { tasks });
            default:
                return route.fallback();
        }
    });
    await page.goto(`/${await currentOrganization(page)}/knowledge/${modelId}`);
    const entry = page.getByRole('button', { name: 'Background tasks', exact: true });
    const list = page.getByRole('dialog', { name: 'Background tasks', exact: true });
    await expect.poll(() => listRequests).toBeGreaterThan(0);
    await expect(entry).toBeHidden();
    tasks = [task];
    await page.reload();
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(list.getByText('Queued', { exact: true })).toBeVisible();
    await entry.click();
    await expect(list).toBeHidden();
    task.status = 'ready';
    task.phase = 'ready';
    await expect(entry).toContainText('Tasks · 1 to review');
    task.status = 'saved';
    task.phase = 'saved';
    task.documents = [{ id: 'saved-doc', folderId: 'saved-folder' }];
    await entry.click();
    await expect(entry).toBeHidden();
    await expect(list).toBeHidden();
    tasks = [{ ...task, id: '24e8c7d8-4b3e-4d67-bbf9-88dcf22cfbe6', status: 'failed', phase: 'failed', error: 'GENERATION_FAILED' }, task];
    await page.reload();
    await expect(entry).toBeHidden();
    tasks = [{ ...task, status: 'running', phase: 'reading', documents: [] }];
    await page.reload();
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(list.getByText('Reading schema · 0/1 tables', { exact: true })).toBeVisible();
    tasks = [{ ...task, status: 'failed', phase: 'failed', error: 'GENERATION_FAILED' }];
    await expect(entry).toBeHidden();
    await expect(list).toBeHidden();
    await expect(page.getByText('Document generation failed', { exact: true })).toBeVisible();
});
