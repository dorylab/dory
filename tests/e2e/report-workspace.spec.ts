import type { ReportAnalysisContext, ReportWorkingDraft, ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import { expect, type Page, type Locator } from '@playwright/test';
import { sameChartSpec } from '../../apps/web/lib/work-documents/workspace-presentation';
import { workspaceChartSpecSchema } from '../../apps/web/lib/work-documents/schema';

import { changeReportDraft, initialWorkingState, reportDraftChanges } from '../../apps/web/lib/work-documents/working-draft';
import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

async function dragTo(page: Page, handle: Locator, target: Locator) {
    const start = (await handle.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 4 });
    await target.scrollIntoViewIfNeeded();
    const end = (await target.boundingBox())!;
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
    await page.mouse.up();
}

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
                    for (const visual of input.visuals) {
                        const previous = draft.state.content.visuals.find(item => item.id === visual.id);
                        expect(sameChartSpec(visual.chartSpec ? workspaceChartSpecSchema.parse(visual.chartSpec) : undefined, previous?.chartSpec)).toBe(true);
                    }
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
        const canvas = page.getByTestId('report-canvas');
        await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toBeVisible();
        await expect(canvas.getByText('This report summarizes log traffic.', { exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Report structure', exact: true })).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(source.evidence.sql);
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await page.getByRole('tab', { name: 'Result 2', exact: true }).click();
        expect(reportDraftChanges(draft.state)).toEqual([]);
        await page.getByRole('button', { name: 'Drag result or chart to report', exact: true }).focus();
        await page.keyboard.press('Space');
        await expect(canvas.getByRole('button', { name: 'Cancel placement', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(canvas.getByRole('button', { name: 'Cancel placement', exact: true })).toBeHidden();
        expect(reportDraftChanges(draft.state)).toEqual([]);
        await page.getByRole('button', { name: 'Place in report', exact: true }).click();
        // The placement owns Result 2, independent of the newly selected result.
        await page.getByRole('tab', { name: 'Result 1', exact: true }).click();
        await page.locator('[data-canvas-block="logs"]').getByRole('button', { name: 'Update this table', exact: true }).click();
        const confirmation = page.getByRole('dialog').last();
        await expect(confirmation).toContainText('Result 2');
        expect(draft.state.content.visuals[0].evidenceId).toBe(reference.artifactId);
        await confirmation.getByRole('button', { name: 'Update this table', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals[0].evidenceId).toBe('artifact_run-1-1');
        expect(draft.state.content.visuals[1].evidenceId).toBe(reference.artifactId);
        await canvas.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals[0].evidenceId).toBe(reference.artifactId);
        await expect(page.getByRole('button', { name: '0 changes', exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Duplicate query', exact: true }).click();
        await page.getByRole('combobox', { name: 'Data source', exact: true }).click();
        await page.getByRole('option', { name: 'Other database', exact: true }).click();
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect.poll(() => executions).toBe(2);
        await page.getByRole('tab', { name: 'Charts', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeEnabled();
        await page.getByRole('textbox', { name: 'Chart title', exact: true }).fill('Error Trend');
        // No Save chart step is required. Dragging freezes the current valid spec.
        await dragTo(page, page.getByRole('button', { name: 'Drag result or chart to report', exact: true }), page.locator('[data-drop-gap="before:copy"]'));
        await expect.poll(() => draft.state.content.visuals.length).toBe(3);
        const added = draft.state.content.visuals.find(item => item.title === 'Error Trend')!;
        expect(draft.state.content.body!.indexOf(`source="${added.id}"`)).toBeLessThan(draft.state.content.body!.indexOf('source="copy"'));
        const block = page.locator(`[data-canvas-block="${added.id}"]`);
        await expect(block.locator('.recharts-wrapper')).toBeVisible();
        await block.hover();
        await block.getByRole('button', { name: 'Content actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Edit title', exact: true }).click();
        await block.getByRole('textbox', { name: 'Title', exact: true }).fill('Error Trend revised');
        await block.getByRole('button', { name: 'Save title', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals.find(item => item.id === added.id)?.title).toBe('Error Trend revised');
        await block.hover();
        await dragTo(page, block.getByRole('button', { name: 'Move Error Trend revised', exact: true }), page.locator('[data-drop-gap="end"]'));
        await expect.poll(() => draft.state.content.body!.indexOf(`source="${added.id}"`) > draft.state.content.body!.indexOf('source="copy"')).toBe(true);
        await block.hover();
        await block.getByRole('button', { name: 'Content actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Remove from draft', exact: true }).click();
        await expect.poll(() => draft.state.content.visuals.length).toBe(2);
        expect(reportDraftChanges(draft.state)).toEqual([]);
        await canvas.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(block).toBeVisible();
        await page.getByRole('button', { name: 'Save chart', exact: true }).click();
        await expect.poll(() => draft.state.charts?.length).toBe(1);
        expect(draft.state.content.visuals.find(item => item.id === added.id)?.chartSpec).toEqual(added.chartSpec);
        await page.getByRole('button', { name: 'Review & Save New Version', exact: true }).click();
        await page.getByRole('checkbox', { name: /I have checked/ }).check();
        await page.getByRole('button', { name: 'Save new version', exact: true }).click();
        await expect.poll(() => saves).toBe(1);
        await page.reload();
        await expect(page.getByRole('button', { name: '0 changes', exact: true })).toBeVisible();
        await expect(block).toBeVisible();
        expect(draft.state.tabs.length).toBe(2);
        expect(draft.state.charts?.length).toBe(1);
        expect(executedConnections[1]).toBe('other-connection');
        await expect(canvas.locator('.report-prose > p').first()).toHaveCSS('margin-top', '0px');
        await page.screenshot({ path: testInfo.outputPath(`report-canvas-${kind}.png`), fullPage: true });
        if (kind === 'database') {
            await page.evaluate(() => localStorage.setItem('theme', 'dark'));
            await page.reload();
            await expect(page.locator('html')).toHaveClass(/dark/);
            await expect(canvas).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath('report-canvas-dark.png'), fullPage: true });
            await page.setViewportSize({ width: 900, height: 800 });
            await expect.poll(async () => (await canvas.boundingBox())?.x ?? 999).toBeLessThan(450);
            await page.screenshot({ path: testInfo.outputPath('report-canvas-narrow.png'), fullPage: true, animations: 'disabled' });
            await page.getByRole('button', { name: 'Collapse report panel', exact: true }).click();
            await expect(canvas).toBeHidden();
        }
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
    let failNextApply = true;
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
                if (failNextApply) {
                    failNextApply = false;
                    return route.fulfill({ status: 409, json: { ok: false, message: 'Temporary storage failure. Retry.' } });
                }
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
    await page.getByRole('button', { name: 'Place in report', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
    expect(draft.state.content.visuals.length).toBe(0);
    await page.getByRole('button', { name: 'Place in report', exact: true }).click();
    await page.getByRole('button', { name: 'Insert here', exact: true }).click();
    await expect(page.getByTestId('report-canvas').getByRole('alert')).toContainText('Temporary storage failure');
    expect(draft.state.content.visuals.length).toBe(0);
    await expect(page.getByRole('button', { name: 'Insert here', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Insert here', exact: true }).click();
    await expect.poll(() => draft.state.content.visuals.length).toBe(1);
    expect(draft.state.content.visuals[0].evidenceId).toBe(evidence.artifactId);
    await page.reload();
    await expect(page.getByRole('button', { name: '1 changes', exact: true })).toBeVisible();
    await expectAppHealthy(appErrors);
});
