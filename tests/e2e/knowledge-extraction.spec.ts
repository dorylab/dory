import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('connector extraction produces reviewable drafts, requires metric mapping and publishes independent business rules', async ({ page, request }) => {
    await page.goto('/'); await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const action = async (actionId: string, input: Record<string, unknown>, confirmationToken?: string) => {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } }); const body = await response.json(); expect(body.ok, body.message).toBe(true); return body.data;
    };
    const { connections } = await action('connection.list', {}); const connectionId = connections[0].connection.id;
    const model = await action('knowledge.create', { name: `extraction-ui-${randomUUID()}`, connectionIds: [connectionId] });
    let enabled = false, approvedMetric = false, approvedRule = false;
    const payload = (kind: string) => ({ kind, name: kind === 'metric' ? 'Net revenue' : 'Reporting timezone', description: kind === 'metric' ? 'Net revenue excludes refunds.' : 'Reports use UTC.', aliases: [], sourceConnectionId: null });
    const evidence = [{ id: 'evidence', quote: 'Net revenue excludes refunds. Reports use UTC.', sourceUrl: 'https://linear.app/dory/document/revenue', sourceTitle: 'Revenue.md', state: 'current' }];
    const candidates = () => enabled ? [!approvedMetric && { id: 'metric-draft', payload: payload('metric'), action: 'add', targetAssetId: null, targetRevision: null, evidence }, !approvedRule && { id: 'rule-draft', payload: payload('business_rule'), action: 'add', targetAssetId: null, targetRevision: null, evidence }].filter(Boolean) : [];
    const writes: string[] = [];
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON(); let data: unknown;
        switch (body.actionId) {
            case 'knowledge.getExtractionStatus': data = { canManage: true, connectors: [{ id: 'connector', autoExtract: enabled }], pendingCount: candidates().length, jobs: enabled ? [{ id: 'job', connectorId: 'connector', originalSourceId: 'source', status: 'completed', completedChunks: 1, totalChunks: 1, error: null }] : [] }; break;
            case 'knowledge.setAutoExtraction': enabled = body.input.enabled; data = { ok: true }; writes.push(body.actionId); break;
            case 'knowledge.listCandidates': data = { candidates: candidates(), targets: [] }; break;
            case 'knowledge.reviewCandidate': if (body.input.candidateId === 'metric-draft') { expect(body.input.payload.sourceConnectionId).toBe(connectionId); approvedMetric = true; } else approvedRule = true; data = { id: body.input.candidateId }; writes.push(body.actionId); break;
            case 'knowledge.listBusinessRules': data = { rules: approvedRule ? [{ id: 'rule', payload: payload('business_rule'), sourceState: 'current', revision: 1, status: 'active', evidence }] : [] }; break;
            case 'knowledge.listConnectors': data = { connectors: [{ id: 'connector', provider: 'linear', credentialId: 'credential', linearWorkspaceId: 'workspace', linearWorkspaceName: 'Test', projectIds: ['project'], status: 'ready', lastSyncedAt: new Date().toISOString(), lastError: null }] }; break;
            case 'knowledge.listKnowledgeSources': data = { sources: [{ id: 'source', fileName: 'Revenue.md', format: 'markdown', connectionId: null, byteSize: 50, updatedAt: new Date().toISOString(), connectorId: 'connector', connectorProvider: 'linear', remotePath: 'document/source.md', sourceUrl: 'https://linear.app/dory/document/revenue' }] }; break;
            default: return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    try {
        await page.goto(`/${organization}/knowledge/${model.id}?tab=sources`);
        await page.getByRole('button', { name: 'Enable and extract existing sources', exact: true }).click();
        await expect(page.getByText('Extraction completed 1', { exact: true })).toBeVisible();
        await page.getByRole('tab', { name: /Pending review/ }).click();
        const metric = page.locator('div.rounded-md.border.p-4').filter({ hasText: 'Net revenue' });
        await metric.getByRole('button', { name: 'Review', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('button', { name: 'Approve and publish', exact: true })).toBeDisabled();
        await expect(dialog.getByText('Net revenue excludes refunds. Reports use UTC.', { exact: true })).toBeVisible();
        await dialog.getByRole('combobox').nth(2).click();
        await page.getByRole('option', { name: connections[0].connection.name, exact: true }).click();
        await dialog.getByRole('button', { name: 'Approve and publish', exact: true }).click();
        await expect(dialog).toBeHidden();
        const rule = page.locator('div.rounded-md.border.p-4').filter({ hasText: 'Reporting timezone' });
        await rule.getByRole('button', { name: 'Review', exact: true }).click();
        await dialog.getByRole('button', { name: 'Approve and publish', exact: true }).click();
        await page.getByRole('tab', { name: 'Business rules', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Reporting timezone', exact: true })).toBeVisible();
        await expect(page.getByText('Reports use UTC.', { exact: true })).toBeVisible();
        expect(writes).toEqual(['knowledge.setAutoExtraction', 'knowledge.reviewCandidate', 'knowledge.reviewCandidate']);
    } finally { await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete'); }
});
