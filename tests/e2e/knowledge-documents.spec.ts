import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import { openDataSources } from './helpers/navigation';

test('authors Markdown, edits the guide in place and opens verified SQL in a fresh workspace tab', async ({ page, request }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(20_000);
    await page.goto('/');
    await openDataSources(page);
    const organization = new URL(page.url()).pathname.split('/')[1];
    async function action<T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, actionId + ' ' + body.message).toBe(true);
        return body.data;
    }
    const { connections } = await action<{ connections: { connection: { id: string }; identities: { enabled?: boolean }[] }[] }>('connection.list', {});
    const connectionId = connections.find(item => item.identities.some(identity => identity.enabled !== false))!.connection.id;
    const id = randomUUID();
    const { id: knowledgeModelId, organizationId } = await action<{ id: string; organizationId: string }>('knowledge.create', {
        name: 'Docs ' + id,
        connectionIds: [connectionId],
    });
    const scope = { knowledgeModelId };
    const tabsCreated: string[] = [];
    const sql = 'SELECT 17 AS knowledge_document_test /* ' + id + ' */';
    let savedQueryId: string | undefined;
    const title = 'Trusted SQL ' + id;
    const question = 'How many records?';
    const detailUrl = '/' + organization + '/knowledge/' + knowledgeModelId;

    const access = Promise.withResolvers<void>();
    await page.route('**/api/actions/execute', async route => {
        if (route.request().postDataJSON()?.actionId === 'ai.savedQueryMetadata')
            return route.fulfill({ json: { ok: true, data: { description: 'Test query', useWhen: 'Verify saved query navigation' } } });
        if (route.request().postDataJSON()?.actionId === 'knowledge.listDirectory') await access.promise;
        await route.fallback();
    });
    try {
        await action('knowledge.update', { ...scope, aiContext: { instructions: '# Original guide', synonyms: ['orders'], examples: ['Count orders'] } });
        await action('knowledge.createVerifiedQuery', { ...scope, sourceConnectionId: connectionId, title, question, sql, sourceType: 'workspace' });
        const existing = await action<{ tabId: string }>('tab.create', { connectionId, content: 'SELECT 42', tabName: 'Existing ' + id });
        tabsCreated.push(existing.tabId);
        await page.goto(detailUrl + '?tab=overview');
        await expect(page.getByRole('navigation', { name: 'Directory' })).toBeVisible();
        await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'User guide' }).click();
        const dialog = page.getByRole('dialog');
        const guide = page.getByRole('region', { name: 'User guide' });
        await expect(guide.getByRole('heading', { name: 'Original guide' })).toBeVisible();
        access.resolve();
        await guide.getByRole('button', { name: 'Edit', exact: true }).click();
        await guide.getByLabel('Markdown content').fill('# Updated guide');
        await guide.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(guide.getByRole('heading', { name: 'Updated guide' })).toBeVisible();
        expect((await action<{ ossieDocument: { ai_context: unknown } }>('knowledge.get', scope)).ossieDocument.ai_context).toMatchObject({
            instructions: '# Updated guide',
            synonyms: ['orders'],
            examples: ['Count orders'],
        });

        await page.getByRole('button', { name: 'Knowledge base actions for Docs ' + id, exact: true }).click();
        await page.getByRole('menuitem', { name: 'New document' }).click();
        await dialog.getByLabel('Document title').fill('Reporting rules');
        await dialog.getByLabel('Markdown content').fill('# Reporting timezone');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toBeHidden();
        await page.getByRole('button', { name: 'Edit Reporting rules.md' }).click();
        const preview = page.getByRole('region', { name: 'Reporting rules.md' });
        await preview.getByLabel('Markdown content').fill('# Use UTC');
        await preview.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(preview.getByRole('heading', { name: 'Use UTC' })).toBeVisible();
        await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'Verified Queries', exact: true }).click();
        const filter = page.getByRole('searchbox', { name: 'Search by question or title' });
        await filter.fill('missing');
        await expect(page.getByText('No matching queries.')).toBeVisible();
        await filter.fill(title);
        await page.getByRole('button', { name: question, exact: true }).click();
        await expect(page.locator('pre').getByText(sql)).toBeVisible();
        const created = page.waitForResponse(response => response.url().endsWith('/api/actions/execute') && response.request().postDataJSON()?.actionId === 'tab.create');
        const executions: string[] = [];
        page.on('request', req => {
            if (
                req.method() === 'POST' &&
                (req.url().endsWith('/api/sql-console/query/stream') || (req.url().endsWith('/api/actions/execute') && req.postDataJSON()?.actionId === 'query.execute'))
            )
                executions.push(req.url());
        });
        await page.getByRole('button', { name: 'Open in workspace' }).click();
        const createdTab = await created;
        tabsCreated.push((await createdTab.json()).data.tabId);
        expect(createdTab.request().postDataJSON().organizationId).toBe(organizationId);
        await expect(page).toHaveURL(new RegExp(connectionId + '/sql-console'), { timeout: 90_000 });
        await expect(page.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true', { timeout: 60000 });
        const tabs = await action<Array<{ tabId: string; content: string }>>('tab.list', { connectionId });
        expect(tabs.find(tab => tab.tabId === tabsCreated[1])?.content).toBe(sql);
        expect(tabs.find(tab => tab.tabId === existing.tabId)?.content).toBe('SELECT 42');
        await expect(page.getByTestId('run-query')).toBeEnabled();
        expect(executions).toEqual([]);
        const execution = page.waitForResponse(response => response.url().endsWith('/api/sql-console/query/stream'));
        await page.getByTestId('run-query').click();
        const result = await execution;
        expect(result.request().postDataJSON().input).toMatchObject({ connectionId, tabId: tabsCreated[1], sql });
        await expect(page.getByRole('gridcell', { name: 'knowledge_document_test' })).toBeVisible();
        await expect(page.getByRole('row', { name: '17', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Save Query', exact: true }).click();
        const saveDialog = page.getByRole('dialog', { name: 'Save Query' });
        const savedTitle = 'Saved from workspace ' + id;
        await saveDialog.getByPlaceholder('Leave blank to name automatically').fill(savedTitle);
        await expect(saveDialog.getByRole('combobox')).toHaveCount(2);
        await saveDialog.getByRole('combobox').nth(1).click();
        await page.getByRole('option', { name: 'Docs ' + id, exact: true }).click();
        const savedResponse = page.waitForResponse(
            response => response.url().endsWith('/api/actions/execute') && response.request().postDataJSON()?.actionId === 'savedQuery.create',
        );
        await saveDialog.getByRole('button', { name: 'Save', exact: true }).click();
        savedQueryId = (await (await savedResponse).json()).data.id;
        await expect(saveDialog).toBeHidden();
        await page.goto(detailUrl + '?tab=queries');
        await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: savedTitle, exact: true }).click();
        await expect(page.locator('pre')).toHaveText(sql);
    } finally {
        access.resolve();
        if (savedQueryId) await action('savedQuery.delete', { connectionId, id: savedQueryId });
        for (const tabId of tabsCreated) await action('tab.delete', { connectionId, tabId });
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});

