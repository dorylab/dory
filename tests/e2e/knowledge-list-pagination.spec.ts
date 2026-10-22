import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function action(request: APIRequestContext, actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
    const body = await response.json();
    expect(body.ok, `${actionId}: ${body.message ?? response.status()}`).toBe(true);
    return body.data;
}

test('all five knowledge lists paginate independently and preserve asset deep links', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const connectionId: string = connections[0].connection.id;
    const model = await action(request, 'knowledge.create', { name: `pagination-${randomUUID()}`, connectionIds: [connectionId] });
    const definitions = Array.from({ length: 12 }, (_, index) => ({
        id: `metric-${index}`,
        name: `Metric ${index}`,
        kind: 'metric',
        status: 'verified',
        sourceConnectionId: connectionId,
        expression: 'COUNT(*)',
    }));
    const queries = Array.from({ length: 12 }, (_, index) => ({
        id: `query-${index}`,
        title: `Query ${index}`,
        question: `Question ${index}`,
        sql: 'SELECT 1',
        definitionIds: [],
        updatedAt: new Date().toISOString(),
        updatedByName: 'Tester',
    }));
    const sources = Array.from({ length: 12 }, (_, index) => ({
        id: `source-${index}`,
        fileName: `Source ${index}.md`,
        format: 'markdown',
        connectionId: null,
        byteSize: 30,
        updatedAt: new Date().toISOString(),
        connectorId: null,
        connectorProvider: null,
        sourceUrl: null,
    }));
    const rules = Array.from({ length: 12 }, (_, index) => ({
        id: `rule-${index}`,
        payload: { kind: 'business_rule', name: `Rule ${index}`, description: `Rule description ${index}`, sourceConnectionId: null },
        applicationScope: 'model',
        metricIds: [],
        metrics: [],
        revision: 1,
        status: 'active',
        sourceState: 'current',
        evidence: [],
    }));
    const candidates = Array.from({ length: 12 }, (_, index) => ({
        id: `draft-${index}`,
        payload: { kind: 'business_rule', name: `Draft ${index}`, description: `Draft description ${index}`, sourceConnectionId: null },
        action: 'add',
        targetAssetId: null,
        targetRevision: null,
        evidence: [],
    }));
    try {
        await action(request, 'knowledge.saveDefinitions', { knowledgeModelId: model.id, definitions });
        await page.route('**/api/actions/execute', async route => {
            const { actionId } = route.request().postDataJSON();
            const data: Record<string, unknown> = {
                'knowledge.listVerifiedQueries': { queries },
                'knowledge.listKnowledgeSources': { sources },
                'knowledge.listBusinessRules': { rules, metrics: [] },
                'knowledge.getExtractionStatus': { canManage: true, connectors: [], jobs: [], pendingCount: candidates.length, organizationJob: null },
                'knowledge.listCandidates': { candidates, targets: [], metrics: [], rules: [] },
            };
            if (actionId in data) return route.fulfill({ json: { ok: true, data: data[actionId] } });
            return route.continue();
        });
        await page.goto(`/${organization}/knowledge/${model.id}?tab=definitions`);
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page).toHaveURL(/definitionsPage=2/);
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);

        await page.getByRole('tab', { name: 'Verified queries' }).click();
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page).toHaveURL(/queriesPage=2/);
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);
        await page.getByRole('tab', { name: 'Semantic model' }).click();
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);

        await page.getByRole('tab', { name: 'Knowledge sources' }).click();
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);

        await page.getByRole('tab', { name: 'Business rules' }).click();
        await expect(page.locator('section[id^="rule-"]')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page.locator('section[id^="rule-"]')).toHaveCount(2);

        await page.getByRole('tab', { name: /Pending review/ }).click();
        const list = page.getByRole('list', { name: 'Pending review' });
        await expect(list.getByRole('listitem')).toHaveCount(10);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(list.getByRole('listitem')).toHaveCount(2);
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: '20', exact: true }).click();
        await expect(list.getByRole('listitem')).toHaveCount(12);
        await expect(page).toHaveURL(/knowledgePageSize=20/);
        await page.getByRole('tab', { name: 'Semantic model' }).click();
        await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(12);

        for (const [tab, parameter, id, locator] of [
            ['definitions', 'definition', 'metric-11', 'button[aria-label="Hide details for Metric 11"]'],
            ['queries', 'query', 'query-11', 'button[aria-label="Query 11"]'],
            ['sources', 'source', 'source-11', 'tr:has-text("Source 11.md")'],
            ['rules', 'rule', 'rule-11', '#rule-rule-11'],
        ]) {
            await page.goto(`/${organization}/knowledge/${model.id}?tab=${tab}&${parameter}=${id}`);
            await expect(page.locator(locator)).toBeVisible();
            await expect(page).toHaveURL(new RegExp(`${tab}Page=2`));
        }
        await page.goto(`/${organization}/knowledge/${model.id}?tab=definitions&definition=metric-11`);
        await expect(page.getByRole('button', { name: 'Hide details for Metric 11' })).toBeVisible();
        await page.getByRole('button', { name: 'Previous page' }).click();
        await expect(page.getByRole('button', { name: 'Show details for Metric 0' })).toBeVisible();
        await expect(page).not.toHaveURL(/definition=metric-11/);
    } finally {
        await action(request, 'knowledge.delete', { knowledgeModelId: model.id }, 'pagination-test-cleanup');
    }
});
