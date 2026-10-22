import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

const connection = createWorkbenchConnection();
const answer = 'February net revenue was 160,000 and order count was 350.';
const now = '2026-10-22T10:00:00.000Z';
const session = {
    id: 'analysis-chat',
    title: 'Monthly net revenue and orders',
    type: 'global',
    connectionId: connection.connection.id,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
};

async function openAnalysis(page: Page, failed = false, legacy = false, options: { serverOnly?: boolean; noMatches?: boolean } = {}) {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input?: { connectionId?: string } };
        if (body.actionId.startsWith('schema.') && body.input?.connectionId === connection.connection.id) {
            await route.fulfill({
                json: {
                    ok: true,
                    data: { databases: [{ value: 'main', label: 'main' }], schemas: [], tables: [], views: [] },
                    execution: { actionId: body.actionId, runId: 'schema-test', startedAt: now, finishedAt: now },
                },
            });
            return;
        }
        await route.fallback();
    });
    await page.route('**/api/chat/sessions*', route => route.fulfill({ json: { code: 0, data: { sessions: [session] } } }));
    await page.route('**/api/chat/session/*', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session,
                    messages: [
                        { id: 'question', role: 'user', parts: [{ type: 'text', text: 'Analyze monthly net revenue and order count' }] },
                        {
                            id: 'msg_turn-1',
                            role: 'assistant',
                            ...(legacy ? {} : { metadata: { agentRunId: 'run-1', requestId: 'turn-1' } }),
                            parts: options.serverOnly
                                ? [{ type: 'text', text: answer }]
                                : [
                                      { type: 'text', text: 'I will read the business definition before analyzing the results.' },
                                      { type: 'reasoning', text: 'Check the approved net revenue definition.' },
                                      {
                                          type: 'tool-read_asset',
                                          toolCallId: 'read',
                                          state: 'output-available',
                                          input: { ref: 'dory://knowledge/model' },
                                          output: {
                                              ok: true,
                                              asset: { title: 'Net revenue definition', revision: 'revision-1', deepLink: '/knowledge/model' },
                                              content: { definition: 'Revenue after refunds' },
                                              citation: { revision: 'revision-1' },
                                          },
                                      },
                                      ...(!legacy
                                          ? [
                                                {
                                                    type: 'tool-sqlRunner',
                                                    toolCallId: 'sql',
                                                    state: 'output-available',
                                                    input: { sql: 'SELECT month, revenue FROM monthly', database: 'main' },
                                                    output: {
                                                        type: 'sql-result',
                                                        ok: true,
                                                        sql: 'SELECT month, revenue FROM monthly',
                                                        database: 'main',
                                                        rowCount: 2,
                                                        previewRows: [
                                                            { month: 'January', revenue: 180000 },
                                                            { month: 'February', revenue: 160000 },
                                                        ],
                                                        columns: [
                                                            { name: 'month', type: 'text' },
                                                            { name: 'revenue', type: 'numeric' },
                                                        ],
                                                        sessionId: 'sql-1',
                                                        artifactIds: ['artifact-1'],
                                                    },
                                                },
                                            ]
                                          : []),
                                      ...(!legacy
                                          ? [
                                                {
                                                    type: 'tool-chartBuilder',
                                                    toolCallId: 'chart',
                                                    state: 'output-available',
                                                    input: { chartType: 'line', xKey: 'month' },
                                                    output: {
                                                        type: 'chart',
                                                        chartType: 'line',
                                                        title: 'Monthly revenue comparison',
                                                        xKey: 'month',
                                                        yKeys: [{ key: 'revenue', label: 'Revenue' }],
                                                        data: [
                                                            { month: 'January', revenue: 180000 },
                                                            { month: 'February', revenue: 160000 },
                                                        ],
                                                    },
                                                },
                                            ]
                                          : []),
                                      ...(legacy
                                          ? []
                                          : [
                                                {
                                                    type: 'tool-finishAnalysis',
                                                    toolCallId: 'finish',
                                                    state: failed ? 'output-error' : 'output-available',
                                                    input: { finalAnswer: answer },
                                                    ...(failed ? { errorText: 'Summary save failed' } : { output: { ok: true, finalAnswer: answer } }),
                                                },
                                            ]),
                                      ...(!failed ? [{ type: 'text', text: answer }] : []),
                                  ],
                        },
                    ],
                },
            },
        }),
    );
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1]!;
    const event = {
        eventId: 'search-1',
        toolName: 'dory_search_assets',
        status: failed ? 'error' : 'success',
        createdAt: now,
        inputSummary: { requestId: 'turn-1', activitySource: 'automatic', query: 'monthly net revenue and orders' },
        outputSummary: {
            resultCount: options.noMatches ? 0 : 1,
            candidates: options.noMatches
                ? []
                : [{ ref: 'dory://knowledge/model', title: 'Net revenue definition', summary: 'Revenue after refunds', deepLink: '/knowledge/model' }],
        },
        errorMessage: failed ? 'Knowledge temporarily unavailable' : null,
    };
    await page.route('**/api/chat/run-activity*', route =>
        route.fulfill({
            json: {
                work: { workId: 'run-1', status: failed ? 'error' : 'completed', metadata: { chatTurn: { requestId: 'turn-1', summarySaved: !failed, responseSaved: !failed } } },
                events: [
                    event,
                    event,
                    ...['Commerce', 'Operations'].map((title, index) => ({
                        eventId: `context-${index}`,
                        toolName: 'semantic_model_context',
                        status: 'success',
                        createdAt: now,
                        inputSummary: { requestId: 'turn-1', knowledgeModelId: `model-${index}` },
                        outputSummary: { title, modelRevision: `revision-model-${index}`, deepLink: `/knowledge/model-${index}` },
                    })),
                    ...[
                        {
                            eventId: 'read-event',
                            toolName: 'dory_read_asset',
                            id: 'read',
                            outputSummary: { title: 'Net revenue definition', revision: 'revision-1', deepLink: '/knowledge/model' },
                        },
                        { eventId: 'sql-event', toolName: 'dory_run_readonly_sql', id: 'sql', outputSummary: { sessionId: 'sql-1', rowCount: 2 } },
                        { eventId: 'chart-event', toolName: 'chartBuilder', id: 'chart', outputSummary: { chartType: 'line' } },
                        { eventId: 'finish-event', toolName: 'dory_finish_work', id: 'finish', outputSummary: {} },
                    ].map(item => ({
                        ...item,
                        createdAt: now,
                        status: item.id === 'finish' && failed ? 'error' : 'success',
                        errorMessage: item.id === 'finish' && failed ? 'Summary save failed' : null,
                        inputSummary: { requestId: 'turn-1', ...(!options.serverOnly ? { toolCallId: item.id } : {}) },
                    })),
                ],
                runHref: `/${organization}/agent-runs/run-1`,
                workspaceHref: `/${organization}/${connection.connection.id}/sql-console?workId=run-1`,
            },
        }),
    );
    await page.route('**/api/works/run-1/snapshot', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    snapshot: {
                        sessions: [
                            {
                                session: { sessionId: 'sql-1', sqlText: 'SELECT month, revenue FROM monthly', database: 'main', status: 'success' },
                                queryResultSets: [
                                    {
                                        rowCount: 2,
                                        columns: [
                                            { name: 'month', type: 'text' },
                                            { name: 'revenue', type: 'numeric' },
                                        ],
                                    },
                                ],
                                results: [
                                    [
                                        { month: 'January', revenue: 180000 },
                                        { month: 'February', revenue: 160000 },
                                    ],
                                ],
                            },
                        ],
                    },
                },
            },
        }),
    );
    await page.evaluate(value => localStorage.setItem('currentConnection', JSON.stringify(value)), connection);
    await page.goto(`/${organization}/${connection.connection.id}/chatbot`);
}

