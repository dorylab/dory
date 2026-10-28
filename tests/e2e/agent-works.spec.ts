import type { AgentWorkSummary } from '../../packages/shared/src/types/agent-work';
import { expect, type Page } from '@playwright/test';

import { test, expectAppHealthy } from './fixtures';
import { mockWorkbenchApis } from './helpers/workbench';

async function chooseOutput(page: Page, title: string) {
    await page.getByRole('combobox', { name: 'Choose an output', exact: true }).click();
    await page.getByRole('option', { name: title, exact: false }).click();
}

const now = '2026-10-26T04:00:00Z';
const document = {
    id: 'report-1',
    chatId: 'work-1',
    title: 'Revenue report',
    revision: 1,
    status: 'ready',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    scope: { connectionIds: [] },
    content: {
        markdown: 'Revenue increased. [Evidence](dory://evidence/private-artifact)\n\n![Trend](dory://visual/trend)',
        knowledge: [],
        visuals: [{ id: 'trend', type: 'chart', title: 'Revenue trend', evidenceId: 'private-artifact', chart: { type: 'bar', xKey: 'month', yKey: 'revenue' } }],
        evidence: [
            {
                artifactId: 'private-artifact',
                title: 'Private SQL',
                connectionId: 'private-connection',
                connectionName: 'Private database',
                sql: 'SELECT private_secret',
                capturedAt: now,
                runId: 'private-run',
                columns: ['month', 'revenue'],
                rows: [{ month: 'October', revenue: 42 }],
                rowCount: 1,
                truncated: false,
            },
        ],
    },
};

