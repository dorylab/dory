import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function action(request: APIRequestContext, actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
    const body = await response.json();
    expect(body.ok, body.message).toBe(true);
    return body.data;
}
async function removeModel(request: APIRequestContext, id: string) {
    await action(request, 'knowledge.delete', { knowledgeModelId: id }, 'publication-ui-cleanup');
}

test('model publication defaults to review, persists automatic mode and keeps drafts unchanged', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `publication-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    try {
        await page.goto(`/${org}/knowledge/${model.id}?tab=review`);
        await expect(page.getByText('Publication mode: Review before publishing', { exact: true })).toHaveCount(0);
        const toolbar = page.getByRole('toolbar', { name: 'Pending review actions' });
        await expect(toolbar.getByRole('button')).toHaveCount(4);
        expect(await toolbar.getByRole('button').allTextContents()).toEqual(['', '', 'AI organize drafts', 'Approve selected (0)']);
        await toolbar.getByRole('button', { name: 'Processing history' }).hover();
        await expect(page.getByRole('tooltip', { name: 'Processing history' })).toBeVisible();
        await toolbar.getByRole('button', { name: 'Publication settings' }).hover();
        await expect(page.getByRole('tooltip', { name: 'Publication settings' })).toBeVisible();
        await page.getByRole('button', { name: 'Publication settings', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('combobox', { name: 'Publication mode' })).toContainText('Review before publishing');
        await dialog.getByRole('combobox', { name: 'Publication mode' }).click();
        await page.getByRole('option', { name: 'Automatically publish eligible new knowledge' }).click();
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await action(request, 'knowledge.getPublicationPolicy', { knowledgeModelId: model.id })).toMatchObject({ mode: 'automatic', version: 1 });
        expect((await action(request, 'knowledge.listCandidates', { knowledgeModelId: model.id })).candidates).toEqual([]);
        await page.reload();
        await expect(page.getByText('Publication mode: Automatically publish eligible new knowledge', { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Publication settings', exact: true }).click();
        await expect(dialog.getByRole('combobox', { name: 'Publication mode' })).toContainText('Automatically publish eligible new knowledge');
        await dialog.getByRole('combobox').click();
        await page.getByRole('option', { name: 'Review before publishing', exact: true }).click();
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await action(request, 'knowledge.getPublicationPolicy', { knowledgeModelId: model.id })).toMatchObject({ mode: 'review', version: 2 });
    } finally {
        await removeModel(request, model.id);
    }
});

test('processing history shows background evidence, restore, withdrawal and failure retry on narrow dark screens', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
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
        if (['knowledge.restoreBackground', 'knowledge.withdrawAutomaticPublication', 'knowledge.retryPublication'].includes(body.actionId)) {
            calls.push(body.actionId);
            return route.fulfill({ json: { ok: true, data: { ok: true } } });
        }
        return route.continue();
    });
    try {
        await page.goto(`/${org}/knowledge/${model.id}?tab=review`);
        await page.getByRole('button', { name: 'Processing history' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Historical incident', { exact: true })).toBeVisible();
        await dialog.getByText('Source evidence', { exact: true }).first().click();
        await expect(dialog.getByRole('link', { name: 'Original incident' })).toHaveAttribute('href', 'https://example.com/incident');
        await dialog.getByRole('button', { name: 'Restore for review' }).click();
        await expect.poll(() => calls.includes('knowledge.restoreBackground')).toBe(true);
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
