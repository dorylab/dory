import { openDataSources } from './helpers/navigation';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('published business rules show their scope and link to related metrics', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const action = async (actionId: string, input: Record<string, unknown>, confirmationToken?: string) => {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    };
    const { connections } = await action('connection.list', {});
    const connectionId = connections[0].connection.id;
    const model = await action('knowledge.create', { name: `rule-scope-ui-${randomUUID()}`, connectionIds: [connectionId] });
    const shared = {
        kind: 'business_rule',
        name: 'Exclude failed orders',
        description: 'Exclude failed orders from revenue and order count.',
        aliases: [],
        sourceConnectionId: null,
        applicationScope: 'metrics',
        applicableMetricNames: ['Net revenue', 'Order count'],
    };
    const evidence = [{ id: 'e', quote: shared.description, sourceUrl: 'https://linear.app/test/document/rule', sourceTitle: 'Rules.md', state: 'current' }];
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        let data: unknown;
        switch (body.actionId) {
            case 'knowledge.listBusinessRules':
                data = {
                    rules: [
                        {
                            id: 'shared-rule',
                            payload: shared,
                            applicationScope: 'metrics',
                            metricIds: ['metric:net'],
                            metrics: [{ id: 'metric:net', name: 'Net revenue', sourceConnectionId: connectionId }],
                            revision: 1,
                            status: 'active',
                            sourceState: 'current',
                            evidence,
                        },
                    ],
                    metrics: [],
                };
                break;
            default:
                return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    try {
        await page.goto(`/${organization}/knowledge/${model.id}?tab=rules`);
        await expect(page.getByRole('tab', { name: 'Knowledge sources', selected: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Exclude failed orders' })).toBeVisible();
        await expect(page.getByText(/Selected metrics · 1 linked metrics/)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Net revenue', exact: true })).toHaveAttribute('href', /tab=definitions&definition=metric%3Anet/);
    } finally {
        await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});
