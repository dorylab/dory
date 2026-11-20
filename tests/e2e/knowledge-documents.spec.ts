import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import { openDataSources } from './helpers/navigation';

test('authors Markdown, edits the guide in place and opens verified SQL in a fresh workspace tab', async ({ page, request }) => {
    test.setTimeout(180_000);
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
    const sql = 'SELECT 17 AS knowledge_document_test';
    const title = 'Trusted SQL ' + id;
    const question = 'How many records?';
    const detailUrl = '/' + organization + '/knowledge/' + knowledgeModelId;

    const access = Promise.withResolvers<void>();
    await page.route('**/api/actions/execute', async route => {
        if (route.request().postDataJSON()?.actionId === 'knowledge.listDirectory') await access.promise;
        await route.fallback();
    });
    try {
        await action('knowledge.update', { ...scope, aiContext: { instructions: '# Original guide', synonyms: ['orders'], examples: ['Count orders'] } });
        await action('knowledge.createVerifiedQuery', { ...scope, sourceConnectionId: connectionId, title, question, sql, sourceType: 'workspace' });
        const existing = await action<{ tabId: string }>('tab.create', { connectionId, content: 'SELECT 42', tabName: 'Existing ' + id });
        tabsCreated.push(existing.tabId);
        await page.goto(detailUrl + '?tab=overview');
        await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
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

        await page.getByRole('button', { name: 'New', exact: true }).click();
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
        await page.getByRole('tab', { name: 'Verified queries' }).click();
        const filter = page.getByRole('searchbox');
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
    } finally {
        access.resolve();
        for (const tabId of tabsCreated) await action('tab.delete', { connectionId, tabId });
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});