test('shared rules and optional document templates', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    async function action(actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    }
    const { connections } = await action('connection.list', {});
    const model = await action('knowledge.create', { name: 'Rules ' + randomUUID(), connectionIds: [connections[0].connection.id] });
    const scope = { knowledgeModelId: model.id };
    const url = '/' + org + '/knowledge/' + model.id;
    try {
        await page.goto(url);
        await page.getByRole('button', { name: 'Actions for RULES.md' }).click();
        await expect(page.getByRole('menuitem')).toHaveText(['Edit']);
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const editor = page.getByRole('region', { name: 'RULES.md' });
        await expect(editor.getByText('Applies to the entire knowledge base')).toBeVisible();
        await expect(editor.getByRole('combobox')).toHaveCount(0);
        await expect(editor.getByLabel('Markdown content')).toHaveValue(/已验证查询/);
        await page.goto(url);
        const search = page.getByRole('searchbox', { name: 'Search knowledge bases, files or queries' });
        for (const term of ['rules.md', 'Analysis rules']) {
            await search.fill(term);
            await expect(
                page
                    .getByRole('navigation', { name: 'Directory' })
                    .getByRole('button', { name: /RULES\.md/ })
                    .first(),
            ).toBeVisible();
        }
        await search.fill('');
        const create = async () => {
            await page.getByRole('button', { name: 'Knowledge base actions for ' + model.name, exact: true }).click();
            await page.getByRole('menuitem', { name: 'New document' }).click();
        };
        await create();
        const dialog = page.getByRole('dialog', { name: 'New document' });
        const template = dialog.getByRole('combobox', { name: 'Template' });
        const select = async (name: string) => {
            await template.click();
            await page.getByRole('option', { name, exact: true }).click();
        };
        await expect(template).toHaveText('Blank document');
        await select('Metric notes');
        await expect(dialog.getByLabel('Markdown content')).toHaveValue(/Calculation/);
        await dialog.getByLabel('Document title').fill('My draft');
        await select('Business glossary');
        const replace = page.getByRole('alertdialog');
        await replace.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog.getByLabel('Document title')).toHaveValue('My draft');
        await select('Business glossary');
        await replace.getByRole('button', { name: 'Replace', exact: true }).click();
        await expect(dialog.getByLabel('Markdown content')).toHaveValue(/Aliases/);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        expect((await action('knowledge.listKnowledgeSources', scope)).sources).toHaveLength(1);
        await create();
        await select('Knowledge base overview');
        await dialog.getByLabel('Document title').fill('RULES.md');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText(/already exists in this folder/)).toBeVisible();
        await expect(dialog.getByLabel('Markdown content')).toHaveValue(/Data sources/);
        await dialog.getByLabel('Document title').fill('README.md');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeHidden();
        const sources = (await action('knowledge.listKnowledgeSources', scope)).sources;
        expect(sources).toHaveLength(2);
        expect(sources).toContainEqual(expect.objectContaining({ fileName: 'README.md', folderId: null, systemRole: null }));
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});

