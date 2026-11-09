import { expect, type Page } from '@playwright/test';

import { reportEmbeds } from '../../apps/web/lib/work-documents/report-core';
import type { AgentWorkSummary } from '../../packages/shared/src/types/agent-work';
import { expectAppHealthy, test } from './fixtures';
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

test('chat charts sort periods, expose data and sources, persist edits and export in both themes', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(120_000);
    await setupWorks(page);
    const output = {
        type: 'chart',
        chartType: 'bar',
        title: 'Annual performance',
        description: 'Complete fiscal years · test data',
        dataState: 'ready',
        xKey: 'year',
        yKeys: [
            { key: 'revenue', label: 'Revenue' },
            { key: 'profit', label: 'Profit' },
        ],
        options: { xKeyType: 'time', valueFormat: { scale: 100000000, precision: 2, suffix: '亿元' } },
        source: { artifactId: 'result-1', rowCount: 3, truncated: false },
        data: [
            { year: 2026, revenue: 120000000000, profit: -2000000000 },
            { year: 2024, revenue: 100000000000, profit: null },
            { year: 2025, revenue: 110000000000, profit: 3000000000 },
        ],
    };
    let entry: { version: number; presentation: Record<string, unknown> | null } = { version: 0, presentation: null };
    let rejectSave = true;
    await page.route('**/api/chat/session/work-1', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'work-1', type: 'global' },
                    messages: [
                        {
                            id: 'answer',
                            role: 'assistant',
                            metadata: { responseStatus: 'completed', chartOverrides: { 'chart-call': entry } },
                            parts: [
                                { type: 'text', text: 'The latest complete fiscal years show a revenue increase.' },
                                { type: 'tool-chartBuilder', toolCallId: 'chart-call', state: 'output-available', input: {}, output },
                            ],
                        },
                    ],
                },
            },
        }),
    );
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        if (body.actionId !== 'chat.chart.update') return route.fallback();
        expect(body.input.expectedVersion).toBe(entry.version);
        expect(body.input).not.toHaveProperty('data');
        if (rejectSave) {
            rejectSave = false;
            return route.fulfill({ status: 409, json: { ok: false, message: 'Save unavailable; your draft is preserved.' } });
        }
        entry = { version: entry.version + 1, presentation: body.input.presentation };
        return route.fulfill({ json: { ok: true, data: entry } });
    });
    await page.reload();
    let card = page.getByRole('region', { name: 'Annual performance', exact: true });
    await expect(card.getByRole('heading', { name: 'Annual performance' })).toBeVisible();
    await expect(card.locator('svg text').filter({ hasText: /^202[456]$/ })).toHaveText(['2024', '2025', '2026']);
    await card.getByRole('button', { name: 'Profit', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Profit', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await card.getByRole('button', { name: 'Profit', exact: true }).click();
    await card.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(card.locator('tbody tr').first()).toContainText('2024');
    await expect(card.locator('tbody tr').first()).toContainText('—');
    await expect(card.locator('tbody tr').last()).toContainText('-20.00亿元');
    const csvPending = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download CSV' }).click();
    const csv = await csvPending;
    await csv.saveAs(testInfo.outputPath('chart-data.csv'));
    await card.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(card.locator('pre')).toContainText('SELECT private_secret');
    await card.getByRole('button', { name: 'Edit chart', exact: true }).click();
    let editor = page.getByRole('dialog');
    await editor.getByRole('textbox', { name: 'Chart', exact: true }).fill('Unsaved draft');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card.getByRole('heading', { name: 'Annual performance' })).toBeVisible();
    await card.getByRole('button', { name: 'Edit chart', exact: true }).click();
    editor = page.getByRole('dialog');
    await editor.getByRole('textbox', { name: 'Chart', exact: true }).fill('Reviewed annual performance');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('your draft is preserved');
    await expect(editor.getByRole('textbox', { name: 'Chart', exact: true })).toHaveValue('Reviewed annual performance');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await page.reload();
    card = page.getByRole('region', { name: 'Reviewed annual performance', exact: true });
    await expect(card.getByRole('heading', { name: 'Reviewed annual performance' })).toBeVisible();
    for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        await page.setViewportSize({ width: dark ? 480 : 1280, height: 1000 });
        const pngPending = page.waitForEvent('download');
        await card.getByRole('button', { name: 'Download', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Download PNG' }).click();
        const png = await pngPending;
        await png.saveAs(testInfo.outputPath(dark ? 'chart-dark.png' : 'chart-light.png'));
        await card.screenshot({ path: testInfo.outputPath(dark ? 'chart-dark-screen.png' : 'chart-light-screen.png') });
    }
    await card.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore original' }).click();
    await expect(page.getByRole('region', { name: 'Annual performance', exact: true })).toBeVisible();
    expect(entry.version).toBe(2);
    await expectAppHealthy(appErrors);
});