async function setupWorks(page: Page, availability = 'full') {
    await mockWorkbenchApis(page, { initialConnections: [] });
    let works: AgentWorkSummary[] = [
        {
            id: 'work-1',
            title: 'Monthly revenue analysis',
            titlePending: false,
            status: 'completed',
            updatedAt: now,
            counts: { report: 1, chart: 2, result: 1 },
            outputs: [
                { id: 'report-1', title: 'Revenue report', type: 'report', available: true, origin: { kind: 'report', documentId: 'report-1' } },
                { id: 'report-1:trend', title: 'Revenue trend', type: 'chart', available: true, origin: { kind: 'report', documentId: 'report-1', visualId: 'trend' } },
                { id: 'chart-1', title: 'Saved chat chart', type: 'chart', available: true, origin: { kind: 'message', messageId: 'answer', toolCallId: 'chart-call' } },
                { id: 'result-1', title: 'Order anomaly results', type: 'result', available: true, origin: { kind: 'artifact', artifactId: 'result-1' } },
                { id: 'draft', title: 'Draft report', type: 'report', available: false, origin: { kind: 'report', documentId: 'draft' } },
            ],
        },
        { id: 'work-2', title: 'Retention analysis', titlePending: false, status: 'idle', updatedAt: now, counts: { report: 0, chart: 0, result: 0 }, outputs: [] },
    ];
    const chart = {
        type: 'chart',
        title: 'Saved chat chart',
        chartType: 'bar',
        xKey: 'month',
        yKeys: [{ key: 'revenue' }],
        dataState: 'ready',
        data: [{ month: 'October', revenue: 42 }],
    };
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [],
                models: [],
                works,
                sessions: works.map(work => ({ id: work.id, title: work.title, type: 'global', connectionId: null, scope: { connectionIds: [] }, createdAt: now, updatedAt: now })),
            },
        }),
    );
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [document] } }));
    await page.route('**/api/work-documents/report-1', route => route.fulfill({ json: { document, versions: [] } }));
    await page.route('**/api/chat/session/*', async route => {
        const id = route.request().url().split('/').pop();
        if (route.request().method() === 'PATCH') {
            works = works.map(work => (work.id === id ? { ...work, title: route.request().postDataJSON().title } : work));
            return route.fulfill({ json: { code: 0, data: {} } });
        }
        if (route.request().method() === 'DELETE') {
            works = works.filter(work => work.id !== id);
            return route.fulfill({ json: { code: 0, data: {} } });
        }
        return route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id, type: 'global' },
                    messages:
                        id === 'work-1'
                            ? [
                                  {
                                      id: 'answer',
                                      role: 'assistant',
                                      parts: [
                                          { type: 'text', text: 'Analysis saved.' },
                                          { type: 'tool-chartBuilder', toolCallId: 'chart-call', state: 'output-available', input: {}, output: chart },
                                      ],
                                  },
                              ]
                            : [],
                },
            },
        });
    });
    await page.route('**/api/actions/execute', async route => {
        const request = route.request().postDataJSON();
        if (request.actionId === 'artifact.get')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        id: 'result-1',
                        title: 'Order anomaly results',
                        type: 'result_set',
                        status: 'ready',
                        sourceResultSetId: 'rs-1',
                        expiresAt: null,
                        resultSet: { columns: [{ name: '名称' }, { name: 'amount' }], sql: 'SELECT private_secret' },
                    },
                },
            });
        if (request.actionId === 'resultSet.rows.read')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        resultSetId: 'rs-1',
                        rows: [
                            { 名称: '中文,"一"\n二', amount: 42 },
                            { 名称: 'Two', amount: 8 },
                        ],
                        columns: [{ name: '名称' }, { name: 'amount' }],
                        rowCount: availability === 'full' ? 2 : 100,
                        dataAvailability: availability,
                    },
                },
            });
        await route.fallback();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=work-1`, { waitUntil: 'domcontentloaded' });
    return {
        addOutput: (output: AgentWorkSummary['outputs'][number]) => {
            works = works.map(work =>
                work.id === 'work-1' ? { ...work, outputs: [...work.outputs, output], counts: { ...work.counts, [output.type]: work.counts[output.type] + 1 } } : work,
            );
        },
        setStatus: (status: AgentWorkSummary['status']) => {
            works = works.map(work => (work.id === 'work-1' ? { ...work, status } : work));
        },
    };
}

async function downloadText(page: Page) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export file|Export preview data/, exact: true }).click();
    const download = await waiting;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    return { download, bytes: Buffer.concat(chunks) };
}

test('a running Work keeps its controls available and continues when switching Works', async ({ page }) => {
    await setupWorks(page);
    await page.evaluate(() => {
        const original = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (!new URL(url, location.origin).pathname.endsWith('/api/chat') || init?.method !== 'POST') return original(input, init);
            const encoder = new TextEncoder();
            return new Response(
                new ReadableStream({
                    start(controller) {
                        const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                        send({ type: 'start', messageId: 'running-answer' });
                        send({ type: 'text-start', id: 'answer-text' });
                        send({ type: 'text-delta', id: 'answer-text', delta: 'Still working.' });
                        (window as unknown as { finishWork: () => void }).finishWork = () => {
                            send({ type: 'text-delta', id: 'answer-text', delta: ' Finished.' });
                            send({ type: 'text-end', id: 'answer-text' });
                            send({ type: 'finish', finishReason: 'stop' });
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
                        };
                    },
                }),
                { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } },
            );
        };
    });
    const composer = page.getByTestId('agent-composer');
    await composer.getByRole('textbox').fill('Analyze revenue');
    await composer.getByRole('textbox').press('Enter');
    await expect(page.getByText('Still working.')).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Add' })).toBeEnabled();
    await composer.getByRole('textbox').fill('Draft follow-up');
    await expect(page.getByTestId('work-header').getByRole('button', { name: 'Share' })).toBeEnabled();
    const sidebar = page.getByRole('complementary', { name: 'Works' });
    await sidebar.getByRole('button', { name: /Retention analysis/ }).click();
    await expect(page.getByTestId('work-header')).toContainText('Retention analysis');
    await sidebar.getByRole('button', { name: /Monthly revenue analysis/ }).click();
    await expect(page.getByText('Still working.')).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.evaluate(() => (window as unknown as { finishWork: () => void }).finishWork());
    await expect(page.getByText('Still working. Finished.')).toBeVisible();
});

test('Works shows status and outputs, searches output names, and shares a report without source metadata', async ({ page, appErrors }) => {
    await setupWorks(page);
    const header = page.getByTestId('work-header');
    await expect(header.getByRole('heading', { name: 'Monthly revenue analysis' })).toBeVisible();
    await expect(header).toContainText('Completed');
    await expect(header).toContainText('2 Charts');
    await page.getByPlaceholder('Search works and outputs…').fill('anomaly');
    const sidebar = page.getByRole('complementary', { name: 'Works' });
    await expect(sidebar).toContainText('Order anomaly results');
    await expect(sidebar.getByText('Retention analysis')).toHaveCount(0);
    await sidebar.getByRole('button', { name: /Monthly revenue analysis/ }).click();
    await header.getByRole('button', { name: 'Share', exact: true }).click();
    await chooseOutput(page, 'Revenue report');
    await expect(page.getByTestId('work-share-preview').locator('iframe').contentFrame().getByRole('heading', { name: 'Revenue report' })).toBeVisible();
    const { download, bytes } = await downloadText(page);
    expect(download.suggestedFilename()).toBe('Revenue report.html');
    expect(bytes.toString()).toContain('Revenue increased.');
    expect(bytes.toString()).toContain('<svg');
    expect(bytes.toString()).not.toMatch(/Private database|private-|SELECT|dory:\/\//);
    await chooseOutput(page, 'Choose an output');
    await expect(page.getByTestId('work-share-preview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await header.getByRole('button', { name: 'Share', exact: true }).click();
    await chooseOutput(page, 'Draft report');
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeDisabled();
    await expect(page.getByText('This output is a draft', { exact: false })).toBeVisible();
    await expectAppHealthy(appErrors);
});

for (const availability of ['full', 'preview-only'])
    test(`Share exports ${availability} CSV with explicit row scope`, async ({ page, appErrors }) => {
        await setupWorks(page, availability);
        await page.getByTestId('work-header').getByRole('button', { name: 'Share', exact: true }).click();
        await chooseOutput(page, 'Order anomaly results');
        await expect(page.getByTestId('work-share-preview')).toContainText(availability === 'full' ? 'Full saved data · 2 rows' : 'Preview data · 2 saved rows');
        const { download, bytes } = await downloadText(page);
        expect(download.suggestedFilename()).toBe(`Order anomaly results-2-rows${availability === 'full' ? '' : '-preview'}.csv`);
        expect(bytes.toString()).toContain('"中文,""一""\n二","42"');
        expect(bytes.toString()).not.toContain('SELECT');
        await expectAppHealthy(appErrors);
    });

test('Share exports persisted report and chat charts as PNG and works on mobile in dark theme', async ({ page, appErrors }, testInfo) => {
    await setupWorks(page);
    await expect(page.getByText('Analysis saved.', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('works-light-desktop.png'), animations: 'disabled', fullPage: true });
    await page.getByTestId('work-header').getByRole('button', { name: 'Share', exact: true }).click();
    for (const [id, title] of [
        ['report-1:trend', 'Revenue trend'],
        ['chart-1', 'Saved chat chart'],
    ]) {
        await chooseOutput(page, title);
        await expect(page.getByTestId('work-share-preview').locator('svg').first()).toBeVisible();
        const { download, bytes } = await downloadText(page);
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(bytes.readUInt32BE(16)).toBeGreaterThan(100);
        expect(bytes.readUInt32BE(20)).toBeGreaterThan(100);
        await download.saveAs(testInfo.outputPath(id === 'chart-1' ? 'shared-chat-chart.png' : 'shared-report-chart.png'));
    }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByTestId('work-header')).toBeVisible();
    await page.getByRole('button', { name: 'Works', exact: true }).click();
    await expect(page.getByPlaceholder('Search works and outputs…').last()).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('works-dark-mobile.png'), animations: 'disabled', fullPage: true });
    await expectAppHealthy(appErrors);
});

test('Header actions rename and delete a work, and statuses refresh across visits', async ({ page, appErrors }) => {
    const state = await setupWorks(page);
    const header = page.getByTestId('work-header');
    for (const [status, label] of [
        ['running', 'Running'],
        ['stopped', 'Stopped'],
        ['failed', 'Failed'],
        ['completed', 'Completed'],
    ] as const) {
        state.setStatus(status);
        await page.reload();
        await expect(header).toContainText(label);
    }
    await header.getByRole('button', { name: 'Work actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename work' }).click();
    await page.getByRole('textbox', { name: 'Work title' }).fill('Reviewed revenue analysis');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(header.getByRole('heading', { name: 'Reviewed revenue analysis' })).toBeVisible();
    await header.getByRole('button', { name: 'Work actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete work' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete work', exact: true }).click();
    await expect(header.getByRole('heading', { name: 'New Work' })).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('CSV export includes every saved page without rerunning the query', async ({ page, appErrors }) => {
    await setupWorks(page);
    const offsets: number[] = [];
    await page.route('**/api/actions/execute', async route => {
        const request = route.request().postDataJSON();
        if (request.actionId !== 'resultSet.rows.read') return route.fallback();
        const offset = request.input.offset;
        offsets.push(offset);
        const count = offset === 0 ? 5000 : 1;
        await route.fulfill({
            json: {
                ok: true,
                data: { rows: Array.from({ length: count }, (_, index) => ({ index: offset + index })), columns: [{ name: 'index' }], rowCount: 5001, dataAvailability: 'full' },
            },
        });
    });
    await page.getByTestId('work-header').getByRole('button', { name: 'Share', exact: true }).click();
    await chooseOutput(page, 'Order anomaly results');
    await expect(page.getByTestId('work-share-preview')).toContainText('Full saved data · 5,001 rows');
    const { bytes } = await downloadText(page);
    expect(offsets).toEqual([0, 5000]);
    expect(bytes.toString().split('\r\n')).toHaveLength(5002);
    expect(bytes.toString()).toContain('"5000"');
    await expectAppHealthy(appErrors);
});

test('Share retries failed reads and protects unsaved report edits', async ({ page, appErrors }) => {
    await setupWorks(page);
    let reads = 0;
    await page.route('**/api/work-documents/report-1', route => {
        if (route.request().method() === 'PATCH') return route.fulfill({ status: 409, json: { error: 'Save unavailable for this test' } });
        reads++;
        return reads === 1 ? route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }) : route.fulfill({ json: { document, versions: [] } });
    });
    const header = page.getByTestId('work-header');
    await header.getByRole('button', { name: 'Share', exact: true }).click();
    await chooseOutput(page, 'Revenue report');
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('work-share-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await header.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page
        .getByTestId('agent-resources')
        .getByRole('button', { name: /Revenue report/ })
        .click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).first().fill('Unsaved revenue review');
    await header.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('work-share-dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Title', exact: true }).first()).toHaveValue('Unsaved revenue review');
    await expectAppHealthy(appErrors);
});

for (const chartType of ['bar', 'heatmap'])
    test(`Share exports a saved ${chartType} Artifact chart from the saved result data`, async ({ page, appErrors }, testInfo) => {
        const state = await setupWorks(page);
        state.addOutput({ id: 'saved-chart', type: 'chart', title: 'Saved order chart', available: true, origin: { kind: 'artifact', artifactId: 'saved-chart' } });
        await page.route('**/api/actions/execute', async route => {
            if (route.request().postDataJSON().actionId !== 'artifact.get') return route.fallback();
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        id: 'saved-chart',
                        type: 'chart',
                        title: 'Saved order chart',
                        status: 'ready',
                        sourceResultSetId: 'rs-1',
                        expiresAt: null,
                        chartState: { chartType, xKey: '名称', yKey: 'count', groupKey: chartType === 'heatmap' ? 'amount' : '__none__' },
                    },
                },
            });
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByTestId('work-header').getByRole('button', { name: 'Share', exact: true }).click();
        await chooseOutput(page, 'Saved order chart');
        const preview = page.getByTestId('work-share-preview');
        await expect(preview.locator(chartType === 'heatmap' ? '[style*="grid-template-columns"]' : 'svg.recharts-surface')).toBeVisible();
        await expect(preview.getByRole('button', { name: 'Chart settings' })).toHaveCount(0);
        const { download, bytes } = await downloadText(page);
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        await download.saveAs(testInfo.outputPath(`shared-artifact-${chartType}.png`));
        await expectAppHealthy(appErrors);
    });
