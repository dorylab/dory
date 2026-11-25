import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { DocumentGenerationTaskDetail } from '../../packages/shared/src/types/knowledge-document-draft';

// Exercise the real Action transport, database, connection metadata and background worker without an AI dependency.
test('database document task is persisted and background table failures survive a new page request', async ({ page, request }) => {
    test.setTimeout(120_000);
    async function action<T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, actionId + ' ' + body.message).toBe(true);
        return body.data;
    }
    const { connections } = await action<{ connections: { connection: { id: string; engine: string }; identities: { enabled?: boolean }[] }[] }>('connection.list', {});
    const connectionId = connections.find(item => item.identities.some(identity => identity.enabled !== false))!.connection.id;
    const { databases } = await action<{ databases: { value: string }[] }>('schema.listDatabases', { connectionId });
    expect(databases.length).toBeGreaterThan(0);
    const model = await action<{ id: string; organizationId: string }>('knowledge.create', { name: 'Background task test ' + randomUUID(), connectionIds: [connectionId] });
    try {
        const id = randomUUID();
        const table = '__missing_document_task_table_' + randomUUID().replaceAll('-', '');
        const input = {
            id,
            submissionId: id,
            knowledgeModelId: model.id,
            connectionId,
            database: databases[0].value,
            tables: [table],
            prompt: '',
            documentIds: [],
            queryIds: [],
            locale: 'en',
            folderId: null,
        };
        const first = await action<DocumentGenerationTaskDetail>('knowledge.createDocumentGenerationTask', input);
        expect(first.id).toBe(id);
        expect(['queued', 'running', 'failed']).toContain(first.status);
        const duplicate = await action<DocumentGenerationTaskDetail>('knowledge.createDocumentGenerationTask', input);
        expect(duplicate.id).toBe(id);
        await expect.poll(async () => (await action<DocumentGenerationTaskDetail>('knowledge.getDocumentGenerationTask', { id })).status, { timeout: 30_000 }).toBe('failed');
        const failed = await action<DocumentGenerationTaskDetail>('knowledge.getDocumentGenerationTask', { id });
        expect(failed.draft?.failedTables).toEqual([table]);
        expect(failed.error).toBe('TABLES_UNAVAILABLE');
        expect(failed.documents).toEqual([]);
        const listing = await action<{ tasks: { id: string }[] }>('knowledge.listDocumentGenerationTasks', {});
        expect(listing.tasks.filter(task => task.id === id)).toHaveLength(1);
        expect(JSON.stringify(listing)).not.toMatch(/executionContext|leaseToken|"draft"|"input"/);
        await page.goto(`/${model.organizationId}/knowledge/${model.id}?generationTask=${id}`);
        const dialog = page.getByRole('dialog', { name: 'Generate from database' });
        await expect(dialog.getByText(table, { exact: true })).toBeVisible();
        await page.reload();
        await expect(dialog.getByText(table, { exact: true })).toBeVisible();
    } finally {
        await action('knowledge.delete', { knowledgeModelId: model.id }, 'knowledge.delete');
    }
});