test('chart and report recovery errors show readable guidance with raw diagnostics collapsed', async ({ page, appErrors }, testInfo) => {
    await setupWorks(page);
    const failures = [
        { toolName: 'chartBuilder', code: 'INVALID_FIELDS', message: 'Repeated X values have ambiguous grain. Columns varying: metric, value.', input: { chartType: 'line' } },
        { toolName: 'updateWorkReport', code: 'REPORT_CONFLICT', message: 'Edit anchor must match exactly once. Read the latest report.', input: { documentId: 'report-1' } },
    ];
    await page.route('**/api/chat/session/work-1', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'work-1', type: 'global' },
                    messages: [
                        {
                            id: 'recovery-answer',
                            role: 'assistant',
                            metadata: { responseStatus: 'completed' },
                            parts: [
                                ...failures.map(({ toolName, input, ...failure }) => ({
                                    type: `tool-${toolName}`,
                                    toolCallId: toolName,
                                    state: 'output-error',
                                    input,
                                    errorText: JSON.stringify({ ...failure, retryable: true, recovery: 'Read the result and retry.', affectedTool: toolName }),
                                })),
                                { type: 'text', text: 'The earlier steps need corrected inputs.' },
                            ],
                        },
                    ],
                },
            },
        }),
    );
    await page.reload();
    const group = page.getByTestId('chat-tool-group').first();
    await page.getByTestId('chat-analysis-process').locator('summary').first().click();
    await expect(group.locator('summary').first()).toContainText('Chart attempts: 1');
    await group.locator('summary').first().click();
    const chart = page.locator('[data-testid="chat-tool-activity"][data-tool-name="chartBuilder"]');
    const report = page.locator('[data-testid="chat-tool-activity"][data-tool-name="updateWorkReport"]');
    await chart.getByRole('button').first().click();
    await report.getByRole('button').first().click();
    await expect(chart.getByRole('status')).toContainText('Several rows share a time or category');
    await expect(report.getByRole('status')).toContainText('This edit was not saved');
    await expect(chart.locator('pre')).not.toBeVisible();
    await expect(report.locator('pre')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('readable-recovery.png'), fullPage: true });
    await chart.getByText('Show raw details', { exact: true }).click();
    await expect(chart.locator('pre')).toContainText('Repeated X values');
    await expectAppHealthy(appErrors);
});

