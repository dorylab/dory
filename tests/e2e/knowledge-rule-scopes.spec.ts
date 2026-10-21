import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('semantic model and rule scope labels are distinct and a metric reviews dependent rules atomically', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
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
    const metric = {
        kind: 'metric',
        name: 'Net revenue',
        description: 'Net revenue sums order revenue.',
        aliases: [],
        sourceConnectionId: connectionId,
        ruleCandidateIds: ['shared-draft'],
    };
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
    const draft = (id: string, payload: object) => ({ id, payload, action: 'add', targetAssetId: null, targetRevision: null, evidence });
    let published = false;
    let bundleCount = 0;
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        let data: unknown;
        switch (body.actionId) {
            case 'knowledge.getExtractionStatus':
                data = { canManage: true, connectors: [], jobs: [], pendingCount: published ? 0 : 2, organizationJob: { status: 'completed', error: null } };
                break;
            case 'knowledge.listCandidates':
                data = { candidates: published ? [] : [draft('metric-draft', metric), draft('shared-draft', shared)], targets: [], metrics: [], rules: [] };
                break;
            case 'knowledge.listBusinessRules':
                data = {
                    rules: published
                        ? [
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
                          ]
                        : [],
                    metrics: [],
                };
                break;
            case 'knowledge.reviewCandidateBundle':
                expect(body.input.items).toHaveLength(2);
                expect(body.input.items[0].payload.ruleCandidateIds).toEqual(['shared-draft']);
                expect(body.input.items[1].payload.applicationScope).toBe('metrics');
                expect(body.input.items[1].payload.applicableMetricNames).not.toContain('Payment success rate');
                published = true;
                bundleCount++;
                data = { published: [] };
                break;
            default:
                return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    try {
        await page.goto(`/${organization}/knowledge/${model.id}?tab=review`);
        await expect(page.getByRole('tab', { name: 'Semantic model', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Business rules', exact: true })).toBeVisible();
        const row = page.getByRole('list', { name: 'Pending review', exact: true }).getByRole('listitem').filter({ hasText: 'Net revenue' });
        await expect(row.getByRole('checkbox')).toBeDisabled();
        await row.getByRole('button', { name: 'Review', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Review and publish required rules together' })).toBeVisible();
        await expect(dialog.getByText('Selected metrics', { exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Approve and publish', exact: true }).click();
        await expect(dialog).toBeHidden();
        expect(bundleCount).toBe(1);
        await page.getByRole('tab', { name: 'Business rules', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Exclude failed orders' })).toBeVisible();
        await expect(page.getByText(/Selected metrics · 1 linked metrics/)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Net revenue', exact: true })).toHaveAttribute('href', /tab=definitions&definition=metric%3Anet/);
    } finally {
        await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});