test('switches knowledge bases, protects edits and resolves global search results by path', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const action = async (actionId: string, input: Record<string, unknown>, confirmationToken?: string) => {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    };
    const { connections } = await action('connection.list', {});
    const connection = connections[0].connection.id;
    const term = 'navigation-' + randomUUID();
    const models: { id: string; name: string }[] = [];
    try {
        for (const suffix of ['A', 'B']) {
            const model = await action('knowledge.create', { name: term + suffix, connectionIds: [connection] });
            models.push(model);
            await action('knowledge.createKnowledgeSource', { knowledgeModelId: model.id, fileName: term + '.md', contentText: '# ' + model.name });
        }
        const [a, b] = models;
        const query = await action('knowledge.createVerifiedQuery', {
            knowledgeModelId: b!.id,
            sourceConnectionId: connection,
            title: term + ' query',
            question: 'Which orders?',
            sql: 'SELECT 1',
            sourceType: 'workspace',
        });
        await page.goto('/' + org + '/knowledge/' + a!.id);
        const tree = page.getByRole('navigation', { name: 'Directory' });
        await page.getByRole('button', { name: 'New knowledge base', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'New knowledge base' })).toBeVisible();
        await page.keyboard.press('Escape');
        await tree.getByRole('button', { name: 'Expand ' + b!.name, exact: true }).click();
        const otherModel = tree.getByRole('button', { name: b!.name, exact: true }).locator('xpath=ancestor::li[1]');
        await expect(otherModel.getByRole('button', { name: 'RULES.md', exact: true })).toBeVisible();
        const entries = otherModel.locator(':scope > ul > li');
        await expect(entries.first()).toContainText('Verified Queries');
        await expect(page).toHaveURL(new RegExp(a!.id));
        await tree.getByRole('button', { name: 'Collapse ' + b!.name, exact: true }).click();
        await page.getByRole('button', { name: 'Actions for RULES.md' }).click();
        await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Markdown content').fill('unsaved');
        await tree.getByRole('button', { name: b!.name, exact: true }).click();
        await page.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page.getByLabel('Markdown content')).toHaveValue('unsaved');
        await tree.getByRole('button', { name: 'Knowledge base actions for ' + b!.name }).click();
        await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'Discard changes' }).click();
        await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue(b!.name);
        await page.keyboard.press('Escape');
        await expect(page).toHaveURL(new RegExp(b!.id));
        await page.goto('/' + org + '/knowledge');
        await expect(page).toHaveURL(new RegExp(b!.id));
        const search = page.getByRole('searchbox', { name: 'Search knowledge bases, files or queries' });
        await search.fill(term + '.md');
        const files = tree.getByRole('button').filter({ hasText: term + '.md' });
        await expect(files).toHaveCount(2);
        await files.filter({ hasText: a!.name }).click();
        await expect(page.getByRole('heading', { name: a!.name, exact: true })).toBeVisible();
        await search.fill(term + ' query');
        await tree.getByRole('button').filter({ hasText: b!.name }).click();
        await expect(page).toHaveURL(new RegExp('query=' + query.id));
        await expect(page.locator('pre')).toHaveText('SELECT 1');
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Which orders?' })).toBeVisible();
        const firstPage = await action('knowledge.searchDirectory', { query: term, limit: 1 });
        const secondPage = await action('knowledge.searchDirectory', { query: term, limit: 1, offset: 1 });
        expect(firstPage.total).toBe(5);
        expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
    } finally {
        for (const model of models) await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});

test('creates the first knowledge base from an empty directory', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const name = 'First knowledge base ' + randomUUID();
    let createdId: string | undefined;
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        if (actionId !== 'knowledge.navigation' && actionId !== 'knowledge.create') return route.fallback();
        const response = await route.fetch();
        const body = await response.json();
        if (actionId === 'knowledge.create') createdId = body.data?.id;
        else body.data.models = body.data.models.filter((model: { id: string }) => model.id === createdId);
        await route.fulfill({ response, json: body });
    });
    try {
        await page.goto('/' + organization + '/knowledge');
        await expect(page.getByText('Create your first knowledge base')).toBeVisible();
        await page.getByRole('button', { name: 'New knowledge base' }).click();
        const form = page.getByRole('dialog', { name: 'New knowledge base' });
        await form.getByPlaceholder('Commerce').fill(name);
        await form.getByRole('checkbox').first().check();
        await form.getByRole('button', { name: 'Create knowledge base' }).click();
        const tree = page.getByRole('navigation', { name: 'Directory' });
        await expect(tree.getByRole('button', { name, exact: true })).toBeVisible();
        await expect(tree.getByRole('button', { name: 'RULES.md', exact: true })).toBeVisible();
        await tree.getByRole('button', { name: 'Verified Queries', exact: true }).click();
        await expect(page.getByText('Verify and save a query from the SQL workspace to see it here.')).toBeVisible();
    } finally {
        if (createdId)
            await request.post('/api/actions/execute', { data: { actionId: 'knowledge.delete', input: { knowledgeModelId: createdId }, confirmationToken: 'knowledge.delete' } });
    }
});
