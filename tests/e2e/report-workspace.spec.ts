import { initialWorkingState } from '../../apps/web/lib/work-documents/working-draft';
import type { ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import { expect } from '@playwright/test';
import { test, expectAppHealthy } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

for (const kind of ['attachment', 'database'] as const) {
    test(`Report Workspace preserves versioned snapshots and manually runs ${kind} SQL`, async ({ page, appErrors }, testInfo) => {
        test.setTimeout(180_000);
        page.setDefaultTimeout(15_000);
        const connection = createWorkbenchConnection();
        await mockWorkbenchApis(page, { initialConnections: [connection] });
        let executions = 0;
        let sourceReads = 0;
        let writes = 0;
        let fail = false;
        let available = true;
        let hold = false;
        let release: (() => void) | undefined;
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
        const otherContext: ReportWorkspaceContext = {
            ...context,
            reference: { ...reference, artifactId: 'other-source', snapshotId: 'other-snapshot' },
            source:
                kind === 'database'
                    ? { kind: 'attachment', dialect: 'duckdb' }
                    : { kind: 'database', dialect: 'postgres', database: 'warehouse', connectionId: connection.connection.id },
            evidence: { ...context.evidence, artifactId: 'other-source', snapshotId: 'other-snapshot', title: 'Other source', sql: 'SELECT * FROM events' },
        };
        let draft = {
            userId: 'fixture',
            documentId: reference.documentId,
            baseRevision: reference.revision,
            expectedReportRevision: reference.revision,
            revision: 1,
            results: {} as Record<string, any>,
            state: initialWorkingState(context.title, { markdown: '# Customers', visuals: [], evidence: [context.evidence, otherContext.evidence], knowledge: [] }),
        };
        await page.route('**/api/actions/execute', async route => {
            const { actionId, input } = route.request().postDataJSON();
            if (actionId.startsWith('report.workspace.')) {
                if (actionId !== 'report.workspace.saveDraft') expect(input).toMatchObject(input.artifactId === 'other-source' ? otherContext.reference : reference);
                if (actionId === 'report.workspace.analysis') return route.fulfill({ json: { ok: true, data: { draft, sources: [context, otherContext] } } });
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
                if (actionId === 'report.workspace.source') {
                    sourceReads++;
                    const current = input.artifactId === 'other-source' ? otherContext : context;
                    return route.fulfill({
                        json: {
                            ok: true,
                            data: {
                                available,
                                tables: [
                                    {
                                        name: input.artifactId === 'other-source' ? 'events' : 'customers',
                                        filename: 'data.csv',
                                        columns: current.source.kind === 'attachment' ? [{ name: 'active', type: 'BOOLEAN' }] : [],
                                    },
                                ],
                            },
                        },
                    });
                }
                if (actionId === 'report.workspace.details')
                    return route.fulfill({ json: { ok: true, data: { artifact: null, reports: [{ id: reference.documentId, title: context.title }] } } });
                if (actionId === 'report.workspace.execute') {
                    executions++;
                    if (hold) {
                        await new Promise<void>(resolve => {
                            release = resolve;
                        });
                        await route.abort().catch(() => undefined);
                        return;
                    }
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
                                    {
                                        resultSetId: 'second-result',
                                        sql: 'SELECT 42 AS other_total',
                                        columns: [{ name: 'other_total', type: 'BIGINT' }],
                                        rows: [{ other_total: 42 }],
                                        rowCount: 1,
                                        limited: false,
                                    },
                                ],
                            },
                        },
                    });
                }
            }
            if (actionId === 'schema.describeTable') {
                expect(input).toMatchObject({ connectionId: connection.connection.id, database: kind === 'database' ? 'orders' : 'warehouse' });
                return route.fulfill({ json: { ok: true, data: { columns: [{ columnName: 'active', columnType: 'BOOLEAN' }] } } });
            }
            if (['query.execute', 'query.readOnlyExecute', 'report.update', 'report.publish', 'tab.save', 'tab.create', 'tab.delete'].includes(actionId)) writes++;
            await route.fallback();
        });
        await page.goto('/');
        const organization = new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organization}/reports/${reference.documentId}/workspace/${reference.artifactId}?revision=3&publication=published-1&snapshot=snap-original`);
        const result = page.getByTestId('report-workspace-result');
        await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toHaveAttribute('data-state', 'active');
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        await expect(result.getByText('Partial result', { exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(context.evidence.sql);
        expect((await page.getByTestId('sql-editor').boundingBox())!.height).toBeGreaterThan(100);
        expect(executions).toBe(0);
        const sidebar = page.getByTestId('sql-source-sidebar');
        await expect(sidebar.getByRole('combobox')).toHaveText(kind === 'database' ? 'orders' : 'main');
        await sidebar.getByRole('button', { name: 'Expand customers columns', exact: true }).click();
        await expect(sidebar.getByText('active', { exact: true })).toBeVisible();
        await expect(sidebar.getByText('BOOLEAN', { exact: true })).toBeVisible();
        await sidebar.getByRole('textbox', { name: 'Filter tables' }).fill('missing');
        await expect(sidebar.getByText('No matching tables found')).toBeVisible();
        await sidebar.getByRole('textbox', { name: 'Filter tables' }).fill('');
        const readsBeforeRefresh = sourceReads;
        await sidebar.getByRole('button', { name: 'Refresh tables' }).click();
        await expect.poll(() => sourceReads).toBeGreaterThan(readsBeforeRefresh);
        await page.getByRole('tab', { name: /^Other source/ }).click();
        await expect(sidebar.getByRole('combobox')).toHaveText(kind === 'database' ? 'main' : 'warehouse');
        await expect(sidebar.getByRole('button', { name: 'Expand customers columns', exact: true })).toHaveCount(0);
        await sidebar.getByRole('button', { name: 'Expand events columns', exact: true }).click();
        await expect(sidebar.getByText('active', { exact: true })).toBeVisible();
        await page.getByRole('tab', { name: /^Customer count/ }).click();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(context.evidence.sql);
        const panel = page.getByTestId('sql-workspace-panel');
        const rail = page.getByTestId('sql-console-action-rail');
        await expect(panel).toContainText('Customer activity');
        await expect(panel.getByRole('button', { name: 'Edit report text', exact: true })).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Continue in Work', exact: true })).toBeVisible();
        await expect(panel.getByTestId('report-workspace-context')).toContainText('Based on revision 3');
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: async (text: string) => {
                        (window as any).__handoff = text;
                    },
                },
            });
        });
        await panel.getByRole('button', { name: 'Continue with external Agent', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Task copied', exact: true })).toBeVisible();
        expect(await page.evaluate(() => (window as any).__handoff)).toContain(context.evidence.sql);
        expect(executions).toBe(0);

        await rail.getByRole('button', { name: 'Query & result actions', exact: true }).click();
        await expect(panel).toBeHidden();
        await rail.getByRole('button', { name: 'Query & result actions', exact: true }).click();
        await expect(panel).toBeVisible();
        await result.getByRole('tab', { name: 'Charts', exact: true }).click();
        await expect(result.getByRole('tab', { name: 'Charts', exact: true })).toHaveAttribute('data-state', 'active');
        await expect(result.getByRole('combobox').first()).toBeVisible();
        await result.getByRole('tab', { name: 'Table', exact: true }).click();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        await panel.getByRole('button', { name: 'Workspace actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Source and details', exact: true }).click();
        await expect(page.getByText('Original Artifact unavailable.', { exact: false })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Customer activity', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT COUNT(*) AS total_customers FROM customers WHERE active'));
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(result.getByRole('button', { name: '200', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Current run 1', exact: true })).toHaveAttribute('data-state', 'active');
        expect(executions).toBe(1);
        await page.getByRole('tab', { name: 'Current run 2', exact: true }).click();
        await expect(result.getByRole('button', { name: '42', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Current run 1', exact: true }).click();
        await expect(result.getByRole('button', { name: '200', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Report snapshot', exact: true }).click();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        fail = true;
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Query rejected' })).toBeVisible();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        await page.reload();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('SELECT COUNT(*) AS total_customers FROM customers WHERE active');
        expect(executions).toBe(2);
        hold = true;
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect.poll(() => Boolean(release)).toBe(true);
        await page.getByTestId('sql-query-toolbar').getByRole('button', { name: 'Cancel', exact: true }).click();
        release?.();
        await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        available = false;
        await page.reload();
        await expect(result.getByRole('button', { name: '2000', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
        expect(executions).toBe(3);
        expect(writes).toBe(0);
        await page.screenshot({ path: testInfo.outputPath(`report-workspace-${kind}.png`), fullPage: true });
        await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [] } }));
        await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
        await page.route(`**/api/work-documents/${reference.documentId}`, route =>
            route.fulfill({
                json: {
                    document: {
                        id: reference.documentId,
                        title: context.title,
                        revision: 3,
                        chatId: null,
                        scope: { connectionIds: [], connectionMode: 'auto', knowledgeMode: 'none' },
                        content: draft.state.content,
                    },
                },
            }),
        );
        let chatsSent = 0;
        page.on('request', request => {
            if (request.url().endsWith('/api/chat') && request.method() === 'POST') chatsSent++;
        });
        await page.getByRole('button', { name: 'Continue in Work', exact: true }).click();
        await expect(page).toHaveURL(/\/work\?/);
        await expect(page.getByTestId('data-agent').locator('[contenteditable="true"]').first()).toContainText('WHERE active');
        expect(chatsSent).toBe(0);
        await expectAppHealthy(appErrors);
    });
}
