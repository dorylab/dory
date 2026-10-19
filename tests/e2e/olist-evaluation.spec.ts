import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect } from '@playwright/test';

import { updateOlistReport } from '../../apps/web/scripts/olist/report';
import { getAgentRunSummary } from '../../apps/web/lib/agent-runs/summary';
import { expectAppHealthy, test } from './fixtures';

const directory = path.resolve(process.env.DORY_OLIST_DATA_DIR ?? 'apps/web/localdata/olist-evaluation');
test.skip(process.env.E2E_OLIST_EVALUATION !== '1', 'Explicitly seed and run Olist MCP/Agent acceptance before this live, unmocked test.');

test('Olist Knowledge, exact Run contexts, persisted SQL and Artifact links are visible', async ({ page, appErrors }) => {
    test.setTimeout(240000);
    const checks: Array<{ workId?: string; status: string; error?: string }> = [];
    try {
        const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as {
            organizationId: string;
            organizationSlug: string;
            connectionId: string;
            knowledgeModelId: string;
            modelRevision: string;
        };
        const reports = await Promise.all(
            ['mcp', 'agent'].map(
                async mode =>
                    JSON.parse(await readFile(path.join(directory, `${mode}-results.json`), 'utf8')) as {
                        ok: boolean;
                        results: Array<{ scenarioId: string; status: string; workId: string; sql: string[]; evidenceArtifactIds: string[] }>;
                    },
            ),
        );
        for (const report of reports) expect(report.ok).toBe(true);
        expect(reports[0].results).toHaveLength(6);
        expect(reports[1].results).toHaveLength(7);
        const organization = manifest.organizationSlug;
        await page.goto(`/${organization}/knowledge`);
        await page.getByText('Olist Commerce Knowledge', { exact: true }).click();
        await expect(page.getByText(/Apache Ossie 0\.1\.1/)).toBeVisible();
        await expect(page.getByText(new RegExp(manifest.modelRevision.slice(0, 8)))).toBeVisible();
        await page.getByRole('tab', { name: /Definitions|定义/i }).click();
        await expect(page.getByText('merchandise_amount', { exact: true })).toBeVisible();
        await expect(page.getByText('payments_order', { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(directory, 'knowledge.png'), fullPage: true });
        for (const result of reports.flatMap(r => r.results)) {
            expect(result.status).toBe('passed');
            const snapshotResponse = await page.request.get(`/api/works/${result.workId}/snapshot`);
            expect(snapshotResponse.ok()).toBe(true);
            const response = await snapshotResponse.json();
            const snapshot = response.data.snapshot;
            expect(snapshot.work.status).toBe('completed');
            expect(snapshot.work.connectionId).toBe(manifest.connectionId);
            for (const sql of result.sql) expect(snapshot.sessions.some((s: { session: { sqlText: string } }) => s.session.sqlText === sql)).toBe(true);
            expect(response.data.events.some((e: { toolName: string }) => e.toolName === 'semantic_model_context')).toBe(true);
            await page.goto(`/${organization}/agent-runs/${result.workId}`);
            await expect(page.getByText('Olist Commerce Knowledge', { exact: true }).first()).toBeVisible();
            await expect(page.getByText(/Ossie 0\.1\.1/).first()).toBeVisible();
            await expect(page.getByText(new RegExp(manifest.modelRevision.slice(0, 8))).first()).toBeVisible();
            const modelLink = page.locator(`a[href*="knowledge"][href*="${manifest.knowledgeModelId}"]`).first();
            await expect(modelLink).toBeVisible();
            if (result.evidenceArtifactIds.length) {
                await expect(page.getByTestId('agent-run-evidence').first()).toBeVisible();
                for (const artifactId of result.evidenceArtifactIds) {
                    const link = page.locator(`a[href*="/artifacts/${artifactId}"]`).first();
                    await expect(link).toBeVisible();
                }
            } else {
                expect(getAgentRunSummary(snapshot.work.metadata)?.findings ?? []).toEqual([]);
                // Schema-inspection SQL can leave unlinked results without creating Findings.
                await expect(page.getByText(/No findings|暂无结论/i).first()).toBeVisible();
            }
            if (result.scenarioId === 'monthly' || result.scenarioId === 'unavailable')
                await page.screenshot({ path: path.join(directory, `run-${result.workId}.png`), fullPage: true });
            if (result.evidenceArtifactIds[0]) {
                await page.locator(`a[href*="/artifacts/${result.evidenceArtifactIds[0]}"]`).first().click();
                await expect(page).toHaveURL(new RegExp(`/artifacts/${result.evidenceArtifactIds[0]}`));
                await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
            }
            checks.push({ workId: result.workId, status: 'passed' });
        }
        await expectAppHealthy(appErrors);
        await writeFile(path.join(directory, 'ui-results.json'), JSON.stringify({ ok: true, runtime: 'web', checks }, null, 2) + '\n');
    } catch (error) {
        checks.push({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
        await writeFile(path.join(directory, 'ui-results.json'), JSON.stringify({ ok: false, runtime: 'web', checks }, null, 2) + '\n');
        throw error;
    } finally {
        await updateOlistReport(directory);
    }
});
