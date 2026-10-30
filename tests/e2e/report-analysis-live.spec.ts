import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect } from '@playwright/test';
import { test, expectAppHealthy } from './fixtures';

test.use({ actionTimeout: 15000 });

// Uses the real action router, metadata DB, SQLite driver and result store. No route mocks.
test('real report analysis edits, runs, applies, refreshes and saves an immutable version', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(240000);
    const directory = path.resolve('apps/web/.tmp/report-analysis-fixtures');
    fs.mkdirSync(directory, { recursive: true });
    const filename = path.join(directory, `customers-${Date.now()}.sqlite`);
    const sqlite = new Database(filename);
    sqlite.exec('CREATE TABLE customers (id INTEGER, active INTEGER); INSERT INTO customers VALUES (1,1),(2,1),(3,0);');
    sqlite.close();
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    const fixture = await page.evaluate(
        async ({ organization, filename }) => {
            const action = async (actionId: string, input: unknown) => {
                const response = await fetch('/api/actions/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ actionId, input, organizationId: organization }),
                });
                const body = await response.json();
                if (!body.ok) throw new Error(`${actionId}: ${JSON.stringify(body)}`);
                return body.data;
            };
            const connection = await action('connection.create', {
                payload: {
                    connection: {
                        type: 'sqlite',
                        engine: 'sqlite',
                        name: `Report analysis ${Date.now()}`,
                        host: null,
                        port: null,
                        database: 'main',
                        path: filename,
                        status: 'Connected',
                        environment: 'test',
                        tags: 'blue',
                    },
                    identities: [],
                    ssh: null,
                },
            });
            const connectionId = connection.connection.id;
            const first = await action('query.execute', {
                connectionId,
                database: 'main',
                sql: 'SELECT COUNT(*) AS count FROM customers',
                sessionId: crypto.randomUUID(),
                source: 'sql-console',
                limit: 1000,
            });
            const connection2 = await action('connection.create', {
                payload: { connection: { ...connection.connection, id: undefined, name: `Activity source ${Date.now()}`, path: filename }, identities: [], ssh: null },
            });
            const second = await action('query.execute', {
                connectionId: connection2.connection.id,
                database: 'main',
                sql: 'SELECT active, COUNT(*) AS count FROM customers GROUP BY active',
                sessionId: crypto.randomUUID(),
                source: 'sql-console',
                limit: 1000,
            });
            const artifactId = `artifact_${first.queryResultSets[0].resultSetId}`;
            const groupArtifactId = `artifact_${second.queryResultSets[0].resultSetId}`;
            const report = await action('report.create', {
                requestId: crypto.randomUUID(),
                title: 'Live customer analysis',
                body: '# Customers\n\nThere are three customers.\n\n<Metric source="metric" />\n\n<DataTable source="table" />\n\n<Chart source="chart" />',
                scope: { connectionMode: 'manual', connectionIds: [connectionId, connection2.connection.id], knowledgeMode: 'auto', knowledgeModelId: null },
                visuals: [
                    { id: 'metric', title: 'Customer count', type: 'metric', evidenceId: artifactId, metric: { column: 'count', rowIndex: 0 } },
                    { id: 'table', title: 'Customer total', type: 'table', evidenceId: artifactId },
                    { id: 'chart', title: 'Activity', type: 'chart', evidenceId: groupArtifactId, chart: { type: 'bar', xKey: 'active', yKey: 'count' } },
                ],
            });
            return {
                reference: {
                    documentId: report.document.id,
                    artifactId,
                    revision: report.document.revision,
                    snapshotId: report.document.content.evidence.find((e: { artifactId: string }) => e.artifactId === artifactId).snapshotId,
                },
                groupArtifactId,
                countTitle: report.document.content.evidence.find((e: { artifactId: string }) => e.artifactId === artifactId).title,
                groupTitle: report.document.content.evidence.find((e: { artifactId: string }) => e.artifactId === groupArtifactId).title,
            };
        },
        { organization, filename },
    );
    let executed = 0;
    page.on('request', request => {
        if (request.url().includes('/api/actions/execute') && request.postDataJSON()?.actionId === 'report.workspace.execute') executed++;
    });
    const ref = fixture.reference;
    await page.goto(`/${organization}/reports/${ref.documentId}/workspace/${ref.artifactId}?revision=${ref.revision}&snapshot=${ref.snapshotId}`);
    const workspace = page.getByTestId('report-workspace');
    await expect(workspace).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
    expect(executed).toBe(0);
    await page.getByRole('tab', { name: fixture.groupTitle }).click();
    await expect(page.getByRole('complementary', { name: 'Data source' })).toContainText('Activity source');
    await page.getByRole('tab', { name: fixture.countTitle }).click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toContain('COUNT(*)');
    await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT COUNT(*) AS count FROM customers WHERE active = 1'));
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('report-workspace-result').getByText('2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply to report', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Customer count', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Customer total', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply to report', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Applied to draft', exact: true })).toBeVisible();
    await expect(page.getByText('Missing report snapshot.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Report preview', exact: true }).getByText('2', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save new version', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Duplicate query', exact: true }).click();
    const copy = page.getByRole('tab', { name: `${fixture.countTitle} (copy)` });
    await expect(copy).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('combobox', { name: 'Move component to this query', exact: true }).click();
    await page.getByRole('option', { name: 'Customer total', exact: true }).click();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Report preview', exact: true }).locator('[data-visual="table"]').getByText('2', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toContain('WHERE active');
    await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT 4 AS count'));
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('report-workspace-result').getByText('4', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply to report', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Customer count', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByText('Customer total', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply to report', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Report preview', exact: true }).getByText('4', { exact: true })).toBeVisible();
    await copy.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click();
    await expect(copy).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Report preview', exact: true }).getByText('4', { exact: true })).toBeVisible();
    await page.getByRole('region', { name: 'Report preview', exact: true }).getByRole('button', { name: 'View query and results', exact: true }).nth(1).click();
    await expect(copy).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'I have reviewed the text', exact: true }).click();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toContain('WHERE active');
    await expect(page.getByRole('tab', { name: 'Applied to draft', exact: true })).toBeVisible();
    expect(executed).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('report-analysis-workspace.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save new version', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save new version', exact: true }).click();
    await expect(page).toHaveURL(/publication=/);
    await expect(page.getByTestId('work-report')).toBeVisible();
    const versions = await page.evaluate(
        async ({ organization, ref }) => {
            const action = async (input: unknown) => {
                const response = await fetch('/api/actions/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organizationId: organization, actionId: 'report.get', input }),
                });
                return (await response.json()).data.document;
            };
            return { old: await action({ documentId: ref.documentId, revision: ref.revision }), latest: await action({ documentId: ref.documentId }) };
        },
        { organization, ref },
    );
    expect(versions.old.content.evidence.find((e: { artifactId: string }) => e.artifactId === ref.artifactId).rows[0].count).toBe('3');
    expect(versions.latest.content.evidence.some((e: { rows: { count: number }[] }) => e.rows.length === 1 && Number(e.rows[0].count) === 2)).toBe(true);
    expect(versions.latest.content.body).toContain('There are three customers.');
    expect(versions.latest.content.workspaceOrigin.baseRevision).toBe(ref.revision);
    await page.screenshot({ path: testInfo.outputPath('saved-analysis-report.png'), fullPage: true });
    await expectAppHealthy(appErrors);
});