test('report charts use compact independent controls, snapshot SQL and downloads in every view', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(120_000);
    await setupWorks(page);
    const title = 'Revenue with a deliberately long descriptive title for the latest complete fiscal years';
    const sql = "SELECT fiscal_year, revenue, profit, cash_flow FROM annual_financials WHERE ticker = 'EXAMPLE' ORDER BY fiscal_year DESC";
    const report = {
        ...document,
        content: {
            ...document.content,
            format: 'restricted-mdx' as const,
            schemaVersion: 1 as const,
            body: 'Revenue increased.\n\n<Chart source="trend" />',
            visuals: [
                {
                    id: 'trend',
                    type: 'chart' as const,
                    title: 'Annual financial performance',
                    evidenceId: 'private-artifact',
                    chart: {
                        type: 'bar' as const,
                        xKey: 'fiscal_year',
                        yKeys: [
                            { key: 'revenue', label: title },
                            { key: 'profit', label: 'Profit' },
                            { key: 'cash_flow', label: 'Cash flow' },
                        ],
                        options: { valueFormat: { scale: 100000000, precision: 2, suffix: '亿元' } },
                    },
                },
            ],
            evidence: [
                {
                    ...document.content.evidence[0],
                    snapshotId: 'annual-snapshot',
                    sql,
                    columns: ['fiscal_year', 'revenue', 'profit', 'cash_flow'],
                    rowCount: 3,
                    rows: [
                        { fiscal_year: '2025', revenue: '129079000000.00000000', profit: '5589000000.00000000', cash_flow: '-3013000000.00000000' },
                        { fiscal_year: '2024', revenue: '133125000000.00000000', profit: null, cash_flow: '21234000000.00000000' },
                        { fiscal_year: '2023', revenue: '134598000000.00000000', profit: '20315000000.00000000', cash_flow: '36615000000.00000000' },
                    ],
                },
            ],
        },
    };
    await page.route('**/api/work-documents/report-1', route =>
        route.fulfill({ json: { document: { ...report, content: { ...report.content, embeds: reportEmbeds(report.content.visuals, report.content.evidence) } }, versions: [] } }),
    );
    let liveSourceReads = 0;
    await page.route('**/api/actions/execute', route => {
        if (route.request().postDataJSON().actionId !== 'artifact.get') return route.fallback();
        liveSourceReads++;
        return route.fulfill({ status: 503, json: { ok: false, message: 'Live source unavailable' } });
    });
    await page.goto(`${new URL(page.url()).pathname}?chat=work-1&panel=report&document=report-1`);
    const figure = page.locator('[data-visual="trend"]').last();
    await expect(figure.getByRole('region')).toHaveCount(3);
    // Only the chart's own legend remains, with no report-level series switches.
    await expect(figure.getByRole('button', { name: 'Profit', exact: true })).toHaveCount(1);
    const revenue = figure.getByRole('region', { name: title, exact: true });
    const profit = figure.getByRole('region', { name: 'Profit', exact: true });
    const cash = figure.getByRole('region', { name: 'Cash flow', exact: true });
    await expect(cash.locator('svg text').filter({ hasText: /^202[345]$/ })).toHaveText(['2023', '2024', '2025']);
    await revenue.getByRole('heading').focus();
    await expect(page.getByRole('tooltip')).toContainText('Period: 2023 – 2025');
    await page.keyboard.press('Escape');
    for (const card of [revenue, profit, cash]) {
        await card.getByRole('button', { name: 'Source', exact: true }).click();
        await expect(card.locator('pre')).toContainText(sql);
        await expect(card.getByText('Source details are unavailable.', { exact: true })).toHaveCount(0);
        await expect(card.getByRole('button', { name: 'Source', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(liveSourceReads).toBe(0);
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (value: string) => {
                    (window as unknown as { copiedSql: string }).copiedSql = value;
                },
            },
        });
    });
    await cash.getByRole('button', { name: 'Copy SQL' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { copiedSql: string }).copiedSql)).toBe(sql);
    await cash.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(cash.locator('tbody tr')).toHaveText(['2023366.15亿元', '2024212.34亿元', '2025-30.13亿元']);
    await expect(profit.getByRole('button', { name: 'Source', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const csvPending = page.waitForEvent('download');
    await cash.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download CSV' }).click();
    const csv = await csvPending;
    const stream = await csv.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    expect(raw).toContain('-3013000000.00000000');
    expect(raw.indexOf('2023')).toBeLessThan(raw.indexOf('2025'));
    expect(raw).not.toContain('revenue');
    for (const view of ['Data', 'Source', 'Chart']) {
        await cash.getByRole('button', { name: view, exact: true }).click();
        const pending = page.waitForEvent('download');
        await cash.getByRole('button', { name: 'Download', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Download PNG' }).click();
        const png = await pending;
        await png.saveAs(testInfo.outputPath(`cash-flow-from-${view}.png`));
        await expect(cash.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-chart-export]')).toHaveCount(0);
    }
    for (const dark of [false, true]) {
        await page.setViewportSize({ width: dark ? 375 : 1280, height: 1000 });
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        await revenue.getByRole('button', { name: 'Chart', exact: true }).click();
        const header = revenue.locator('[data-chart-header]');
        const headingBox = await header.getByRole('heading').boundingBox();
        const actionBox = await header.getByRole('button', { name: 'Download', exact: true }).boundingBox();
        expect(Math.abs(headingBox!.y + headingBox!.height / 2 - actionBox!.y - actionBox!.height / 2)).toBeLessThan(3);
        expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        for (const button of await header.getByRole('button').all()) expect(await button.innerText()).toBe('');
        await revenue.screenshot({ path: testInfo.outputPath(dark ? 'compact-dark-mobile.png' : 'compact-light.png') });
    }
    report.content.evidence[0].sql = '';
    await page.reload();
    await cash.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(cash.getByText('Source details are unavailable.', { exact: true })).toBeVisible();
    await expect(cash.locator('pre')).toHaveCount(0);
    expect(liveSourceReads).toBe(0);
    await expectAppHealthy(appErrors);
});
