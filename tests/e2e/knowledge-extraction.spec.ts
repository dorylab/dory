import { openDataSources } from './helpers/navigation';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('connector extraction remains available without a pending-review queue', async ({ page, request }) => {
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
    const model = await action('knowledge.create', { name: `extraction-ui-${randomUUID()}`, connectionIds: [connectionId] });
    let enabled = false;
    let draftRequests = 0;
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        let data: unknown;
        switch (body.actionId) {
            case 'knowledge.getExtractionStatus':
                data = {
                    canManage: true,
                    connectors: [{ id: 'connector', autoExtract: enabled }],
                    pendingCount: enabled ? 2 : 0,
                    jobs: enabled
                        ? [
                              {
                                  id: 'job',
                                  connectorId: 'connector',
                                  originalSourceId: 'source',
                                  status: 'completed',
                                  completedChunks: 1,
                                  totalChunks: 1,
                                  error: null,
                                  pendingCount: 2,
                              },
                          ]
                        : [],
                };
                break;
            case 'knowledge.setAutoExtraction':
                enabled = body.input.enabled;
                data = { ok: true };
                break;
            case 'knowledge.listCandidates':
                draftRequests++;
                data = { candidates: [], targets: [] };
                break;
            case 'knowledge.listConnectors':
                data = {
                    canWrite: true,
                    canManageLinear: true,
                    connectors: [
                        {
                            id: 'connector',
                            provider: 'linear',
                            credentialId: 'credential',
                            linearWorkspaceId: 'workspace',
                            linearWorkspaceName: 'Test',
                            projectIds: ['project'],
                            status: 'ready',
                            lastSyncedAt: new Date().toISOString(),
                            lastError: null,
                        },
                    ],
                };
                break;
            case 'knowledge.listKnowledgeSources':
                data = {
                    sources: [
                        {
                            id: 'source',
                            fileName: 'Revenue.md',
                            format: 'markdown',
                            connectionId: null,
                            byteSize: 50,
                            updatedAt: new Date().toISOString(),
                            connectorId: 'connector',
                            connectorProvider: 'linear',
                            remotePath: 'document/source.md',
                            sourceUrl: 'https://linear.app/dory/document/revenue',
                        },
                    ],
                };
                break;
            default:
                return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    try {
        await page.goto(`/${organization}/knowledge/${model.id}?tab=sources`);
        await page.getByRole('button', { name: 'Enable and extract existing sources', exact: true }).click();
        await expect(page.getByText('Extraction completed 1', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Pending review/i })).toHaveCount(0);
        await expect(page.getByText(/2 drafts/)).toHaveCount(0);

        await page.goto(new URL('?tab=review', page.url()).href);
        await expect(page.getByRole('tab', { name: 'Documents', selected: true })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Pending review' })).toHaveCount(0);
        expect(draftRequests).toBe(0);
    } finally {
        await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});
