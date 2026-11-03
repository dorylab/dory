import type { ReportAnalysisContext, ReportWorkingDraft, ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import { expect } from '@playwright/test';

import { changeReportDraft, initialWorkingState, reportDraftChanges } from '../../apps/web/lib/work-documents/working-draft';
import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

for (const kind of ['database', 'attachment'] as const) {
    test(`Report-connected workspace: ${kind} snapshot, cross-source tabs, results, draft operations and save`, async ({ page, appErrors }, testInfo) => {
        test.setTimeout(180_000);
        const connection = createWorkbenchConnection();
        const second = { ...connection, connection: { ...connection.connection, id: 'other-connection', name: 'Other database', type: 'postgres' as const } };
        await mockWorkbenchApis(page, { initialConnections: [connection, second] });
        const reference = { documentId: `connected-${kind}`, artifactId: 'artifact_original', revision: 3, componentId: 'logs' };
        const source: ReportWorkspaceContext = {
            reference,
            title: 'Logs report',
            source: kind === 'attachment' ? { kind, dialect: 'duckdb' } : { kind, dialect: 'postgres', connectionId: connection.connection.id, database: 'main' },
            evidence: {
                artifactId: reference.artifactId,
                snapshotId: 'original-snapshot',
                title: 'Logs summary',
                connectionId: kind === 'database' ? connection.connection.id : null,
                connectionName: connection.connection.name,
                sql: 'SELECT level, count FROM logs',
                capturedAt: '2026-11-03T00:00:00Z',
                columns: ['level', 'count'],
                columnTypes: [
                    { name: 'level', type: 'VARCHAR' },
                    { name: 'count', type: 'BIGINT' },
                ],
                rows: [{ level: 'error', count: 100 }],
                rowCount: 1,
                truncated: false,
                runId: null,
            },
        };
        let draft: ReportWorkingDraft = {
            id: `draft-${kind}`,
            userId: 'fixture',
            documentId: reference.documentId,
            baseRevision: 3,
            expectedReportRevision: 3,
            revision: 1,
            results: {},
            state: initialWorkingState('Logs report', {
                markdown:
                    '# Summary\n\nThis report summarizes log traffic.\n\nErrors require investigation. [Evidence](dory://evidence-group/finding)\n\n![Logs](dory://visual/logs)\n\n## Details\n\n![Copy](dory://visual/copy)',
                evidenceGroups: [{ id: 'finding', references: [{ artifactId: reference.artifactId }] }],
                visuals: [
                    { id: 'logs', title: 'Logs Level Distribution', type: 'table', evidenceId: reference.artifactId },
                    { id: 'copy', title: 'Shared source copy', type: 'table', evidenceId: reference.artifactId },
                ],
                evidence: [source.evidence],
                knowledge: [],
            }),
        };
        draft.state.tabs[0].source = source.source;
        draft.state.baseline!.revision = 3;
        let executions = 0;
        let saves = 0;
        const executedConnections: string[] = [];
        await page.route('**/api/actions/execute', async route => {
            const { actionId, input } = route.request().postDataJSON();
            const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
            switch (actionId) {
                case 'connection.list':
                    return ok({ connections: [connection, second] });
                case 'schema.listSchemas':
                    return ok([
                        { value: 'public', label: 'public' },
                        { value: 'analytics', label: 'analytics' },
                    ]);
                case 'schema.listDatabases':
                    return ok({ databases: [{ label: 'main', value: 'main' }] });
                case 'report.workspace.analysis':
                    return ok({ draft, sources: [source] } satisfies ReportAnalysisContext);
                case 'report.workspace.source':
                    return ok({ available: true, tables: [{ name: 'logs', filename: 'main', columns: [] }] });
                case 'schema.describeTable':
                    return ok({ columns: [{ columnName: 'count', columnType: 'BIGINT' }] });
                case 'artifact.get':
                    return ok({ id: input.artifactId, sourceResultSetId: input.artifactId === reference.artifactId ? 'original' : input.artifactId.replace('artifact_', '') });
                case 'resultSet.rows.read':
                    return ok({
                        rows: input.resultSetId === 'original' ? source.evidence.rows : (draft.results[input.resultSetId]?.evidence.rows ?? []),
                        rowCount: 1,
                        dataAvailability: 'full',
                    });
                case 'resultSet.chart.read':
                    return ok({ data: [{ xLabel: 'error', __value__: 200 }], series: [{ key: '__value__', label: 'Count' }] });
                case 'report.workspace.saveDraft': {
                    expect(input.expectedDraftRevision).toBe(draft.revision);
                    draft = {
                        ...draft,
                        revision: draft.revision + 1,
                        state: {
                            ...draft.state,
                            tabs: input.tabs,
                            charts: input.charts,
                            activeTabId: input.activeTabId,
                            proseNeedsReview: input.proseReviewed ? false : draft.state.proseNeedsReview,
                        },
                    };
                    return ok(draft);
                }
                case 'report.workspace.execute': {
                    executions++;
                    executedConnections.push(input.connectionId ?? 'attachment');
                    const sets = [0, 1].map(index => {
                        const resultSetId = `run-${executions}-${index}`;
                        const evidence = {
                            ...source.evidence,
                            artifactId: `artifact_${resultSetId}`,
                            snapshotId: `working_${resultSetId}`,
                            rows: [{ level: 'error', count: 200 + index }],
                            connectionId: input.connectionId ?? null,
                            sql: input.sql,
                        };
                        draft.results[resultSetId] = { tabId: input.tabId, sessionId: `session-${executions}`, sourceArtifactId: input.artifactId, evidence };
                        return { resultSetId, sql: input.sql, columns: source.evidence.columnTypes, rows: evidence.rows, rowCount: 1, limited: false };
                    });
                    return ok({ sessionId: `session-${executions}`, sets });
                }
                case 'report.workspace.apply': {
                    expect(input.expectedDraftRevision).toBe(draft.revision);
                    draft = { ...draft, revision: draft.revision + 1, state: changeReportDraft(draft, input.operation) };
                    return ok(draft);
                }
                case 'report.workspace.saveVersion': {
                    saves++;
                    draft = {
                        ...draft,
                        revision: draft.revision + 1,
                        expectedReportRevision: 3 + saves,
                        state: {
                            ...draft.state,
                            proseNeedsReview: false,
                            baseline: { revision: 3 + saves, title: draft.state.title, content: structuredClone(draft.state.content) },
                        },
                    };
                    return ok({ id: draft.documentId, title: draft.state.title, revision: 3 + saves, content: draft.state.content, draft });
                }
                default:
                    return route.fallback();
            }
        });
        await page.goto('/');
        const organization = new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organization}/reports/${reference.documentId}/workspace/${reference.artifactId}?revision=3&componentId=logs`);
        await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(source.evidence.sql);
        expect(executions).toBe(0);
        await expect(page.getByTestId('report-context-panel').getByRole('button', { name: 'This report summarizes log traffic.', exact: true })).toBeHidden();
        await expect(page.getByTestId('report-context-panel').getByRole('button', { name: 'Errors require investigation.', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(page.getByRole('tab', { name: 'Result 2', exact: true })).toBeVisible();
        expect(reportDraftChanges(draft.state)).toEqual([]);
        await page.getByRole('tab', { name: 'Result 2', exact: true }).click();
        await page.getByRole('button', { name: 'Update Logs Level Distribution', exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'Update location', exact: true })).toContainText('Logs Level Distribution');
        await page.getByRole('button', { name: 'Also update other content…', exact: true }).click();
        await expect(page.getByRole('checkbox', { name: /Shared source copy/ })).not.toBeChecked();
        // The pending operation remains bound to Result 2 even after changing the selected result.
        await page.getByRole('tab', { name: 'Result 1', exact: true }).click();
        await expect(page.getByTestId('report-add-form')).toContainText('Result 2');
        await page.screenshot({ path: testInfo.outputPath(`report-update-${kind}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Update this table', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals[0].evidenceId).toBe('artifact_run-1-1');
        expect(draft.state.content.visuals[1].evidenceId).toBe(reference.artifactId);
        await page.getByRole('tab', { name: /Pending changes/ }).click();
        await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
        await expect.poll(() => draft.state.content.visuals[0].evidenceId).toBe(reference.artifactId);
        await expect(page.getByRole('button', { name: '0 changes', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Result 2', exact: true }).click();
        await page.getByRole('button', { name: 'Update Logs Level Distribution', exact: true }).click();
        await page.getByRole('button', { name: 'Update this table', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals[0].evidenceId).toBe('artifact_run-1-1');

        await page.getByRole('button', { name: 'Duplicate query', exact: true }).click();
        await page.getByRole('combobox', { name: 'Data source', exact: true }).click();
        await page.getByRole('option', { name: 'Other database', exact: true }).click();
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect.poll(() => executions).toBe(2);
        await expect(page.getByRole('tab', { name: 'Result 2', exact: true })).toBeVisible();
        expect(executedConnections[1]).toBe('other-connection');
        await page.getByRole('tab', { name: 'Charts', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeEnabled();
        await page.getByRole('textbox', { name: 'Chart title', exact: true }).fill('Error Trend');
        await page.getByRole('button', { name: 'Save chart', exact: true }).click();
        await expect.poll(() => draft.state.charts?.length).toBe(1);
        await expect(page.getByRole('button', { name: 'Update Logs Level Distribution', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Add chart to report', exact: true }).click();
        await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Error Trend');
        await page.getByRole('button', { name: 'Add chart', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals.length).toBe(3);
        const insertedId = draft.state.content.visuals.at(-1)!.id;
        await page.getByRole('button', { name: 'Content actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Remove from draft', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals.length).toBe(2);
        // Removing an unsaved insertion creates no net change, but its immediate undo restores it.
        expect(reportDraftChanges(draft.state).some(item => item.id === insertedId)).toBe(false);
        await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
        await expect.poll(() => draft.state.content.visuals.some(item => item.id === insertedId)).toBe(true);
        await page.getByRole('button', { name: 'Preview report', exact: true }).click();
        await expect(page.getByRole('dialog').last()).toContainText('Error Trend');
        await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
        await page.getByRole('button', { name: 'Review & Save New Version', exact: true }).click();
        await page.getByRole('checkbox', { name: /I have checked/ }).check();
        await page.getByRole('button', { name: 'Save new version', exact: true }).click();
        await expect.poll(() => saves).toBe(1);
        await expect(page).toHaveURL(/\/workspace\//);
        await expect(page.getByRole('button', { name: '0 changes', exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('button', { name: '0 changes', exact: true })).toBeVisible();
        expect(draft.state.tabs.length).toBe(2);
        expect(draft.state.charts?.length).toBe(1);
        expect(executions).toBe(2);
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(source.evidence.sql);
        await expect(page.getByTestId('report-workspace-result').getByRole('button', { name: '200', exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`report-panel-${kind}.png`), fullPage: true });
        if (kind === 'database') {
            await page.evaluate(() => localStorage.setItem('theme', 'dark'));
            await page.reload();
            await expect(page.locator('html')).toHaveClass(/dark/);
            await expect(page.getByTestId('report-context-panel')).toBeVisible();
            await expect.poll(() => page.evaluate(() => Boolean(window.__DORY_E2E_MONACO__))).toBe(true);
            await page.screenshot({ path: testInfo.outputPath('report-panel-dark.png'), fullPage: true });
            await page.setViewportSize({ width: 900, height: 800 });
            await expect(page.getByRole('dialog').last().getByRole('heading', { name: 'Report', exact: true }).last()).toBeVisible();
            await expect.poll(async () => (await page.getByTestId('report-context-panel').boundingBox())?.x ?? 999).toBeLessThan(565);
            await page.screenshot({ path: testInfo.outputPath('report-panel-narrow.png'), fullPage: true, animations: 'disabled' });
            await page.getByRole('button', { name: 'Collapse report panel', exact: true }).click();
            await expect(page.getByTestId('report-context-panel')).toBeHidden();
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.getByTestId('sql-console-action-rail').getByRole('button', { name: 'Report', exact: true }).click();
        }
        await page.getByTestId('sql-console-action-rail').getByRole('button', { name: 'Report', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Report', exact: true })).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`report-connected-${kind}.png`), fullPage: true });
        await expectAppHealthy(appErrors);
    });
}

test('an empty report opens a workspace without an Artifact and can insert its first table', async ({ page, appErrors }) => {
    const connection = createWorkbenchConnection();
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    let draft: ReportWorkingDraft = {
        id: 'empty-draft',
        userId: 'fixture',
        documentId: 'empty-report',
        baseRevision: 1,
        expectedReportRevision: 1,
        revision: 1,
        results: {},
        state: initialWorkingState('Empty report', { markdown: '', visuals: [], evidence: [], knowledge: [] }),
    };
    const evidence = {
        artifactId: 'artifact_first',
        title: 'First result',
        columns: ['value'],
        columnTypes: [{ name: 'value', type: 'BIGINT' }],
        rows: [{ value: 42 }],
        rowCount: 1,
        truncated: false,
        sql: 'SELECT 42 AS value',
        capturedAt: '2026-11-03T00:00:00Z',
        connectionId: connection.connection.id,
        connectionName: 'Database',
        runId: null,
    };
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        const ok = (data: unknown) => route.fulfill({ json: { ok: true, data } });
        switch (actionId) {
            case 'connection.list':
                return ok({ connections: [connection] });
            case 'schema.listDatabases':
                return ok({ databases: [] });
            case 'report.workspace.analysis':
                expect(input.artifactId).toBe('');
                return ok({ draft, sources: [] });
            case 'report.workspace.source':
                return ok({ available: true, tables: [] });
            case 'report.workspace.saveDraft':
                draft = { ...draft, revision: draft.revision + 1, state: { ...draft.state, tabs: input.tabs, charts: input.charts, activeTabId: input.activeTabId } };
                return ok(draft);
            case 'report.workspace.execute':
                expect(input.connectionId).toBe(connection.connection.id);
                draft.results.first = { sourceArtifactId: '', tabId: input.tabId, sessionId: 'empty-session', evidence };
                return ok({
                    sessionId: 'empty-session',
                    sets: [{ resultSetId: 'first', sql: input.sql, rows: evidence.rows, columns: evidence.columnTypes, rowCount: 1, limited: false }],
                });
            case 'resultSet.rows.read':
                return ok({ rows: evidence.rows, rowCount: 1, dataAvailability: 'full' });
            case 'report.workspace.apply':
                expect(input.operation.anchorId).toBe('root');
                draft = { ...draft, revision: draft.revision + 1, state: changeReportDraft(draft, input.operation) };
                return ok(draft);
            default:
                return route.fallback();
        }
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/empty-report/workspace?revision=1`);
    await page.getByRole('button', { name: 'New query', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(window.__DORY_E2E_MONACO__))).toBe(true);
    await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT 42 AS value'));
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Result 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add table to report', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(draft.state.content.visuals.length).toBe(0);
    await page.getByRole('button', { name: 'Add table to report', exact: true }).click();
    await page.getByRole('button', { name: 'Add table', exact: true }).click();
    await expect.poll(() => draft.state.content.visuals.length).toBe(1);
    expect(draft.state.content.visuals[0].evidenceId).toBe(evidence.artifactId);
    await page.reload();
    await expect(page.getByRole('button', { name: '1 changes', exact: true })).toBeVisible();
    await expectAppHealthy(appErrors);
});