test('chat replays Knowledge activities and the saved final answer after refresh', async ({ page, appErrors }, testInfo) => {
    await openAnalysis(page);
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    const process = page.getByTestId('chat-analysis-process');
    await expect(process).toHaveJSProperty('open', false);
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue in SQL workspace' })).toBeVisible();
    await expect(process.getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('application')).toBeVisible();
    await expect(page.getByText(answer, { exact: true })).toHaveCount(1);
    await expect(page.getByText('Read Knowledge source', { exact: true })).not.toBeVisible();
    await expect(page.getByText('I will read the business definition before analyzing the results.', { exact: true })).not.toBeVisible();
    const beforeAnswer = await page
        .getByText(answer, { exact: true })
        .evaluate(element => Boolean(document.querySelector('[data-testid="chat-analysis-process"]')!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(beforeAnswer).toBe(true);
    // Both the persisted activity and the original tool details share this disclosure.
    await process.locator('summary').first().click();
    await expect(process).toHaveJSProperty('open', true);
    await expect(page.getByText('Searched Knowledge', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Loaded business definitions', { exact: true })).toHaveCount(1);
    await expect(process.locator('article')).toHaveCount(0);
    await expect(process.locator('[data-tool-name="sqlRunner"]')).toHaveCount(1);
    await expect(process.locator('[data-tool-name="read_asset"]')).toHaveCount(1);
    await expect(process.locator('[data-tool-name="finishAnalysis"]')).toHaveCount(1);
    await process.getByRole('button', { name: /Loaded business definitions/ }).click();
    await expect(process.getByText('Commerce', { exact: true })).toBeVisible();
    await expect(process.getByText('Operations', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toHaveAttribute('href', /\/agent-runs\/run-1$/);
    await expect(page.getByRole('link', { name: 'Continue in SQL workspace' })).toBeVisible();
    expect(
        await page
            .getByRole('link', { name: 'View Agent Run' })
            .evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('[data-tool-name="finishAnalysis"]')!) & Node.DOCUMENT_POSITION_PRECEDING)),
    ).toBe(true);
    await process.getByRole('button', { name: /Read Knowledge source/ }).click();
    await expect(page.getByText('Net revenue definition', { exact: true })).toBeVisible();
    await expect(page.getByText('Source revision · revision-1', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('tool-activity-expanded.png'), fullPage: true });
    await process.locator('summary').first().click();
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue in SQL workspace' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('chat-analysis.png'), fullPage: true });
    await page.reload();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(page.getByTestId('chat-analysis-process')).toHaveJSProperty('open', false);
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue in SQL workspace' })).toBeVisible();
    await expect(page.getByText('Read Knowledge source', { exact: true })).not.toBeVisible();
    expect(appErrors.filter(error => !/posthog/i.test(error))).toEqual([]);
});

test('failed finalization preserves the answer and clearly marks incomplete conclusions', async ({ page }) => {
    await openAnalysis(page, true);
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(page.getByText('Conclusions are not fully saved.', { exact: false })).toBeVisible();
    await expect(page.getByText('No matching Knowledge', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('chat-analysis-process')).toHaveJSProperty('open', false);
    await page.getByTestId('chat-analysis-process').locator('summary').first().click();
    const search = page.getByTestId('chat-analysis-process').locator('[data-tool-name="search_assets"]');
    await expect(search.getByText('Failed', { exact: true })).toBeVisible();
    await search.getByRole('button').click();
    await expect(search.getByText('Knowledge temporarily unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toBeVisible();
});

test('historical chats fold tool steps above the final text without requiring a Run', async ({ page }) => {
    await openAnalysis(page, false, true);
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    const process = page.getByTestId('chat-analysis-process');
    await expect(process).toHaveJSProperty('open', false);
    await expect(page.getByText('Read Knowledge source', { exact: true })).not.toBeVisible();
    await process.locator('summary').first().click();
    await expect(page.getByText('Read Knowledge source', { exact: true })).toBeVisible();
});

test('running steps remain visible and collapse automatically when the answer finishes', async ({ page }) => {
    await openAnalysis(page);
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    let eventRequests = 0;
    let includeEvent = false;
    await page.route('**/api/chat/run-activity*', async route => {
        if (new URL(route.request().url()).searchParams.get('requestId') !== 'turn-2') return route.fallback();
        if (includeEvent) eventRequests++;
        await route.fulfill({
            json: {
                work: { workId: 'run-1', status: 'active', metadata: { chatTurn: { requestId: 'turn-2' } } },
                events: includeEvent
                    ? [{ eventId: 'late-read', toolName: 'dory_read_asset', status: 'running', inputSummary: { requestId: 'turn-2', toolCallId: 'stream-read' } }]
                    : [],
                runHref: '/agent-runs/run-1',
                workspaceHref: '/sql-console',
            },
        });
    });
    await page.evaluate(() => {
        const fetchOriginal = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (!new URL(url, location.origin).pathname.endsWith('/api/chat') || init?.method !== 'POST') return fetchOriginal(input, init);
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                    send({ type: 'start', messageId: 'streamed-turn', messageMetadata: { agentRunId: 'run-1', requestId: 'turn-2' } });
                    send({ type: 'start-step' });
                    send({ type: 'text-start', id: 'progress' });
                    send({ type: 'text-delta', id: 'progress', delta: 'Checking the relevant business definitions.' });
                    send({ type: 'text-end', id: 'progress' });
                    send({ type: 'tool-input-available', toolCallId: 'stream-read', toolName: 'read_asset', input: { ref: 'dory://knowledge/model' } });
                    (window as unknown as { finishControlledAnalysis: () => void }).finishControlledAnalysis = () => {
                        send({
                            type: 'tool-output-available',
                            toolCallId: 'stream-read',
                            output: { ok: true, asset: { title: 'Net revenue definition', revision: 'v1', deepLink: '/knowledge/model' } },
                        });
                        send({ type: 'finish-step' });
                        send({ type: 'start-step' });
                        send({
                            type: 'tool-input-available',
                            toolCallId: 'stream-finish',
                            toolName: 'finishAnalysis',
                            input: { finalAnswer: 'The follow-up analysis is complete.' },
                        });
                        send({ type: 'tool-output-available', toolCallId: 'stream-finish', output: { ok: true, finalAnswer: 'The follow-up analysis is complete.' } });
                        send({ type: 'finish-step' });
                        send({ type: 'finish', finishReason: 'stop' });
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    };
                },
            });
            return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
        };
    });
    await page.getByRole('textbox').last().fill('Compare the previous two months');
    await page.getByRole('textbox').last().press('Enter');
    const process = page.getByTestId('chat-analysis-process').last();
    await expect(process).toHaveJSProperty('open', true);
    await expect(page.getByText('Checking the relevant business definitions.', { exact: true })).toBeVisible();
    const readRow = process.locator('[data-tool-name="read_asset"]');
    await readRow.getByRole('button', { name: /Read Knowledge source/ }).click();
    includeEvent = true;
    await expect.poll(() => eventRequests).toBeGreaterThan(0);
    await expect(readRow).toHaveCount(1);
    await expect(readRow.getByRole('button', { name: /Read Knowledge source/ })).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => (window as unknown as { finishControlledAnalysis: () => void }).finishControlledAnalysis());
    await expect(page.getByText('The follow-up analysis is complete.', { exact: true })).toBeVisible();
    await expect(process).toHaveJSProperty('open', false);
    await expect(page.getByText('Checking the relevant business definitions.', { exact: true })).not.toBeVisible();
});

test('Knowledge no matches and search failure use distinct tool statuses', async ({ page }) => {
    await openAnalysis(page, false, false, { noMatches: true });
    const process = page.getByTestId('chat-analysis-process');
    await process.locator('summary').first().click();
    const search = process.locator('[data-tool-name="search_assets"]');
    await expect(search.getByText('No matches', { exact: true })).toBeVisible();
    await search.getByRole('button').click();
    await expect(search.getByText('No matching Knowledge', { exact: true })).toBeVisible();
    await expect(search.getByText('Search: monthly net revenue and orders', { exact: true })).toBeVisible();
});

test('local Codex events replay as compact tools and SQL details load on demand', async ({ page }) => {
    let snapshotRequests = 0;
    page.on('request', request => {
        if (request.url().endsWith('/api/works/run-1/snapshot')) snapshotRequests++;
    });
    await openAnalysis(page, false, false, { serverOnly: true });
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    const process = page.getByTestId('chat-analysis-process');
    await process.locator('summary').first().click();
    await expect(process.locator('[data-testid="chat-tool-activity"]')).toHaveCount(6);
    expect(snapshotRequests).toBe(0);
    const sql = process.locator('[data-tool-name="sqlRunner"]');
    await sql.getByRole('button', { name: /Query data/ }).click();
    await expect(sql.getByRole('cell', { name: 'January', exact: true })).toBeVisible();
    expect(snapshotRequests).toBeGreaterThan(0);
    const loadedRequests = snapshotRequests;
    await sql.getByRole('button', { name: /Query data/ }).click();
    await sql.getByRole('button', { name: /Query data/ }).click();
    await expect(sql.getByRole('cell', { name: 'January', exact: true })).toBeVisible();
    expect(snapshotRequests).toBe(loadedRequests);
    await expect(process.locator('article')).toHaveCount(0);
});
