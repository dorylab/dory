import { openDataSources } from './helpers/navigation';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function action(request: APIRequestContext, actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
    const body = await response.json();
    expect(body.ok, body.message).toBe(true);
    return body.data;
}
async function removeModel(request: APIRequestContext, id: string) {
    await action(request, 'knowledge.delete', { knowledgeModelId: id }, 'publication-ui-cleanup');
}

async function openModelEditor(page: Page) {
    await page.getByRole('button', { name: 'Knowledge base actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    return page.getByRole('dialog', { name: 'Edit knowledge base' });
}

test('deleting a knowledge base from its actions menu requires confirmation', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `delete-confirmation-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    const listPath = `/${org}/knowledge`;
    let deleteRequests = 0;
    let deleted = false;

    page.on('request', req => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/actions/execute' && req.postDataJSON().actionId === 'knowledge.delete') {
            deleteRequests++;
        }
    });

    try {
        await page.goto(`${listPath}/${model.id}`);
        const actions = page.getByRole('button', { name: 'Knowledge base actions' });
        const deleteItem = page.getByRole('menuitem', { name: 'Delete', exact: true });
        const confirm = page.getByRole('alertdialog', { name: 'Delete knowledge base?' });
        await actions.click();
        await deleteItem.click();
        await expect(confirm).toContainText(model.name);
        expect(deleteRequests).toBe(0);

        await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(actions).toBeFocused();
        expect(deleteRequests).toBe(0);

        await actions.click();
        await deleteItem.click();
        await confirm.getByRole('button', { name: 'Delete knowledge base', exact: true }).click();
        await expect(page).toHaveURL(new URL(listPath, page.url()).href);
        deleted = true;
        expect(deleteRequests).toBe(1);
        const { models } = await action(request, 'knowledge.list', { query: model.name });
        expect(models).toEqual([]);
    } finally {
        if (!deleted) await removeModel(request, model.id);
    }
});

test('model publication defaults to off, persists automatic mode and keeps drafts unchanged', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `publication-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    try {
        await page.goto(`/${org}/knowledge/${model.id}`);
        const editor = await openModelEditor(page);
        await expect(editor.getByText('Publication mode: Automatic publication off', { exact: true })).toBeVisible();
        await editor.getByRole('button', { name: 'Publication settings', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Publication settings' });
        await expect(dialog.getByRole('combobox', { name: 'Publication mode' })).toContainText('Automatic publication off');
        await dialog.getByRole('combobox', { name: 'Publication mode' }).click();
        await page.getByRole('option', { name: 'Automatically publish eligible new knowledge' }).click();
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await action(request, 'knowledge.getPublicationPolicy', { knowledgeModelId: model.id })).toMatchObject({ mode: 'automatic', version: 1 });
        expect((await action(request, 'knowledge.listCandidates', { knowledgeModelId: model.id })).candidates).toEqual([]);
        await page.reload();
        await openModelEditor(page);
        await expect(editor.getByText('Publication mode: Automatically publish eligible new knowledge', { exact: true })).toBeVisible();
        await editor.getByRole('button', { name: 'Publication settings', exact: true }).click();
        await expect(dialog.getByRole('combobox', { name: 'Publication mode' })).toContainText('Automatically publish eligible new knowledge');
        await dialog.getByRole('combobox').click();
        await page.getByRole('option', { name: 'Automatic publication off', exact: true }).click();
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await action(request, 'knowledge.getPublicationPolicy', { knowledgeModelId: model.id })).toMatchObject({ mode: 'review', version: 2 });
    } finally {
        await removeModel(request, model.id);
    }
});

test('processing history shows background evidence, withdrawal and failure retry on narrow dark screens', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `publication-history-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    const calls: string[] = [];
    const events = [
        {
            id: 'background',
            candidateId: 'draft-b',
            kind: 'background',
            assetId: null,
            assetRevision: null,
            payload: { name: 'Historical incident', description: 'A hypothesis for a one-off investigation.' },
            reason: 'Historical context, not a reusable rule.',
            createdAt: '2026-10-21T00:00:00Z',
            evidence: [{ quote: 'Hypothesis only.', sourceTitle: 'Original incident', sourceUrl: 'https://example.com/incident' }],
        },
        {
            id: 'automatic',
            candidateId: 'draft-a',
            kind: 'automatic',
            assetId: 'metric-a',
            assetRevision: 'version-1',
            payload: { name: 'New revenue', description: 'Automatically published with explicit mapping.' },
            reason: null,
            createdAt: '2026-10-21T00:00:00Z',
            evidence: [],
        },
    ];
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        if (body.actionId === 'knowledge.getProcessingHistory')
            return route.fulfill({ json: { ok: true, data: { events, tasks: [{ id: 'job', status: 'failed', error: 'temporary_publication_failure' }] } } });
        if (['knowledge.withdrawAutomaticPublication', 'knowledge.retryPublication'].includes(body.actionId)) {
            calls.push(body.actionId);
            return route.fulfill({ json: { ok: true, data: { ok: true } } });
        }
        return route.continue();
    });
    try {
        await page.goto(`/${org}/knowledge/${model.id}`);
        const editor = await openModelEditor(page);
        await editor.getByRole('button', { name: 'Processing history' }).click();
        const dialog = page.getByRole('dialog', { name: 'Processing history' });
        await expect(dialog.getByText('Historical incident', { exact: true })).toBeVisible();
        await dialog.getByText('Source evidence', { exact: true }).first().click();
        await expect(dialog.getByRole('link', { name: 'Original incident' })).toHaveAttribute('href', 'https://example.com/incident');
        await expect(dialog.getByRole('button', { name: 'Restore for review' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Withdraw automatic publication' }).click();
        await expect.poll(() => calls.includes('knowledge.withdrawAutomaticPublication')).toBe(true);
        await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect.poll(() => calls.includes('knowledge.retryPublication')).toBe(true);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
        });
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    } finally {
        await removeModel(request, model.id);
    }
});
