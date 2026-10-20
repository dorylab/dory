import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const secondProjectId = '22222222-2222-4222-8222-222222222222';
const storedSourceName = `Revenue definitions.md · ${'linear-fixture'.slice(-8)} · revenue.md`;

test('Linear project selection confirms sharing, saves scope, displays read-only sources and opens originals', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const action = async (actionId: string, input: Record<string, unknown>, confirmationToken?: string) => {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, JSON.stringify(body)).toBe(true);
        return body.data;
    };
    const { connections } = await action('connection.list', {});
    const model = await action('knowledge.create', { name: `linear-ui-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    let created = false;
    let verified = false;
    let keyVersion = 1;
    let projectIds = [projectId];
    const connector = () => ({
        id: 'linear-fixture',
        provider: 'linear',
        credentialId: 'credential-fixture',
        linearWorkspaceId: 'workspace-fixture',
        linearWorkspaceName: 'Dory Product',
        projectIds,
        status: 'ready',
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
    });
    const writes: Array<{ actionId: string; input: Record<string, unknown> }> = [];
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        let data: unknown;
        switch (body.actionId) {
            case 'knowledge.getLinearConnectorSetup':
                data = {
                    available: true,
                    configured: true,
                    canManage: true,
                    credentials: verified
                        ? [{ id: 'credential-fixture', workspaceId: 'workspace-fixture', workspaceName: 'Dory Product', status: 'active', version: keyVersion }]
                        : [],
                };
                break;
            case 'knowledge.saveLinearApiKey':
                if (body.input.apiKey === 'invalid') return route.fulfill({ json: { ok: false, code: 'ACTION_FAILED', message: 'Invalid API Key' } });
                expect(body.input.apiKey).toBe('lin_api_test_fixture');
                verified = true;
                keyVersion++;
                data = { id: 'credential-fixture', workspaceId: 'workspace-fixture', workspaceName: 'Dory Product', status: 'active', version: keyVersion };
                break;
            case 'knowledge.listLinearProjects':
                data = {
                    nodes: [
                        { id: projectId, name: 'Revenue definitions', url: 'https://linear.app/dory/project/revenue' },
                        { id: secondProjectId, name: 'Customer glossary', url: 'https://linear.app/dory/project/customers' },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                };
                break;
            case 'knowledge.listConnectors':
                data = { connectors: created ? [connector()] : [] };
                break;
            case 'knowledge.createLinearConnector':
                created = true;
                projectIds = body.input.projectIds;
                writes.push(body);
                data = connector();
                break;
            case 'knowledge.updateLinearProjects':
                projectIds = body.input.projectIds;
                writes.push(body);
                data = connector();
                break;
            case 'knowledge.listKnowledgeSources':
                data = {
                    sources: created
                        ? [
                              {
                                  id: 'source-fixture',
                                  organizationId: organization,
                                  knowledgeModelId: model.id,
                                  connectionId: null,
                                  fileName: storedSourceName,
                                  format: 'markdown',
                                  byteSize: 50,
                                  createdBy: null,
                                  createdAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString(),
                                  connectorId: 'linear-fixture',
                                  connectorProvider: 'linear',
                                  remotePath: 'document/revenue.md',
                                  sourceUrl: 'https://linear.app/dory/document/revenue',
                              },
                          ]
                        : [],
                };
                break;
            default:
                return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    try {
        await page.goto(`/${organization}/knowledge/${model.id}?tab=sources`);
        await page.getByRole('button', { name: 'Connect knowledge base', exact: true }).first().click();
        await page.getByRole('button', { name: 'Linear', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByLabel('Linear API Key', { exact: true })).toHaveAttribute('type', 'password');
        await dialog.getByLabel('Linear API Key', { exact: true }).fill('invalid');
        await dialog.getByRole('button', { name: 'Verify and save API Key', exact: true }).click();
        await expect(dialog.getByRole('alert')).toContainText('Invalid API Key');
        await dialog.getByLabel('Linear API Key', { exact: true }).fill('lin_api_test_fixture');
        await dialog.getByRole('button', { name: 'Verify and save API Key', exact: true }).click();
        await expect(dialog.getByLabel('Linear API Key', { exact: true })).toHaveValue('');
        await expect(dialog.getByText('Revenue definitions', { exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Connect and sync', exact: true })).toBeDisabled();
        await dialog.getByLabel('Revenue definitions', { exact: true }).check();
        await expect(dialog.getByRole('button', { name: 'Connect and sync', exact: true })).toBeDisabled();
        await dialog.getByLabel(/I understand that all selected project content/).check();
        await dialog.getByRole('button', { name: 'Connect and sync', exact: true }).click();
        await expect(page.getByText('Linear · Dory Product', { exact: true })).toBeVisible();
        await expect(page.getByText('Linear · Read-only', { exact: true })).toBeVisible();
        await expect(page.getByText('Revenue definitions.md', { exact: true })).toBeVisible();
        await expect(page.getByText(storedSourceName, { exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', 'https://linear.app/dory/document/revenue');
        await expect(page.getByRole('link', { name: 'Open original' })).toHaveText('');
        await page.getByRole('link', { name: 'Open original' }).hover();
        await expect(page.getByRole('tooltip')).toHaveText('Open original');
        await page.getByRole('button', { name: 'Edit projects', exact: true }).click();
        await expect(dialog.getByLabel('Revenue definitions', { exact: true })).toBeChecked();
        await dialog.getByLabel('Customer glossary', { exact: true }).check();
        await dialog.getByLabel(/I understand that all selected project content/).check();
        await dialog.getByRole('button', { name: 'Save and sync', exact: true }).click();
        await expect(page.getByText(/2 projects selected · Syncs hourly/)).toBeVisible();
        await page.getByRole('button', { name: 'Edit projects', exact: true }).click();
        await dialog.getByLabel('Linear API Key', { exact: true }).fill('unsaved-secret');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Edit projects', exact: true }).click();
        await expect(dialog.getByLabel('Linear API Key', { exact: true })).toHaveValue('');
        expect(new URL(page.url()).search).not.toContain('lin_api');
        expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('unsaved-secret');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(writes.map(write => write.actionId)).toEqual(['knowledge.createLinearConnector', 'knowledge.updateLinearProjects']);
        expect(writes[1].input.projectIds).toEqual([projectId, secondProjectId]);
    } finally {
        await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});
