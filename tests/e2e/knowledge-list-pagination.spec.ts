import { openDataSources } from './helpers/navigation';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function action(request: APIRequestContext, actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
    const body = await response.json();
    expect(body.ok, `${actionId}: ${body.message ?? response.status()}`).toBe(true);
    return body.data;
}

test('knowledge asset lists paginate independently and preserve asset deep links', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const connectionId: string = connections[0].connection.id;
    const model = await action(request, 'knowledge.create', { name: `pagination-${randomUUID()}`, connectionIds: [connectionId] });
    const queries = Array.from({ length: 12 }, (_, index) => ({
        id: `query-${index}`,
        title: `Query ${index}`,
        question: `Question ${index}`,
        sql: 'SELECT 1',
        sourceConnectionId: connectionId,
        updatedAt: new Date().toISOString(),
        updatedByName: 'Tester',
    }));
    try {
        await page.route('**/api/actions/execute', async route => {
            const { actionId } = route.request().postDataJSON();
            const data: Record<string, unknown> = {
                'knowledge.listVerifiedQueries': { queries },
                'knowledge.listQuerySources': [],
            };
            if (actionId in data) return route.fulfill({ json: { ok: true, data: data[actionId] } });
            return route.continue();
        });
        const path = `/${organization}/knowledge/${model.id}`;
        for (const tab of ['definitions', 'rules']) {
            await page.goto(path + '?tab=' + tab);
            await expect.poll(() => new URL(page.url()).searchParams.get('tab')).not.toBe(tab);
        }
        await page.goto(path + '?tab=queries');
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page).toHaveURL(/queriesPage=2/);
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);
        await page.goto(path + '?tab=queries&query=query-11');
        await expect(page.locator('#verified-query-details-query-11')).toBeVisible();
    } finally {
        await action(request, 'knowledge.delete', { knowledgeModelId: model.id }, 'pagination-test-cleanup');
    }
});
