import { initialWorkingState } from '../../apps/web/lib/work-documents/working-draft';
import type { ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import { expect } from '@playwright/test';
import { test, expectAppHealthy } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

for (const kind of ['attachment', 'database'] as const) {
    test(`Report Workspace preserves versioned snapshots and manually runs ${kind} SQL`, async ({ page, appErrors }, testInfo) => {
        test.setTimeout(180_000);
        const connection = createWorkbenchConnection();
        await mockWorkbenchApis(page, { initialConnections: [connection] });
        let executions = 0;
        let writes = 0;
        let fail = false;
        const reference = { documentId: 'report-snapshot', artifactId: 'result-original', revision: 3, snapshotId: 'snap-original', publicationId: 'published-1' };
        const context: ReportWorkspaceContext = {
            reference,
            title: 'Customer activity',
            source: kind === 'attachment' ? { kind, dialect: 'duckdb' } : { kind, dialect: 'postgres', database: 'orders', connectionId: connection.connection.id },
            evidence: {
                snapshotId: reference.snapshotId,
                artifactId: reference.artifactId,
                title: 'Customer count',
                connectionId: null,
                connectionName: null,
                sql: 'SELECT COUNT(*) AS total_customers FROM customers',
                capturedAt: '2026-10-28T00:00:00Z',
                columns: ['total_customers'],
                columnTypes: [{ name: 'total_customers', type: 'BIGINT' }],
                rows: [{ total_customers: 2000 }],
                rowCount: 2000,
                truncated: true,
                runId: null,
            },
        };
        let draft = {
            userId: 'fixture',
            documentId: reference.documentId,
            baseRevision: reference.revision,
            expectedReportRevision: reference.revision,
            revision: 1,
            results: {} as Record<string, any>,
            state: initialWorkingState(context.title, { markdown: '# Customers', visuals: [], evidence: [context.evidence], knowledge: [] }),
        };
        await page.route('**/api/actions/execute', async route => {
            const { actionId, input } = route.request().postDataJSON();
            if (actionId.startsWith('report.workspace.')) {
                if (actionId !== 'report.workspace.saveDraft') expect(input).toMatchObject(reference);
                if (actionId === 'report.workspace.analysis') return route.fulfill({ json: { ok: true, data: { draft, sources: [context] } } });
                if (actionId === 'report.workspace.saveDraft') {
                    draft = {
                        ...draft,
                        revision: draft.revision + 1,
                        state: {
                            ...draft.state,
                            title: input.title,
                            tabs: input.tabs,
                            activeTabId: input.activeTabId,
                            content: { ...draft.state.content, body: input.body, visuals: input.visuals },
                        },
                    };
                    return route.fulfill({ json: { ok: true, data: draft } });
                }
                if (actionId === 'report.workspace.context') return route.fulfill({ json: { ok: true, data: context } });
                if (actionId === 'report.workspace.source')
                    return route.fulfill({
                        json: {
                            ok: true,
                            data: {
                                available: true,
                                tables: kind === 'attachment' ? [{ name: 'customers', filename: 'customers.csv', columns: [{ name: 'active', type: 'BOOLEAN' }] }] : [],
                            },
                        },
                    });
                if (actionId === 'report.workspace.details')
                    return route.fulfill({ json: { ok: true, data: { artifact: null, reports: [{ id: reference.documentId, title: context.title }] } } });
                if (actionId === 'report.workspace.execute') {
                    executions++;
                    expect(input.sql).toContain('WHERE active');
                    if (fail) return route.fulfill({ status: 400, json: { ok: false, message: 'Query rejected' } });
                    draft.results['new-result'] = {
                        sourceArtifactId: reference.artifactId,
                        evidence: { ...context.evidence, artifactId: 'artifact_new-result', sql: input.sql, rows: [{ total_customers: 200 }], rowCount: 1, truncated: false },
                    };
                    return route.fulfill({
                        json: {
                            ok: true,
                            data: {
                                sessionId: input.requestId,
                                sets: [
                                    {
                                        resultSetId: 'new-result',
                                        sql: input.sql,
                                        rows: [{ total_customers: 200 }],
                                        columns: [{ name: 'total_customers', type: 'BIGINT' }],
                                        rowCount: 1,
                                        limited: false,
                                    },
                                ],
                            },
                        },
                    });
                }
            }
            if (['query.execute', 'query.readOnlyExecute', 'report.update', 'report.publish'].includes(actionId)) writes++;
            await route.fallback();
        });
        await page.goto('/');
        const organization = new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organization}/reports/${reference.documentId}/workspace/${reference.artifactId}?revision=3&publication=published-1&snapshot=snap-original`);
        const result = page.getByTestId('report-workspace-result');
        await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toHaveAttribute('data-state', 'active');
        await expect(result.getByText('2000', { exact: true })).toBeVisible();
        await expect(page.getByText('Partial result', { exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(context.evidence.sql);
        expect((await page.getByTestId('sql-editor').boundingBox())!.height).toBeGreaterThan(100);
        expect(executions).toBe(0);
        await page.getByRole('button', { name: 'Source and details', exact: true }).click();
        await expect(page.getByText('Original Artifact unavailable.', { exact: false })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Customer activity', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT COUNT(*) AS total_customers FROM customers WHERE active'));
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(result.getByText('200', { exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Current run', exact: true })).toHaveAttribute('data-state', 'active');
        expect(executions).toBe(1);
        await page.getByRole('tab', { name: 'Report snapshot', exact: true }).click();
        await expect(result.getByText('2000', { exact: true })).toBeVisible();
        fail = true;
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Query rejected' })).toBeVisible();
        await expect(result.getByText('2000', { exact: true })).toBeVisible();
        await page.reload();
        await expect(result.getByText('2000', { exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('SELECT COUNT(*) AS total_customers FROM customers WHERE active');
        expect(executions).toBe(2);
        expect(writes).toBe(0);
        await page.screenshot({ path: testInfo.outputPath(`report-workspace-${kind}.png`), fullPage: true });
        await expectAppHealthy(appErrors);
    });
}
