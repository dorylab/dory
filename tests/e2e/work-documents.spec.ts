import type { AnalysisScope, WorkDocumentContent } from '@dory/shared/types/work-document';
import { expect, type Page } from '@playwright/test';
import type { UIMessage } from 'ai';

import type { ChatContext } from '../../apps/web/lib/chat-context/types';
import { editableReport, parseReport, reportEmbeds } from '../../apps/web/lib/work-documents/report-core';
import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

const connection = createWorkbenchConnection();
const now = '2026-10-22T10:00:00Z';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/works/*/snapshot', route => route.fulfill({ json: { data: { snapshot: { sessions: [] } } } }));
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        if (body.actionId === 'schema.listDatabases')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        databases: [
                            { value: 'main', label: 'main' },
                            { value: 'analytics', label: 'analytics' },
                        ],
                    },
                },
            });
        await route.fallback();
    });
});

async function toggleSource(page: Page, name: string) {
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await page.getByPlaceholder('Search data sources or databases…').fill('');
    await page.getByRole('option', { name: name === 'Unavailable source' ? 'Remove unavailable source' : `${name}: Automatic databases`, exact: true }).click();
    await page.keyboard.press('Escape');
}

const makeDocument = () => ({
    id: 'doc-report',
    title: 'Revenue analysis',
    chatId: 'report-chat',
    scope: { connectionIds: [connection.connection.id] },
    revision: 1,
    status: 'ready',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    content: {
        markdown:
            '## Key finding\n\n**Revenue** fell by 20%. [Source](dory://evidence/art-1)\n\n- First finding\n- *Second finding*\n\n> A quoted definition\n\n```text\nread only\n```\n\n| Definition | Meaning |\n| --- | --- |\n| Revenue | Paid orders |\n\n![Monthly revenue](dory://visual/chart)',
        knowledge: [],
        visuals: [{ id: 'chart', type: 'chart', title: 'Monthly revenue', evidenceId: 'art-1', chart: { type: 'bar', xKey: 'month', yKey: 'revenue' } }],
        evidence: [
            {
                artifactId: 'art-1',
                title: 'Revenue query',
                connectionId: connection.connection.id,
                connectionName: 'Orders',
                sql: 'SELECT month, revenue FROM orders',
                capturedAt: now,
                columns: ['month', 'revenue'],
                rows: [
                    { month: 'September', revenue: 100 },
                    { month: 'October', revenue: 80 },
                ],
                rowCount: 2,
                truncated: false,
                runId: 'run-1',
            },
        ],
    },
});

function savedDraft(content: ReturnType<typeof makeDocument>['content'], draft: { body?: string; markdown: string; visuals: WorkDocumentContent['visuals']; title: string }) {
    const converted = editableReport(content as WorkDocumentContent);
    const parsed = parseReport(draft.body ?? draft.markdown, draft.visuals);
    return { ...converted, ...draft, markdown: parsed.presentation, embeds: reportEmbeds(draft.visuals, converted.evidence), diagnostics: parsed.diagnostics };
}

test('Reports edit, save, restore and export the same snapshot', async ({ page, appErrors }, testInfo) => {
    let document = makeDocument();
    const original = structuredClone(document);
    const versions = [{ revision: 1, source: 'agent', createdAt: now }];
    let publishedDefinition: Record<string, unknown> | null = null;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        if (body.actionId === 'knowledge.list')
            return route.fulfill({
                json: { ok: true, data: { models: [{ id: 'commerce', name: 'Commerce', dataSources: [{ connectionId: connection.connection.id, name: 'Orders' }] }] } },
            });
        if (body.actionId === 'knowledge.createDefinition') {
            publishedDefinition = body.input.definition;
            return route.fulfill({ json: { ok: true, data: {} } });
        }
        await route.fallback();
    });
    await page.route('**/api/work-documents/doc-report?*', route => route.fulfill({ json: { document: original, versions } }));
    await page.route('**/api/work-documents/doc-report', async route => {
        if (route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON();
            expect(body.expectedRevision).toBe(document.revision);
            if (body.action === 'restore') document = { ...original, revision: document.revision + 1 };
            else document = { ...document, title: body.draft.title, content: savedDraft(document.content, body.draft), revision: document.revision + 1 };
            versions.unshift({ revision: document.revision, source: 'user', createdAt: now });
        }
        await route.fulfill({ json: { document, versions } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Monthly revenue' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await page.getByTestId('work-markdown').getByRole('link', { name: 'Source', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('SELECT month');
    await page.keyboard.press('Escape');
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Source note preserved.\n\n');
    await expect.poll(() => document.content.markdown).toContain('Source note preserved.');
    await source.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nHuman note preserved.');
    await expect.poll(() => document.content.markdown).toContain('Human note preserved.');
    await page.getByRole('textbox', { name: 'Title', exact: true }).first().fill('Human-reviewed analysis');
    await expect.poll(() => document.title).toBe('Human-reviewed analysis');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Human-reviewed analysis' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'HTML', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Human-reviewed analysis.html');
    const stream = await file.createReadStream();
    let html = '';
    for await (const chunk of stream!) html += chunk.toString();
    expect(html).toContain('<svg');
    expect(html).toContain('Human-reviewed analysis');
    expect(html).not.toContain('SELECT month');
    expect(html).toContain('<strong>Revenue</strong>');
    await selectReportVersion(page, 1);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await page.getByTestId('work-markdown').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('p')!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
    });
    await page.getByRole('button', { name: 'Add definition to Knowledge', exact: true }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'Definition text' }).fill('Revenue is paid orders less refunds.');
    await page.getByRole('button', { name: 'Confirm and publish definition' }).click();
    await expect
        .poll(() => publishedDefinition)
        .toMatchObject({ description: 'Revenue is paid orders less refunds.', sourceConnectionId: connection.connection.id, status: 'verified' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('work-dark-mobile.png'), fullPage: true });
    await expectAppHealthy(appErrors);
});

test('Work has explicit multi-source scope without creating an unsolicited report', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [
                    { id: connection.connection.id, name: 'Orders', type: 'postgres' },
                    { id: 'ads', name: 'Advertising', type: 'postgres' },
                ],
                models: [{ id: 'commerce', name: 'Commerce', connectionIds: [connection.connection.id, 'ads'] }],
                sessions: [],
            },
        }),
    );
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/work-documents', route => route.fulfill({ json: { documents: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
    await page.getByPlaceholder('Search Knowledge…').fill('Commerce');
    await page.getByRole('option', { name: 'Commerce', exact: true }).click();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Orders: Automatic databases', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Advertising: Automatic databases', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.getByPlaceholder('Search data sources or databases…').fill('Advertising');
    await expect(page.getByRole('option', { name: /Orders/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await toggleSource(page, 'Orders');
    await toggleSource(page, 'Advertising');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await expectAppHealthy(appErrors);
});

test('opening a generated draft preserves the active chat stream', async ({ page, appErrors }, testInfo) => {
    const document = { ...makeDocument(), status: 'draft', chatId: '', revision: 2 };
    const historical = { ...structuredClone(document), revision: 1, content: { ...structuredClone(document.content), markdown: 'Historical snapshot content' } };
    let latestRead = 0;
    await page.route('**/api/chat/run-activity?*', route => route.fulfill({ json: { work: { workId: 'run-live', status: 'active' }, events: [] } }));
    await page.route('**/api/works/run-live/snapshot', route =>
        route.fulfill({
            json: {
                data: {
                    snapshot: {
                        sessions: [
                            {
                                session: { sessionId: 'live-query', sqlText: 'SELECT amount FROM payments', database: 'sales', status: 'success' },
                                queryResultSets: [{ columns: [{ name: 'amount' }], rowCount: 1 }],
                                results: [[{ amount: 42 }]],
                            },
                        ],
                    },
                    artifacts: [{ id: 'live-artifact', title: 'Live results', type: 'result_set', status: 'ready', rowCount: 1, createdAt: now, updatedAt: now }],
                },
            },
        }),
    );
    await page.route('**/api/actions/execute', route => {
        const body = route.request().postDataJSON();
        if (body.actionId === 'artifact.get')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        id: 'live-artifact',
                        title: 'Live results',
                        type: 'result_set',
                        status: 'ready',
                        sourceResultSetId: 'live-result-set',
                        resultSet: { sql: 'SELECT amount FROM payments', columns: [{ name: 'amount' }] },
                    },
                },
            });
        if (body.actionId === 'resultSet.rows.read')
            return route.fulfill({ json: { ok: true, data: { rows: [{ amount: 42 }], columns: [{ name: 'amount' }], rowCount: 1, dataAvailability: 'full' } } });
        return route.fallback();
    });
    let created = false;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [{ id: connection.connection.id, name: 'Orders', type: 'postgres' }], models: [], sessions: [] } }),
    );
    await page.route('**/api/work-documents?*', route => {
        document.chatId = new URL(route.request().url()).searchParams.get('chatId') ?? '';
        return route.fulfill({ json: { documents: created ? [document] : [] } });
    });
    await page.route('**/api/work-documents', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/work-documents/doc-report*', async route => {
        // Make loading visible long enough to catch a conversation unmount.
        await new Promise(resolve => setTimeout(resolve, 500));
        latestRead = document.revision;
        await route.fulfill({
            json: {
                document: new URL(route.request().url()).searchParams.has('revision') ? historical : document,
                versions: [document.revision, 1].map(revision => ({ revision, source: 'agent', createdAt: now })),
            },
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    await toggleSource(page, 'Orders');
    await expect(page.getByTestId('agent-scope-picker').getByText('Check database selections')).toHaveCount(0);
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
                        send({ type: 'start', messageId: 'live-report', messageMetadata: { agentRunId: 'run-live', requestId: 'turn-live' } });
                        send({ type: 'start-step' });
                        send({ type: 'text-start', id: 'progress' });
                        send({ type: 'text-delta', id: 'progress', delta: 'Preparing both sources.' });
                        (window as unknown as { finishReportStream: () => void }).finishReportStream = () => {
                            send({ type: 'text-delta', id: 'progress', delta: ' Report completed.' });
                            send({ type: 'text-end', id: 'progress' });
                            send({ type: 'finish-step' });
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
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Create a report from both sources.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Preparing both sources.', { exact: true })).toBeVisible();
    created = true;
    await expect(page.getByTestId('agent-resources')).toHaveCount(0);
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page.getByRole('button', { name: /^Executions/ }).click();
    await page.getByTestId('resource-queries').getByRole('button').first().click();
    await expect(page.getByTestId('agent-query-preview').getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await page
        .getByRole('region', { name: 'Outputs', exact: true })
        .getByRole('button', { name: /Live results/ })
        .click();
    await expect(page.getByTestId('agent-artifact-preview').getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(page.getByRole('button', { name: /Revenue analysis Report.*Draft/ })).toBeVisible();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await page.getByRole('button', { name: /Revenue analysis Report.*Draft/ }).click();
    await expect(page.getByTestId('work-report')).toBeVisible();
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page.getByRole('button', { name: /Revenue analysis Report.*Draft/ }).click();
    await expect(page.getByTestId('work-report')).toBeVisible();
    await expect(page.getByText('Preparing both sources.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
    await selectReportVersion(page, 1);
    await expect(page.getByTestId('work-markdown')).toHaveText('Historical snapshot content');
    document.revision = 3;
    document.content.markdown = 'Latest generated content';
    await expect.poll(() => latestRead).toBe(3);
    await expect(page.getByTestId('work-markdown')).toHaveText('Historical snapshot content');
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Historical r1');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Back to latest', exact: true }).click();
    await expect(page.getByTestId('work-markdown')).toHaveText('Latest generated content');
    await page.evaluate(() => (window as unknown as { finishReportStream: () => void }).finishReportStream());
    await expect(page.getByText('Preparing both sources. Report completed.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-report-split.png') });
    await expectAppHealthy(appErrors);
});

test('unsupported Markdown stays intact in source mode and never executes HTML', async ({ page, appErrors }) => {
    let document = makeDocument();
    document.content.markdown = '## Source preserved\n\n<div onclick="window.unexpectedExecution=true">Raw HTML stays literal</div>\n\n- [x] Unsupported task list';
    document.content.visuals = [];
    let writes = 0;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/doc-report', route => {
        if (route.request().method() !== 'GET') {
            writes++;
            const { draft } = route.request().postDataJSON();
            document = { ...document, content: savedDraft(document.content, draft), revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    await expect(page.getByTestId('work-markdown')).toContainText('<div onclick=');
    await expect(page.getByTestId('work-markdown').locator('[onclick]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await expect.poll(() => writes).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('work-markdown')).toContainText('Raw HTML stays literal');
    expect(writes).toBeGreaterThan(0);
    await expectAppHealthy(appErrors);
});

test('data components retain snapshots while moving and deleting MDX references', async ({ page, appErrors }) => {
    let document = makeDocument();
    document.content.markdown = '## Move target\n\nParagraph before the chart.\n\n![Monthly revenue](dory://visual/chart)\n\nClosing note.';
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/doc-report', route => {
        if (route.request().method() === 'PATCH') {
            const { draft } = route.request().postDataJSON();
            document = { ...document, content: savedDraft(document.content, draft), revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+A');
    await page.keyboard.insertText('<Chart source="chart" />\n\n## Move target\n\nParagraph before the chart.\n\nClosing note.');
    await expect.poll(() => document.content.markdown.indexOf('![Monthly revenue]') < document.content.markdown.indexOf('## Move target')).toBe(true);
    await source.press('ControlOrMeta+A');
    await page.keyboard.insertText('## Move target\n\nParagraph before the chart.\n\nClosing note.');
    await expect.poll(() => document.content.markdown).not.toContain('dory://visual/chart');
    expect(document.content.evidence[0].rows).toHaveLength(2);
    await expectAppHealthy(appErrors);
});

test('global Agent restores per-source databases, manages sessions and adapts to theme and width', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const scope = { connectionIds: ['conn-1', 'ads'], knowledgeModelId: null, databasesByConnection: { 'conn-1': 'analytics', ads: 'main' } };
    let sessions = [
        { id: 'saved', title: 'Monthly comparison', type: 'global', connectionId: null, scope, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'older', title: 'Earlier analysis', type: 'global', connectionId: 'conn-1', activeDatabase: 'analytics', scope: null, createdAt: now, updatedAt: now },
    ];
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [
                    { id: 'conn-1', name: 'Orders', type: 'postgres', defaultDatabase: 'main' },
                    { id: 'ads', name: 'Advertising', type: 'postgres', defaultDatabase: 'analytics' },
                ],
                models: [],
                sessions,
            },
        }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/chat/session/*', async route => {
        const id = route.request().url().split('/').at(-1);
        if (route.request().method() === 'PATCH') {
            sessions = sessions.map(session => (session.id === id ? { ...session, title: route.request().postDataJSON().title } : session));
            return route.fulfill({ json: { code: 0, data: {} } });
        }
        if (route.request().method() === 'DELETE') {
            sessions = sessions.filter(session => session.id !== id);
            return route.fulfill({ json: { code: 0, data: {} } });
        }
        return route.fulfill({
            json: {
                code: 0,
                data: {
                    session: sessions.find(session => session.id === id),
                    messages: [
                        { id: 'question', role: 'user', parts: [{ type: 'text', text: 'Compare revenue' }] },
                        { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Orders and advertising are ready for analysis.' }] },
                    ],
                },
            },
        });
    });
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/api/chat', async route => {
        submitted = route.request().postDataJSON();
        await route.fulfill({
            body: 'data: {"type":"start","messageId":"new-answer"}\n\ndata: {"type":"text-start","id":"answer"}\n\ndata: {"type":"text-delta","id":"answer","delta":"Both databases received."}\n\ndata: {"type":"text-end","id":"answer"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
            headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toBeEnabled();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-welcome-light.png') });
    await toggleSource(page, 'Orders');
    await toggleSource(page, 'Advertising');
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await page.getByRole('option', { name: 'Orders: analytics', exact: true }).click();
    await page.getByRole('option', { name: 'Advertising: main', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Compare the selected databases');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
        .poll(() => submitted?.analysisScope)
        .toEqual({ ...scope, databasesByConnection: { 'conn-1': ['analytics'], ads: ['main'] }, connectionMode: 'manual', knowledgeMode: 'auto' });
    await expect(page.getByText('Both databases received.', { exact: true })).toBeVisible();
    // Search and select the persisted conversation, then reload its URL state.
    await page.getByPlaceholder('Search works and outputs…').fill('Monthly');
    await expect(page.getByRole('button', { name: /^Earlier analysis/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Monthly comparison/ }).click();
    await expect(page.getByText('Orders and advertising are ready for analysis.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Orders and advertising are ready for analysis.')).toBeVisible();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Orders: analytics' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Advertising: main' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: 'Orders: analytics' })).toHaveCount(0);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-conversation-light.png') });
    await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
    });
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-conversation-dark.png') });
    // New conversations default to automatic; legacy sessions restore activeDatabase.
    await page.getByRole('button', { name: 'New Work', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page).toHaveURL(/databases=/);
    await page.getByRole('button', { name: /^Earlier analysis/ }).click();
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toHaveText('analytics');
    await page.getByRole('button', { name: 'New Work', exact: true }).click();
    const monthlyRow = page.getByRole('button', { name: /^Monthly comparison/ }).locator('..');
    await monthlyRow.hover();
    await monthlyRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Rename work', exact: true }).click();
    await page.getByRole('textbox', { name: 'Work title', exact: true }).fill('Renamed comparison');
    await page.getByRole('textbox', { name: 'Work title', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: /^Renamed comparison/ })).toBeVisible();
    const renamedRow = page.getByRole('button', { name: /^Renamed comparison/ }).locator('..');
    await renamedRow.hover();
    await renamedRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Delete work', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete work', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Renamed comparison/ })).toHaveCount(0);
    await page.setViewportSize({ width: 600, height: 850 });
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Ask a question/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-narrow-dark.png') });
    await expectAppHealthy(appErrors);
});

test('automatic databases allow send during loading failures and explicit selections can be retried', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    let failed = true;
    await page.route('**/api/actions/execute', async route => {
        if (route.request().postDataJSON().actionId !== 'schema.listDatabases') return route.fallback();
        return route.fulfill({ json: failed ? { ok: false, message: 'Database unavailable' } : { ok: true, data: { databases: [{ value: 'main', label: 'main' }] } } });
    });
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [{ id: 'conn-1', name: 'Orders', type: 'postgres' }], models: [], sessions: [] } }));
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?sources=conn-1,missing`);
    await toggleSource(page, 'Unavailable source');
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Inspect data');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByText('Could not load databases')).toBeVisible();
    failed = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Orders: main' })).toBeVisible();
    await page.getByRole('option', { name: 'Orders: main' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    failed = true;
    await page.reload();
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Inspect data');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByText('Could not load databases')).toBeVisible();
    await page.getByRole('option', { name: 'Orders: Automatic databases', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toHaveText('1 source · automatic databases');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await expectAppHealthy(appErrors);
});

test('session resources open as a popover without resizing chat, guard unsaved reports, and fit narrow screens', async ({ page, appErrors }, testInfo) => {
    let document = makeDocument();
    let saveFails = true;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [{ id: connection.connection.id, name: 'Orders', type: 'postgres', defaultDatabase: 'main' }],
                models: [],
                sessions: [{ id: 'report-chat', title: 'Report conversation', connectionId: connection.connection.id, createdAt: now, updatedAt: now, scope: document.scope }],
            },
        }),
    );
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [document] } }));
    await page.route('**/api/chat/session/report-chat', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'report-chat', type: 'global', title: 'Report conversation' },
                    messages: [
                        { id: 'old', role: 'assistant', parts: [{ type: 'text', text: 'First analysis' }], metadata: { agentRunId: 'run-1', requestId: 'old' } },
                        { id: 'new', role: 'assistant', parts: [{ type: 'text', text: 'Updated analysis' }], metadata: { agentRunId: 'run-1', requestId: 'new' } },
                    ],
                },
            },
        }),
    );
    await page.route('**/api/chat/run-activity?*', route =>
        route.fulfill({ json: { work: { workId: 'run-1', title: 'Payment analysis', status: 'completed' }, events: [], runHref: '/demo/agent-runs/run-1', workspaceHref: null } }),
    );
    await page.route('**/api/work-documents/doc-report', async route => {
        if (route.request().method() === 'PATCH') {
            if (saveFails) return route.fulfill({ status: 409, json: { error: 'Report changed. Read the latest version.' } });
            const body = route.request().postDataJSON();
            expect(body.expectedRevision).toBe(document.revision);
            document = { ...document, title: body.draft.title, content: savedDraft(document.content, body.draft), revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=report-chat`);
    await expect(page.getByText('Updated analysis', { exact: true })).toBeVisible();
    await expect(page.getByTestId('agent-resources')).toHaveCount(0);
    const chatWidth = (await page.getByTestId('data-agent').locator('main').boundingBox())!.width;
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(page.getByTestId('agent-resources')).toBeVisible();
    expect((await page.getByTestId('data-agent').locator('main').boundingBox())!.width).toBe(chatWidth);
    await page.getByRole('textbox', { name: /Ask a question/ }).click();
    await expect(page.getByTestId('agent-resources')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /Ask a question/ })).toBeFocused();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page.getByRole('button', { name: /^Executions/ }).click();
    await expect(page.getByRole('link', { name: 'Agent Run · Payment analysis' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Agent Run · Payment analysis' })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toHaveCount(0);
    await page.getByRole('button', { name: /Revenue analysis Report/ }).click();
    expect((await page.getByTestId('data-agent').locator('main').boundingBox())!.width).toBe(chatWidth);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).first().fill('Unsaved analysis');
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Save and continue' }).click();
    await expect(dialog).toContainText('Saving failed');
    await expect(page.getByTestId('work-report')).toBeVisible();
    saveFails = false;
    await dialog.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Work resources', exact: true })).toBeFocused();
    expect(document.title).toBe('Unsaved analysis');
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page.getByRole('button', { name: /Unsaved analysis Report/ }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).first().fill('Discard this');
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true }).first()).toHaveValue('Discard this');
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    expect(document.title).toBe('Unsaved analysis');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-resources-light.png') });
    await page.getByText('Toggle theme', { exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-resources-dark.png') });
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByRole('dialog', { name: 'Work resources' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Work resources' })).toBeVisible();
    const popupBounds = (await page.getByTestId('agent-resources').boundingBox())!;
    expect(popupBounds.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: /^Executions/ }).click();
    await expect(page.getByRole('link', { name: 'Agent Run · Payment analysis' })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-resources-mobile.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Work resources' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Work resources', exact: true })).toBeFocused();
    await expectAppHealthy(appErrors);
});

test('global SQL tools show saved rows and Queries restore the exact source and session', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const sql = 'SELECT amount FROM payments';
    const query = {
        session: { sessionId: 'query-1', sqlText: sql, database: 'sales', connectionId: connection.connection.id, tabId: 'tab-1', status: 'success', startedAt: now },
        queryResultSets: [{ columns: [{ name: 'amount', type: 'number' }], rowCount: 1 }],
        results: [[{ amount: 42 }]],
    };
    const resultArtifact = {
        id: 'result-payments',
        title: 'Payment results',
        type: 'result_set',
        status: 'ready',
        workId: 'run-queries',
        connectionName: 'Orders',
        rowCount: 1,
        createdAt: now,
        updatedAt: now,
    };
    const chartArtifact = { ...resultArtifact, id: 'chart-payments', title: 'Payment trend', type: 'chart', createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z' };
    const fileArtifact = { ...resultArtifact, id: 'file-payments', title: 'Payment export', type: 'file', status: 'unavailable' };
    let failSnapshot = true;
    let failArtifact = true;
    await page.route('**/api/actions/execute', route => {
        const body = route.request().postDataJSON();
        if (body.actionId === 'artifact.get') {
            if (failArtifact) return route.fulfill({ json: { ok: false, message: 'Artifact unavailable' } });
            const artifact = [resultArtifact, chartArtifact, fileArtifact].find(item => item.id === body.input.artifactId)!;
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        ...artifact,
                        sourceResultSetId: 'saved-result',
                        resultSet: { sql, columns: [{ name: 'amount' }] },
                        fileName: 'payments.csv',
                        fileFormat: 'csv',
                        chartState: { chartType: 'bar', xKey: 'amount', yKey: 'amount', groupKey: '__none__' },
                    },
                },
            });
        }
        if (body.actionId === 'resultSet.rows.read')
            return route.fulfill({
                json: { ok: true, data: { rows: [{ amount: body.input.offset ? 84 : 42 }], columns: [{ name: 'amount' }], rowCount: 101, dataAvailability: 'full' } },
            });
        if (body.actionId === 'resultSet.chart.read')
            return route.fulfill({ json: { ok: true, data: { data: [{ __x: 'October', __y: 42 }], series: [{ key: '__y', label: 'Amount' }] } } });
        return route.fallback();
    });
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [], models: [], sessions: [{ id: 'query-chat', title: 'Payments', createdAt: now, updatedAt: now }] } }),
    );
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/works/run-queries/snapshot', route =>
        route.fulfill(
            failSnapshot
                ? { status: 503, json: { error: 'Unavailable' } }
                : {
                      json: {
                          data: {
                              artifacts: [resultArtifact, chartArtifact, fileArtifact, resultArtifact],
                              snapshot: {
                                  sessions: [
                                      query,
                                      {
                                          ...query,
                                          session: {
                                              ...query.session,
                                              sessionId: 'query-2',
                                              sqlText: 'SELECT total FROM orders',
                                              database: 'analytics',
                                              connectionId: 'source-2',
                                              tabId: 'tab-2',
                                              startedAt: '2026-10-23T10:00:00Z',
                                          },
                                      },
                                  ],
                              },
                          },
                      },
                  },
        ),
    );
    await page.route('**/api/chat/run-activity?*', route =>
        route.fulfill({ json: { work: { workId: 'run-queries', title: 'Payment queries', status: 'completed' }, events: [] } }),
    );
    await page.route('**/api/chat/session/query-chat', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'query-chat', type: 'global', title: 'Payments' },
                    messages: [
                        {
                            id: 'query-answer',
                            role: 'assistant',
                            metadata: { agentRunId: 'run-queries', requestId: 'query-request' },
                            parts: [
                                {
                                    type: 'tool-sqlRunner',
                                    toolCallId: 'call-query',
                                    state: 'output-available',
                                    input: { sql, connectionId: connection.connection.id, database: 'sales' },
                                    output: {
                                        result: [{ amount: 42 }],
                                        columns: [{ name: 'amount', type: 'number' }],
                                        rowCount: 1,
                                        executionTimeMs: 8,
                                        sessionId: 'query-1',
                                        work: { workId: 'run-queries' },
                                    },
                                },
                                { type: 'text', text: 'Payment query complete.' },
                            ],
                        },
                    ],
                },
            },
        }),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=query-chat`);
    await page.getByTestId('chat-analysis-process').locator('summary').first().click();
    await page.getByTestId('chat-tool-group').locator('summary').first().click();
    const tool = page.getByTestId('chat-tool-activity');
    await tool.getByRole('button', { name: /Query data/ }).click();
    await expect(tool.getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await expect(tool.getByText('Tool completed.', { exact: true })).toHaveCount(0);
    await expect(tool).toContainText(sql);
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    const executions = page.getByRole('region', { name: 'Executions', exact: true });
    await expect(executions.getByRole('button', { name: /^Executions/ })).toHaveAttribute('aria-expanded', 'false');
    await executions.getByRole('button', { name: /^Executions/ }).click();
    const queries = page.getByTestId('resource-queries');
    await expect(executions.getByRole('alert')).toBeVisible();
    failSnapshot = false;
    await executions.getByRole('button', { name: 'Retry', exact: true }).click();
    const pageCount = page.context().pages().length;
    await expect(queries.getByRole('button')).toHaveCount(2);
    await expect(queries.getByRole('button').first()).toContainText('analytics');
    await queries.getByRole('button').first().click();
    await expect(page.getByTestId('agent-query-preview')).toContainText('SELECT total FROM orders');
    await expect(page).toHaveURL(/querySession=query-2/);
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await queries.getByRole('button').last().click();
    await expect(page.getByTestId('agent-query-preview').getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/querySession=query-1/);
    await page.reload();
    await expect(page.getByTestId('agent-query-preview').getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Executions/ })).toHaveAttribute('aria-expanded', 'false');
    const artifacts = page.getByRole('region', { name: 'Outputs', exact: true });
    await expect(artifacts.getByRole('button')).toHaveCount(3);
    await expect(artifacts.getByRole('button').first()).toContainText('Payment trend');
    await artifacts.getByRole('button', { name: /Payment results/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to load resources' })).toBeVisible();
    failArtifact = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const preview = page.getByTestId('agent-artifact-preview');
    await expect(preview.getByRole('heading', { name: 'Payment results' })).toBeVisible();
    await expect(preview.getByRole('cell', { name: '42', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(preview.getByRole('cell', { name: '84', exact: true })).toBeVisible();
    await page.reload();
    await expect(preview.getByRole('cell', { name: '84', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await artifacts.getByRole('button', { name: /Payment trend/ }).click();
    await expect(page.getByTestId('agent-artifact-chart')).toBeVisible();
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await artifacts.getByRole('button', { name: /Payment export/ }).click();
    await expect(preview.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(preview.getByText('payments.csv', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('agent-artifact-inline.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Work resources', exact: true })).toBeFocused();
    expect(page.context().pages()).toHaveLength(pageCount);
    expect(new URL(page.url()).pathname).toBe(`/${organization}/work`);
    await expectAppHealthy(appErrors);
});

async function selectReportVersion(page: Page, revision: number | 'latest') {
    await page.getByRole('button', { name: 'Report versions', exact: true }).click();
    await page.getByRole('menuitemradio', { name: revision === 'latest' ? /^Draft$/ : new RegExp(`^r${revision} ·`) }).click();
}

test('report versions keep exact snapshots for viewing, export, restore and reload', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const old = makeDocument();
    let latest = { ...structuredClone(old), title: 'Latest report', revision: 2, content: { ...structuredClone(old.content), markdown: 'Latest content' } };
    const versions = [
        { revision: 2, source: 'user', createdAt: now },
        { revision: 1, source: 'agent', createdAt: now },
    ];
    let writes = 0;
    await page.route('**/api/work-documents/doc-report*', async route => {
        const revision = new URL(route.request().url()).searchParams.get('revision');
        if (route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON();
            expect(body).toEqual({ action: 'restore', revision: 1, expectedRevision: latest.revision });
            latest = { ...structuredClone(old), revision: latest.revision + 1 };
            versions.unshift({ revision: latest.revision, source: 'restore', createdAt: now });
            writes++;
        }
        return route.fulfill({ json: { document: revision ? old : latest, versions } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    await expect(page.getByRole('heading', { name: 'Latest report' })).toBeVisible();
    await selectReportVersion(page, 1);
    await expect(page).toHaveURL(/revision=1/);
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Monthly revenue' })).toBeVisible();
    expect(writes).toBe(0);
    await page.getByRole('button', { name: 'Evidence', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('September');
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'HTML', exact: true }).click();
    const stream = await (await download).createReadStream();
    let html = '';
    for await (const chunk of stream!) html += chunk.toString();
    expect(html).toContain('v1');
    expect(html).toContain('September');
    expect(html).not.toContain('Latest content');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('version-light.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('version-dark-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Draft');
    expect(writes).toBe(1);
    await selectReportVersion(page, 1);
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('version switching protects dirty edits and remains on the draft after a failed save', async ({ page }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const old = makeDocument();
    let latest = { ...structuredClone(old), title: 'Latest report', revision: 2 };
    let failSave = true;
    let writes = 0;
    const versions = [
        { revision: 2, source: 'user', createdAt: now },
        { revision: 1, source: 'agent', createdAt: now },
    ];
    await page.route('**/api/work-documents/doc-report*', async route => {
        if (route.request().method() === 'PATCH') {
            writes++;
            if (failSave) return route.fulfill({ status: 409, json: { error: 'Save conflict' } });
            const body = route.request().postDataJSON();
            latest = { ...latest, title: body.draft.title, revision: latest.revision + 1 };
            versions.unshift({ revision: latest.revision, source: 'user', createdAt: now });
        }
        return route.fulfill({ json: { document: new URL(route.request().url()).searchParams.has('revision') ? old : latest, versions } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsaved draft');
    await expect.poll(() => writes).toBe(1);
    await selectReportVersion(page, 1);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Unsaved draft');
    await selectReportVersion(page, 1);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save and continue', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/revision=/);
    failSave = false;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save and continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    expect(latest.title).toBe('Unsaved draft');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Back to latest', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    failSave = true;
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Discard me');
    await selectReportVersion(page, 1);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    expect(latest.title).toBe('Unsaved draft');
});

test('history requests cannot replace a newer selection and restore conflicts preserve the old snapshot', async ({ page }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const old = makeDocument();
    const second = { ...structuredClone(old), title: 'Second version', revision: 2 };
    let latest = { ...structuredClone(old), title: 'Latest report', revision: 3 };
    let releaseFirst: (() => void) | undefined;
    let failHistory = false;
    let conflict = true;
    let restoreCalls = 0;
    const versions = [3, 2, 1].map(revision => ({ revision, source: 'agent', createdAt: now }));
    await page.route('**/api/work-documents/doc-report*', async route => {
        const revision = new URL(route.request().url()).searchParams.get('revision');
        if (route.request().method() === 'PATCH') {
            restoreCalls++;
            if (conflict) {
                latest = { ...latest, revision: 4 };
                versions.unshift({ revision: 4, source: 'agent', createdAt: now });
                return route.fulfill({ status: 409, json: { error: 'Report changed. Reload the latest version before saving.' } });
            }
            expect(route.request().postDataJSON().expectedRevision).toBe(4);
            latest = { ...second, revision: 5 };
        }
        if (revision === '1') {
            if (failHistory) return route.fulfill({ status: 404, json: { error: 'Version not found.' } });
            await new Promise<void>(resolve => {
                releaseFirst = resolve;
            });
        }
        return route.fulfill({ json: { document: revision === '1' ? old : revision === '2' ? second : latest, versions } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    const url = `/${organization}/reports/doc-report`;
    await page.goto(url);
    await selectReportVersion(page, 1);
    await expect.poll(() => Boolean(releaseFirst)).toBe(true);
    await expect(page.getByTestId('work-markdown')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
    await selectReportVersion(page, 2);
    await expect(page.getByRole('heading', { name: 'Second version' })).toBeVisible();
    releaseFirst!();
    await expect(page.getByRole('heading', { name: 'Second version' })).toBeVisible();
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('Report changed');
    expect(restoreCalls).toBe(1);
    await expect(page.getByRole('heading', { name: 'Second version', includeHidden: true })).toBeVisible();
    conflict = false;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Draft');
    failHistory = true;
    await page.goto(url + '?revision=1');
    await expect(page.getByTestId('work-report').getByRole('alert')).toContainText('Version not found.');
    await expect(page.getByTestId('work-markdown')).toHaveCount(0);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Back to latest', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Second version' })).toBeVisible();
});

test('saved payment charts recover query rows and stay correct after reload', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [] } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/chat/run-activity?*', route => route.fulfill({ json: { work: null, events: [] } }));
    await page.route('**/api/chat/session/payment-chart', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'payment-chart', type: 'global', title: 'Payments' },
                    messages: [
                        { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Chart payment status' }] },
                        {
                            id: 'answer',
                            role: 'assistant',
                            parts: [
                                {
                                    type: 'tool-sqlRunner',
                                    toolCallId: 'sql-payments',
                                    state: 'output-available',
                                    input: { sql: 'SELECT status, count FROM payments' },
                                    output: {
                                        result: [
                                            { status: 'succeeded', count: 7829 },
                                            { status: 'failed', count: 375 },
                                        ],
                                        columns: [{ name: 'status' }, { name: 'count' }],
                                        rowCount: 2,
                                    },
                                },
                                {
                                    type: 'tool-chartBuilder',
                                    toolCallId: 'chart-payments',
                                    state: 'output-available',
                                    input: { chartType: 'bar' },
                                    output: {
                                        type: 'chart',
                                        chartType: 'bar',
                                        title: 'Payment status',
                                        xKey: 'status',
                                        yKeys: [{ key: 'count' }],
                                        data: [],
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        }),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=payment-chart&panel=closed`);
    for (let i = 0; i < 2; i++) {
        const bars = page.locator('.recharts-bar-rectangle path');
        await expect(bars).toHaveCount(2);
        await expect
            .poll(async () => {
                const grid = await page.locator('.recharts-cartesian-grid-horizontal line').evaluateAll(lines => lines.map(line => Number(line.getAttribute('y1'))));
                return Number(await bars.first().getAttribute('height')) / (Math.max(...grid) - Math.min(...grid));
            })
            .toBeCloseTo(7829 / 8000, 2);
        const heights = await bars.evaluateAll(elements => elements.map(element => Number(element.getAttribute('height'))));
        expect(heights[0] / heights[1]).toBeCloseTo(7829 / 375, 1);
        await expect(page.getByText('No query data is available for this chart.')).toHaveCount(0);
        if (i === 0) await page.reload();
    }
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('payment-chart.png') });
    await expectAppHealthy(appErrors);
});

test('selecting a different report clears the previous historical revision', async ({ page }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const first = { ...makeDocument(), revision: 2 };
    const second = { ...makeDocument(), id: 'doc-second', title: 'Another report', revision: 3 };
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [] } }));
    await page.route('**/api/chat/session/report-chat', route => route.fulfill({ json: { code: 0, data: { session: { id: 'report-chat', type: 'global' }, messages: [] } } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [first, second] } }));
    await page.route('**/api/work-documents/doc-*', route => {
        const url = new URL(route.request().url());
        const document = url.pathname.endsWith('doc-second') ? second : url.searchParams.has('revision') ? { ...first, revision: 1 } : first;
        if (document.id === second.id) expect(url.searchParams.has('revision')).toBe(false);
        return route.fulfill({ json: { document, versions: [document.id === second.id ? 3 : 2, 1].map(revision => ({ revision, source: 'agent', createdAt: now })) } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=report-chat&document=doc-report&panel=report&revision=1`);
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Historical r1');
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await page
        .getByRole('region', { name: 'Outputs', exact: true })
        .getByRole('button', { name: /^Another report Report/ })
        .click();
    await expect(page.getByRole('heading', { name: 'Another report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Draft');
    await expect(page).not.toHaveURL(/revision=/);
});

test('Agent references, attachments and per-turn reports survive history without consuming a reply draft', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = {
        id: 'composer-chat',
        title: 'Composer',
        type: 'global',
        connectionId: null,
        scope: { connectionIds: [connection.connection.id], databasesByConnection: { [connection.connection.id]: 'main' } },
    };
    const existingReport = { ...makeDocument(), id: 'existing-report', title: 'Existing report', chatId: 'other-chat', summary: 'Historical context' };
    let documents: Array<ReturnType<typeof makeDocument> & { sourceMessageId?: string; summary?: string }> = [];
    let messages: Array<{ id: string; role: string; parts: unknown[]; metadata?: Record<string, unknown> }> = [
        { id: 'first-question', role: 'user', parts: [{ type: 'text', text: 'Analyze orders' }] },
        { id: 'first-answer', role: 'assistant', parts: [{ type: 'text', text: 'The initial analysis is complete.' }] },
    ];
    const requests: Array<ChatContext & { messages: UIMessage[]; analysisScope: AnalysisScope }> = [];
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [{ id: connection.connection.id, name: 'Orders', type: 'postgres' }], models: [], sessions: [session] } }),
    );
    await page.route('**/api/chat/session/composer-chat', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents?*', route =>
        route.fulfill({ json: { documents: new URL(route.request().url()).searchParams.has('q') ? [existingReport] : documents } }),
    );
    await page.route('**/api/work-documents/doc-report*', route =>
        route.fulfill({ json: { document: documents[0], versions: [{ revision: 1, source: 'agent', createdAt: now }] } }),
    );
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        if (actionId === 'schema.listTables')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        tables: [
                            { name: 'public.orders', schema: 'public', label: '订单' },
                            { name: 'archive.orders', schema: 'archive', label: '订单' },
                        ],
                    },
                },
            });
        if (actionId === 'schema.listViews') return route.fulfill({ json: { ok: true, data: { views: [] } } });
        if (actionId === 'artifact.list')
            return route.fulfill({
                json: {
                    ok: true,
                    data: { rows: [{ id: 'artifact-reference', title: 'Saved query', type: 'result_set', status: 'ready', connectionName: 'Other source' }], total: 1 },
                },
            });
        return route.fallback();
    });
    await page.route('**/api/chat', async route => {
        const body = route.request().postDataJSON();
        requests.push(body);
        const user = body.messages.at(-1);
        const id = `answer-${requests.length}`;
        const text = body.outputIntent === 'report' ? 'Your new report is saved.' : 'The follow-up analysis is complete.';
        if (body.outputIntent === 'report')
            documents = [{ ...makeDocument(), chatId: session.id, sourceMessageId: body.sourceMessageId ?? user.id, summary: 'Revenue analysis summary.' }];
        messages = [...body.messages, { id, role: 'assistant', parts: [{ type: 'text', text }], metadata: { userMessageId: user.id } }];
        const chunks = [
            { type: 'start', messageId: id, messageMetadata: { userMessageId: user.id } },
            { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: text },
            { type: 'text-end', id: 'text' },
            { type: 'finish', finishReason: 'stop' },
        ];
        return route.fulfill({
            contentType: 'text/event-stream',
            headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
            body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=${session.id}`);
    const composer = page.getByTestId('agent-composer');
    const input = composer.getByRole('textbox');
    await expect(page.getByRole('button', { name: 'Generate report', exact: true })).toHaveCount(0);
    await expect(composer.getByRole('button', { name: 'Generate report', exact: true })).toHaveCount(0);
    await input.fill('@订单');
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: /Orders \/ main \/ public/ }).click();
    await expect(composer.getByRole('button', { name: 'Remove 订单', exact: true })).toBeVisible();
    await input.pressSequentially(' @Existing report');
    await page.getByRole('option', { name: /Existing report/ }).click();
    await input.pressSequentially(' @Saved query');
    await page.getByRole('option', { name: /Saved query/ }).click();
    await input.pressSequentially(' Summarize the selected context.');
    await composer
        .locator('input[type=file]')
        .first()
        .setInputFiles({ name: 'context.csv', mimeType: 'text/csv', buffer: Buffer.from('month,revenue\nOctober,42') });
    await expect(composer.getByText('context.csv', { exact: true })).toBeVisible();
    await composer.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Report · generate and save' }).click();
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Your new report is saved.', { exact: true })).toBeVisible();
    expect(requests[0].outputIntent).toBe('report');
    expect(requests[0].references.map((item: { kind: string }) => item.kind)).toEqual(['table', 'report', 'artifact']);
    expect(requests[0].references[0]).toMatchObject({ connectionId: connection.connection.id, database: 'main', schema: 'public', table: 'public.orders' });
    expect(requests[0].analysisScope.connectionIds).toEqual([connection.connection.id]);
    expect(requests[0].messages.at(-1)?.parts.find(part => part.type === 'file')?.url).toMatch(/^\/api\/chat\/attachments\//);
    await expect(composer.getByRole('button', { name: 'Remove Report' })).toHaveCount(0);
    const card = page.getByTestId('message-reports').getByRole('button', { name: /Revenue analysis.*Saved/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByTestId('work-report')).toBeVisible();
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await page.reload();
    await expect(card).toBeVisible();
    await expect(page.getByText('context.csv', { exact: true })).toBeVisible();
    await input.fill('Ask a follow-up question');
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('The follow-up analysis is complete.', { exact: true })).toBeVisible();
    expect(requests[1].outputIntent).toBe('answer');
    await input.fill('Keep this unsent draft');
    await expect(page.getByRole('button', { name: 'Generate report', exact: true })).toHaveCount(0);
    expect(requests.length).toBe(2);
    await expect(input).toHaveText('Keep this unsent draft');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('composer-reports.png'), animations: 'disabled' });
    await expectAppHealthy(appErrors);
});

test('automatic sources and knowledge allow attachment-only messages, preserve failed uploads and reset new chats', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [], models: [{ id: 'k', name: 'Shared definitions', connectionIds: [] }], sessions: [] } }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    let uploadFailed = true;
    let uploads = 0;
    await page.route('**/api/chat/attachments', route => {
        uploads += 1;
        return uploadFailed ? route.fulfill({ status: 400, json: { error: 'Upload interrupted; retry' } }) : route.fallback();
    });
    let submitted: { analysisScope: AnalysisScope; messages: UIMessage[] } | undefined;
    await page.route('**/api/chat', async route => {
        submitted = route.request().postDataJSON();
        return route.fulfill({ status: 400, body: 'Model unavailable; draft kept' });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    const composer = page.getByTestId('agent-composer');
    const sources = page.getByRole('button', { name: 'Data sources', exact: true });
    const knowledge = page.getByRole('button', { name: 'Knowledge', exact: true });
    await expect(sources).toHaveText('Auto');
    await expect(knowledge).toHaveText('Auto');
    await expect(page.getByText('Select at least one data source')).toHaveCount(0);
    await knowledge.click();
    await page.getByRole('option', { name: 'Shared definitions', exact: true }).click();
    await expect(sources).toHaveText('Auto');
    await knowledge.click();
    await page.getByRole('option', { name: 'Auto', exact: true }).click();
    await composer
        .locator('input[type=file]')
        .first()
        .setInputFiles({ name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.from('中文数据\n'.repeat(100000)) });
    await expect(composer.getByText('large.csv', { exact: true })).toBeVisible();
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(composer.getByText('Upload interrupted; retry')).toBeVisible();
    expect(submitted).toBeUndefined();
    uploadFailed = false;
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => submitted?.analysisScope).toMatchObject({ connectionIds: [], connectionMode: 'auto', knowledgeMode: 'auto' });
    const file = submitted!.messages.at(-1)!.parts.find(part => part.type === 'file')!;
    expect(file.url).toMatch(/^\/api\/chat\/attachments\//);
    expect(JSON.stringify(submitted).length).toBeLessThan(10000);
    await expect(page.getByText('Model unavailable; draft kept')).toBeVisible();
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => uploads).toBe(2);
    await expect(composer.getByText('large.csv', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('auto-large-attachment.png'), animations: 'disabled' });
    await expectAppHealthy(appErrors);
});

test('automatic table references keep source identity and Knowledge replaces sources with automatic databases', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [
                    { id: 'conn-1', name: 'Orders', type: 'postgres' },
                    { id: 'ads', name: 'Advertising', type: 'postgres' },
                ],
                models: [{ id: 'commerce', name: 'Commerce', connectionIds: ['ads'] }],
                sessions: [],
            },
        }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'schema.listTables')
            return route.fulfill({
                json: { ok: true, data: { tables: input.database === 'main' ? [{ name: 'orders', value: 'public.orders', schema: 'public', label: '订单' }] : [] } },
            });
        if (actionId === 'schema.listViews') return route.fulfill({ json: { ok: true, data: { views: [] } } });
        if (actionId === 'artifact.list') return route.fulfill({ json: { ok: true, data: { rows: [] } } });
        return route.fallback();
    });
    let request: { analysisScope: AnalysisScope; references: Array<{ connectionId: string; database: string }> } | undefined;
    await page.route('**/api/chat', route => {
        request = route.request().postDataJSON();
        return route.fulfill({ status: 400, body: 'Test model unavailable' });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    const composer = page.getByTestId('agent-composer');
    await composer.getByRole('textbox').fill('@订单');
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: /Advertising/ }).click();
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => request?.references[0]).toMatchObject({ connectionId: 'ads', database: 'main' });
    expect(request?.analysisScope).toMatchObject({ connectionMode: 'auto', connectionIds: [] });
    await expect(page.getByText('Test model unavailable')).toBeVisible();
    expect(
        await page.evaluate(() =>
            Object.keys(localStorage)
                .filter(key => key.startsWith('dory:recent-references:v1:'))
                .some(key => JSON.parse(localStorage.getItem(key) ?? '[]').length > 0),
        ),
    ).toBe(false);
    await toggleSource(page, 'Orders');
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
    await page.getByRole('option', { name: 'Commerce', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toHaveText('1 source · automatic databases');
    await expectAppHealthy(appErrors);
});

test('Knowledge linkage resets databases, preserves manual additions, and limits table references', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [
                    { id: 'conn-1', name: 'Orders', type: 'postgres', defaultDatabase: 'main' },
                    { id: 'ads', name: 'Advertising', type: 'postgres' },
                ],
                models: [
                    { id: 'commerce', name: 'Commerce', connectionIds: ['conn-1', 'ads'] },
                    { id: 'ads-model', name: 'Campaigns', connectionIds: ['ads'] },
                    { id: 'empty', name: 'General definitions', connectionIds: [] },
                    { id: 'missing', name: 'Unavailable Knowledge', connectionIds: ['missing'] },
                    { id: 'excess', name: 'Excess sources', connectionIds: Array.from({ length: 13 }, (_, i) => `source-${i}`) },
                ],
                sessions: [],
            },
        }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/actions/execute', route => {
        const { actionId } = route.request().postDataJSON();
        if (actionId === 'schema.listTables')
            return route.fulfill({ json: { ok: true, data: { tables: [{ name: 'orders', value: 'public.orders', schema: 'public', label: '订单' }] } } });
        if (actionId === 'schema.listViews') return route.fulfill({ json: { ok: true, data: { views: [] } } });
        return route.fallback();
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    const sources = page.getByRole('button', { name: 'Data sources', exact: true });
    const databases = page.getByRole('button', { name: 'Data sources', exact: true });
    const chooseKnowledge = async (name: string) => {
        await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
        await page.getByRole('option', { name, exact: true }).click();
    };
    await toggleSource(page, 'Orders');
    await expect(databases).toHaveText('1 source · automatic databases');
    const composer = page.getByTestId('agent-composer');
    await composer.getByRole('textbox').fill('@订单');
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: /Orders.*analytics/ }).click();
    await expect(composer.getByRole('button', { name: 'Remove 订单' })).toBeVisible();
    await databases.click();
    await page.getByRole('option', { name: 'Orders: main', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(composer.getByRole('button', { name: 'Remove 订单' })).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(composer.getByRole('alert')).toContainText('outside the selected data sources');
    await composer.getByRole('button', { name: 'Remove 订单' }).click();
    await composer.getByRole('textbox').fill('@订单');
    await expect(page.getByRole('option')).toHaveCount(1);
    await composer.getByRole('textbox').fill('Analyze');
    await toggleSource(page, 'Advertising');
    await databases.click();
    await expect(page.getByRole('option', { name: 'Orders: main', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Advertising: Automatic databases', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.reload();
    await databases.click();
    await expect(page.getByRole('option', { name: 'Orders: main', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Advertising: Automatic databases', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await chooseKnowledge('Commerce');
    await expect(databases).toHaveText('2 sources · automatic databases');
    await chooseKnowledge('Campaigns');
    await expect(sources).toHaveText('1 source · automatic databases');
    await chooseKnowledge('Auto');
    await expect(sources).toHaveText('1 source · automatic databases');
    await chooseKnowledge('No Knowledge');
    await expect(sources).toHaveText('1 source · automatic databases');
    await chooseKnowledge('General definitions');
    await expect(sources).toHaveText('Auto');
    await chooseKnowledge('Unavailable Knowledge');
    await expect(page.getByRole('alert').filter({ hasText: 'unavailable' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sources).toHaveText('Auto');
    await chooseKnowledge('Excess sources');
    await expect(page.getByRole('alert').filter({ hasText: '12' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectAppHealthy(appErrors);
});

test('an existing Artifact can be analyzed in chat without saving conclusions, including after reload', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = { id: 'artifact-analysis', title: 'Analyze saved orders', type: 'global', connectionId: null, scope: { connectionMode: 'auto', connectionIds: [] } };
    let messages: Array<{ id: string; role: string; parts: unknown[]; metadata?: Record<string, unknown> }> = [];
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [session] } }));
    await page.route('**/api/chat/session/artifact-analysis', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/actions/execute', route =>
        route.request().postDataJSON().actionId === 'artifact.list'
            ? route.fulfill({
                  json: { ok: true, data: { rows: [{ id: 'existing-orders', title: 'Orders — total orders', type: 'result_set', status: 'ready', connectionName: 'Orders' }] } },
              })
            : route.fallback(),
    );
    const metadata = { agentRunId: 'run-orders', requestId: 'orders-turn', summarySaved: false };
    await page.route('**/api/chat/run-activity?*', route =>
        route.fulfill({
            json: {
                work: { workId: 'run-orders', status: 'completed', metadata: { chatTurn: { requestId: 'orders-turn', outcome: 'completed' } } },
                events: [{ eventId: 'read-orders', toolName: 'dory_artifacts', status: 'success', inputSummary: { requestId: 'orders-turn', artifactId: 'existing-orders' } }],
                runHref: '/agent-runs/run-orders',
                workspaceHref: null,
            },
        }),
    );
    const answer = '已有查询结果显示订单总数为 42；这是原查询的历史结果。';
    await page.route('**/api/chat', route => {
        const body = route.request().postDataJSON();
        expect(body.outputIntent).toBe('answer');
        expect(body.references).toEqual([{ kind: 'artifact', id: 'existing-orders', title: 'Orders — total orders' }]);
        messages = [
            ...body.messages.slice(0, -1),
            { ...body.messages.at(-1), metadata: { references: body.references } },
            { id: 'orders-answer', role: 'assistant', parts: [{ type: 'text', text: answer }], metadata },
        ];
        const chunks = [
            { type: 'start', messageId: 'orders-answer', messageMetadata: metadata },
            { type: 'text-start', id: 'answer' },
            { type: 'text-delta', id: 'answer', delta: answer },
            { type: 'text-end', id: 'answer' },
            { type: 'finish', finishReason: 'stop' },
        ];
        return route.fulfill({
            contentType: 'text/event-stream',
            headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
            body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=${session.id}`);
    const composer = page.getByTestId('agent-composer');
    await composer.getByRole('textbox').fill('@Orders — total orders');
    await page.getByRole('option', { name: /Orders — total orders/ }).click();
    await composer.getByRole('textbox').pressSequentially('帮我分析这个查询结果');
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await page.getByTestId('chat-analysis-process').locator('summary').first().click();
    await expect(page.locator('[data-tool-name="readArtifact"]')).toHaveCount(1);
    await expect(page.locator('[data-tool-name="finishAnalysis"]')).toHaveCount(0);
    await expect(page.getByText('Conclusions are not fully saved.', { exact: false })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(page.getByText('@Orders — total orders', { exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('artifact-analysis-without-saving.png') });
    await expect(page.locator('[data-tool-name="finishAnalysis"]')).toHaveCount(0);
    await expectAppHealthy(appErrors);
});

test('completed answers omit redundant status cards before and after reload', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = { id: 'completed-chat', title: 'Completed analysis', type: 'global', connectionId: null };
    const messages = [
        { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Summarize the data' }] },
        {
            id: 'answer',
            role: 'assistant',
            parts: [{ type: 'text', text: 'The analysis is complete and the answer is available.' }],
            metadata: { userMessageId: 'request', completion: { status: 'completed', completed: [], unfinished: [], canContinue: false } },
        },
    ];
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [session] } }));
    await page.route('**/api/chat/session/completed-chat', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=completed-chat&panel=closed`);
    for (let i = 0; i < 2; i++) {
        await expect(page.getByText('The analysis is complete and the answer is available.', { exact: true })).toBeVisible();
        await expect(page.getByTestId('chat-completion')).toHaveCount(0);
        if (i === 0) await page.reload();
    }
    await expectAppHealthy(appErrors);
});

test('one report generation displays v1 across cards, completion and history despite five internal saves', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = { id: 'version-chat', title: 'Key Findings Report', type: 'global', connectionId: null };
    const document = { ...makeDocument(), chatId: session.id, revision: 5, version: 1, sourceMessageId: 'version-request' };
    const versions = [{ revision: 5, version: 1, source: 'agent', createdAt: now }];
    const messages = [
        { id: 'version-request', role: 'user', parts: [{ type: 'text', text: 'Generate a report' }] },
        {
            id: 'version-answer',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Your report is saved.' }],
            metadata: {
                userMessageId: 'version-request',
                // Legacy completions have only the internal revision.
                completion: { status: 'completed', completed: [], unfinished: [], report: { documentId: document.id, revision: 5, saved: true }, canContinue: false },
            },
        },
    ];
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [session] } }));
    await page.route('**/api/chat/session/version-chat', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [document] } }));
    await page.route('**/api/work-documents/doc-report*', route => route.fulfill({ json: { document, versions } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=${session.id}&panel=closed`);
    for (let i = 0; i < 2; i++) {
        await expect(page.getByTestId('message-reports')).toContainText('v1');
        await expect(page.getByTestId('chat-completion')).toContainText('Report saved · v1');
        await expect(page.getByTestId('message-reports')).not.toContainText('v5');
        if (i === 0) await page.reload();
    }
    await page.goto(`/${organization}/reports/${document.id}`);
    const selector = page.getByRole('button', { name: 'Report versions', exact: true });
    await expect(selector).toHaveText('Draft');
    await selector.click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(2);
    await expect(page.getByRole('menuitemradio').filter({ hasText: 'r5' })).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('partial completion preserves the answer, resumes a new request and survives reload', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = { id: 'recovery-chat', title: 'CSV analysis', type: 'global', connectionId: null };
    const completion = {
        status: 'partial',
        completed: ['queryAttachment'],
        unfinished: ['REPORT_NOT_SAVED', 'CHART_NOT_CREATED'],
        report: { documentId: 'doc-report', revision: 1, saved: false },
        canContinue: true,
    };
    const messages = [
        { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Add a pie chart to the report' }] },
        { id: 'partial-answer', role: 'assistant', parts: [{ type: 'text', text: 'Verified full-data activity: 25.6%.' }], metadata: { userMessageId: 'request', completion } },
    ];
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [session] } }));
    await page.route('**/api/chat/session/recovery-chat', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    let resumed: Record<string, unknown> | undefined;
    await page.route('**/api/chat', route => {
        resumed = route.request().postDataJSON();
        return route.fulfill({
            contentType: 'text/event-stream',
            headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
            body: 'data: {"type":"start","messageId":"resumed-answer"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=recovery-chat&panel=closed`);
    const card = page.getByTestId('chat-completion');
    for (let i = 0; i < 2; i++) {
        await expect(card).toContainText('Partially completed');
        await expect(page.getByText('Verified full-data activity: 25.6%.', { exact: true })).toBeVisible();
        await expect(page.getByText(/has not returned usable content/)).toHaveCount(0);
        await expect(card.getByRole('button', { name: 'View report', exact: true })).toBeVisible();
        if (i === 0) await page.reload();
    }
    await card.locator('summary').click();
    await expect(card).toContainText('has not been saved');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('partial-completion-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.getByRole('button', { name: 'Continue unfinished steps' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => resumed?.resumeMessageId).toBe('partial-answer');
    expect((resumed?.messages as UIMessage[]).at(-1)?.id).not.toBe('request');
    await expectAppHealthy(appErrors);
});

test('report pie charts retain source values on screen, after reload and in HTML export', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const document = makeDocument();
    document.content.visuals[0].chart.type = 'pie';
    document.content.evidence[0].rows = [
        { month: 'Active', revenue: 6400 },
        { month: 'Inactive', revenue: 18600 },
    ];
    await page.route('**/api/work-documents/doc-report', route => route.fulfill({ json: { document, versions: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report`);
    for (let i = 0; i < 2; i++) {
        await expect(page.locator('[data-chart-type="pie"]')).toBeVisible();
        await expect(page.locator('[data-chart-type="pie"]')).toContainText('25.6%');
        if (i === 0) await page.reload();
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'HTML', exact: true }).click();
    const stream = await (await download).createReadStream();
    let html = '';
    for await (const chunk of stream!) html += chunk.toString();
    expect(html).toContain('data-chart-type="pie"');
    expect(html).toContain('6400');
    expect(html).toContain('25.6%');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-chart-type="pie"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('report-pie-print.png'), fullPage: true });
    await expectAppHealthy(appErrors);
});

test('work resources prioritize deduplicated outputs and refresh collapsed execution counts after partial failures', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    let failed = true;
    let finished = false;
    const report = { ...makeDocument(), revision: 5, sourceMessageId: 'earlier-turn' };
    const olderReport = { ...report, id: 'older-report', title: 'Earlier draft', status: 'draft', revision: 2, updatedAt: '2026-10-21T10:00:00Z' };
    const result = { id: 'output-result', type: 'result_set', title: 'Monthly revenue', status: 'ready', rowCount: 12, createdAt: now, updatedAt: now };
    const chart = { ...result, id: 'output-chart', type: 'chart', title: 'Revenue trend', updatedAt: '2026-10-24T10:00:00Z' };
    const file = { ...result, id: 'output-file', type: 'file', title: 'Revenue export', fileFormat: 'csv', status: 'unavailable' };
    const query = {
        session: { sessionId: 'shared-session', sqlText: 'SELECT revenue FROM orders', database: 'sales', status: 'success', startedAt: now },
        queryResultSets: [{ rowCount: 12 }],
        results: [],
    };
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [] } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [olderReport, report, report] } }));
    await page.route('**/api/chat/session/resources-chat', route =>
        route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id: 'resources-chat', type: 'global', title: 'Revenue' },
                    messages: ['run-main', 'run-more', 'run-empty', 'run-main'].map((agentRunId, index) => ({
                        id: `message-${index}`,
                        role: 'assistant',
                        parts: [{ type: 'text', text: `Analysis ${index}` }],
                        metadata: { agentRunId },
                    })),
                },
            },
        }),
    );
    await page.route('**/api/chat/run-activity?*', route => {
        const id = new URL(route.request().url()).searchParams.get('workId');
        return route.fulfill({
            json: { work: { workId: id, title: id === 'run-empty' ? 'Planning only' : 'Revenue analysis', status: id === 'run-more' ? 'active' : 'completed' } },
        });
    });
    await page.route('**/api/works/run-main/snapshot', route => route.fulfill({ json: { data: { snapshot: { sessions: [query, query] }, artifacts: [result, file, result] } } }));
    await page.route('**/api/works/run-empty/snapshot', route => route.fulfill({ json: { data: { snapshot: { sessions: [] }, artifacts: [] } } }));
    await page.route('**/api/works/run-more/snapshot', route =>
        failed
            ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
            : route.fulfill({
                  json: {
                      data: {
                          snapshot: {
                              sessions: [
                                  { ...query, session: { ...query.session, status: finished ? 'success' : 'running', startedAt: '2026-10-24T10:00:00Z' } },
                                  { ...query, session: { ...query.session, sessionId: 'failed-query', sqlText: 'SELECT missing_column', status: 'error' } },
                                  { ...query, session: { ...query.session, sessionId: 'unknown-query', sqlText: 'SELECT unknown_status', status: 'cancelled' } },
                              ],
                          },
                          artifacts: [chart, result],
                      },
                  },
              }),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=resources-chat`);
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    const outputs = page.getByRole('region', { name: 'Outputs', exact: true });
    const executions = page.getByRole('region', { name: 'Executions', exact: true });
    const toggle = executions.getByRole('button', { name: /^Executions/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(outputs.getByTestId('outputs-count')).toHaveText('4');
    await expect(outputs).toContainText('Count includes loaded items only.');
    await expect(outputs.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(outputs.getByTestId('resource-output')).toHaveCount(4);
    await expect(page.getByTestId('executions-count')).toHaveText('1');
    failed = false;
    await outputs.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(outputs.getByTestId('outputs-count')).toHaveText('5');
    await expect(outputs.getByRole('alert')).toHaveCount(0);
    await expect(outputs).not.toContainText('Count includes loaded items only.');
    const cards = outputs.getByTestId('resource-output');
    await expect(cards).toHaveCount(5);
    await expect(cards.nth(0)).toContainText('Revenue analysis');
    await expect(cards.nth(0)).toContainText('v5');
    await expect(cards.nth(0)).toContainText('Report · Updated');
    await expect(cards.nth(1)).toContainText('Earlier draft');
    await expect(cards.nth(1)).toContainText('Draft');
    await expect(cards.nth(2)).toContainText('Revenue trend');
    await expect(cards.nth(2)).toContainText('Chart · 12 rows');
    await expect(outputs.getByRole('button', { name: /Monthly revenue/ })).toContainText('Result Set · 12 rows');
    await expect(outputs.getByRole('button', { name: /Revenue export/ })).toContainText('CSV · Unavailable');
    await expect(page.getByTestId('executions-count')).toHaveText('4');
    await expect(page.getByTestId('execution-summary')).toHaveText('SQL Queries · Running 1 · Failed 1 · Completed 1 · Status unavailable 1');
    finished = true;
    await expect(page.getByTestId('execution-summary')).toHaveText('SQL Queries · Failed 1 · Completed 2 · Status unavailable 1');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: testInfo.outputPath('resources-outputs-light.png'), animations: 'disabled' });
    await toggle.click();
    await expect(page.getByTestId('resource-queries').getByRole('button')).toHaveCount(4);
    await expect(executions.getByRole('link', { name: 'Agent Run · Planning only' })).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('resource-queries').getByRole('button').first()).toContainText('SELECT revenue');
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await page.getByText('Toggle theme', { exact: true }).click();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: testInfo.outputPath('resources-outputs-dark.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = (await page.getByTestId('agent-resources').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('resources-outputs-mobile.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Work resources', exact: true })).toBeFocused();
    await expectAppHealthy(appErrors);
});

test('work resources handle empty and execution-only conversations and reset expansion on conversation changes', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [],
                models: [],
                sessions: [
                    { id: 'empty-resources', title: 'Empty conversation', createdAt: now, updatedAt: now },
                    { id: 'execution-resources', title: 'Execution conversation', createdAt: now, updatedAt: now },
                ],
            },
        }),
    );
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
    await page.route('**/api/chat/session/*-resources', route => {
        const id = new URL(route.request().url()).pathname.split('/').pop();
        return route.fulfill({
            json: {
                code: 0,
                data: {
                    session: { id, type: 'global', title: id },
                    messages:
                        id === 'empty-resources'
                            ? []
                            : [{ id: 'execution-message', role: 'assistant', parts: [{ type: 'text', text: 'Query failed.' }], metadata: { agentRunId: 'run-only' } }],
                },
            },
        });
    });
    await page.route('**/api/chat/run-activity?*', route => route.fulfill({ json: { work: { workId: 'run-only', title: 'SQL only', status: 'error' } } }));
    await page.route('**/api/works/run-only/snapshot', route =>
        route.fulfill({
            json: {
                data: {
                    snapshot: {
                        sessions: [
                            {
                                session: { sessionId: 'only-query', sqlText: 'SELECT missing_table', database: 'sales', status: 'error', startedAt: now },
                                queryResultSets: [],
                                results: [],
                            },
                        ],
                    },
                    artifacts: [],
                },
            },
        }),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=empty-resources`);
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Outputs', exact: true })).toContainText('No outputs yet.');
    await expect(page.getByTestId('outputs-count')).toHaveText('0');
    await expect(page.getByTestId('executions-count')).toHaveText('0');
    await page.getByRole('button', { name: /^Executions/ }).click();
    await expect(page.getByRole('region', { name: 'Executions', exact: true })).toContainText('No queries yet.');
    await page.getByRole('button', { name: /^Execution conversation/ }).click();
    await page.getByRole('button', { name: 'Work resources', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Executions/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Outputs', exact: true })).toContainText('No outputs yet.');
    await expect(page.getByTestId('executions-count')).toHaveText('1');
    await expect(page.getByTestId('execution-summary')).toHaveText('SQL Queries · Failed 1');
    await page.getByRole('button', { name: /^Executions/ }).click();
    await expect(page.getByTestId('resource-queries').getByRole('button')).toContainText('SELECT missing_table');
    await expectAppHealthy(appErrors);
});

test('unified Data Sources supports database multi-select, full-group selection, keyboard search and restoration', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    let names = ['main', 'analytics'];
    let databaseLoads = 0;
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'schema.listDatabases') {
            databaseLoads += 1;
            return route.fulfill({ json: { ok: true, data: { databases: names.map(value => ({ value, label: value })) } } });
        }
        if (actionId === 'schema.listTables')
            return route.fulfill({ json: { ok: true, data: { tables: [{ name: 'orders', value: 'orders', label: `Orders in ${input.database}` }] } } });
        if (actionId === 'schema.listViews') return route.fulfill({ json: { ok: true, data: { views: [] } } });
        if (actionId === 'artifact.list') return route.fulfill({ json: { ok: true, data: { rows: [], total: 0 } } });
        return route.fallback();
    });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: [
                    { id: 'conn-1', name: 'Orders', type: 'postgres' },
                    { id: 'ads', name: 'Advertising', type: 'postgres' },
                ],
                models: [],
                sessions: [],
            },
        }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work`);
    const picker = page.getByTestId('agent-scope-picker');
    await expect(picker.getByRole('button')).toHaveCount(2);
    await expect(picker.getByRole('button').nth(0)).toHaveAttribute('aria-label', 'Knowledge');
    await expect(picker.getByRole('button').nth(1)).toHaveAttribute('aria-label', 'Data sources');
    expect(databaseLoads).toBe(0);
    const sources = page.getByRole('button', { name: 'Data sources', exact: true });
    await sources.click();
    const search = page.getByPlaceholder('Search data sources or databases…');
    await expect(page.getByRole('option', { name: 'Orders: analytics', exact: true })).toBeVisible();
    await search.fill('MAIN');
    await expect(page.getByRole('option', { name: 'Orders: analytics', exact: true })).toHaveCount(0);
    // Select all includes analytics even while search hides it.
    await page.getByRole('button', { name: 'Orders: Select all', exact: true }).click();
    await search.fill('orders');
    await expect(page.getByRole('option', { name: 'Orders: main', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Orders: analytics', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Advertising: main', exact: true })).toHaveCount(0);
    await search.fill('analytics');
    await search.press('End');
    await search.press('Enter');
    await expect(page.getByRole('option', { name: 'Advertising: analytics', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(sources).toHaveText('3 databases');
    await search.fill('does not exist');
    await expect(page.getByText('No results', { exact: true })).toBeVisible();
    await search.fill('');
    await page.screenshot({ path: testInfo.outputPath('data-sources-multi-light.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    const question = page.getByTestId('agent-composer').getByRole('textbox');
    await question.fill('@Orders');
    await expect(page.getByRole('option')).toHaveCount(3);
    await question.fill('Compare selected databases');
    names = ['main', 'analytics', 'new_database'];
    await page.reload();
    await sources.click();
    await expect(page.getByRole('option', { name: 'Orders: analytics', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Orders: new_database', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('option', { name: 'Advertising: analytics', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
    });
    await page.setViewportSize({ width: 600, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('data-sources-multi-dark-narrow.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Orders: Select all', exact: true }).click();
    await page.getByRole('button', { name: 'Orders: Clear', exact: true }).click();
    await page.getByRole('option', { name: 'Advertising: analytics', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Auto', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(sources).toHaveText('Auto');
    await page.getByRole('option', { name: 'Orders: main', exact: true }).click();
    await page.getByRole('option', { name: 'Auto', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Orders: main', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expectAppHealthy(appErrors);
});

test('unified Data Sources enforces source limits and preserves unavailable database selections', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route =>
        route.fulfill({
            json: {
                connections: Array.from({ length: 13 }, (_, index) => ({ id: `source-${index}`, name: `Source ${index}`, type: 'postgres' })),
                models: [],
                sessions: [],
            },
        }),
    );
    await page.route('**/api/work-documents**', route => route.fulfill({ json: { documents: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    const ids = Array.from({ length: 12 }, (_, index) => `source-${index}`).join(',');
    await page.goto(`/${organization}/work?sources=${ids}&databases=${encodeURIComponent(JSON.stringify({ 'source-0': ['deleted'] }))}`);
    await page.getByTestId('agent-composer').getByRole('textbox').fill('Analyze');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Source 0: deleted', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('option', { name: 'Source 12: main', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('option', { name: 'Source 0: deleted', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Source 12: main', exact: true })).toHaveAttribute('aria-disabled', 'false');
    await page.getByRole('option', { name: 'Source 12: main', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await expectAppHealthy(appErrors);
});

test('Resource Mention Picker keeps inline identity, ranked results, pinned versions and local recents', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const session = {
        id: 'mention-picker',
        title: 'Mentions',
        type: 'global',
        connectionId: null,
        scope: { connectionIds: [connection.connection.id], databasesByConnection: { [connection.connection.id]: 'main' } },
    };
    const document = { ...makeDocument(), id: 'mention-report', title: 'orders', revision: 6, chatId: session.id };
    let messages: UIMessage[] = [{ id: 'intro', role: 'assistant', parts: [{ type: 'text', text: 'Ready to compare resources.' }] }];
    let submitted: ChatContext & { messages: UIMessage[]; analysisScope: AnalysisScope };
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [{ id: connection.connection.id, name: 'Orders', type: 'postgres' }], models: [], sessions: [session] } }),
    );
    await page.route('**/api/chat/session/mention-picker', route => route.fulfill({ json: { code: 0, data: { session, messages } } }));
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [document] } }));
    await page.route('**/api/work-documents/mention-report?*', route =>
        route.fulfill({
            json: {
                document: { ...document, revision: Number(new URL(route.request().url()).searchParams.get('revision') ?? document.revision) },
                versions: [{ revision: 6 }, { revision: 7 }],
            },
        }),
    );
    await page.route('**/api/actions/execute', async route => {
        const { actionId } = route.request().postDataJSON();
        if (actionId === 'schema.listTables')
            return route.fulfill({ json: { ok: true, data: { tables: [{ name: 'orders', value: 'orders', label: 'orders', schema: 'public' }] } } });
        if (actionId === 'schema.listViews') return route.fulfill({ json: { ok: true, data: { views: [] } } });
        if (actionId === 'artifact.list')
            return route.fulfill({
                json: { ok: true, data: { rows: [{ id: 'orders-result', title: 'orders by month', type: 'result_set', status: 'ready', rowCount: 12, createdAt: now }] } },
            });
        return route.fallback();
    });
    await page.route('**/api/chat', route => {
        submitted = route.request().postDataJSON();
        messages = [...submitted.messages, { id: 'reply', role: 'assistant', parts: [{ type: 'text', text: 'Compared the pinned report with the table.' }] }];
        const chunks = [
            { type: 'start', messageId: 'reply' },
            { type: 'text-start', id: 'answer' },
            { type: 'text-delta', id: 'answer', delta: 'Compared the pinned report with the table.' },
            { type: 'text-end', id: 'answer' },
            { type: 'finish', finishReason: 'stop' },
        ];
        return route.fulfill({
            contentType: 'text/event-stream',
            headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
            body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/work?chat=${session.id}`);
    const composer = page.getByTestId('agent-composer');
    const input = composer.getByRole('textbox');
    await composer.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Reference a resource' }).click();
    await expect(input).toHaveText('@');
    await expect(input).toBeFocused();
    const picker = page.getByRole('listbox', { name: 'References' });
    await expect(picker.getByText('Current Work', { exact: true })).toBeVisible();
    await expect(picker.getByRole('option', { name: /orders.*Report/ })).toBeVisible();
    const box = await picker.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(440);
    await page.screenshot({ path: testInfo.outputPath('mention-default-light.png'), animations: 'disabled' });
    await input.fill('📈 对比 @orders');
    await expect(picker.getByRole('option')).toHaveCount(3);
    await expect(picker.getByRole('option').first()).toContainText('Report · v6');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await expect(composer.getByTestId('mention-chip')).toHaveCount(0);
    await input.press('Enter');
    await expect(composer.getByTestId('mention-chip')).toHaveCount(1);
    await expect(input).toContainText('📈 对比');
    await expect(input).toContainText('v6');
    await input.pressSequentially('和 @orders');
    await expect(picker.getByRole('option')).toHaveCount(3);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(composer.getByTestId('mention-chip')).toHaveCount(2);
    await composer.getByRole('button', { name: 'Remove orders', exact: true }).last().click();
    await expect(composer.getByTestId('mention-chip')).toHaveCount(1);
    await input.press('ControlOrMeta+z');
    await expect(composer.getByTestId('mention-chip')).toHaveCount(2);
    await input.press('ControlOrMeta+End');
    await input.pressSequentially('检查收入。');
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Compared the pinned report with the table.', { exact: true })).toBeVisible();
    expect(submitted!.references[0]).toMatchObject({ kind: 'report', id: document.id, revision: 6 });
    expect(submitted!.references[1]).toMatchObject({ kind: 'table', table: 'orders' });
    expect(submitted!.mentionSpans).toHaveLength(2);
    expect(submitted!.analysisScope.connectionIds).toEqual([connection.connection.id]);
    await expect(page.getByTestId('message-mention')).toHaveCount(2);
    await expect(input).toBeEmpty();
    await expect
        .poll(() =>
            page.evaluate(() =>
                Object.keys(localStorage)
                    .filter(key => key.startsWith('dory:recent-references:v1:'))
                    .some(key => JSON.parse(localStorage.getItem(key) ?? '[]').length === 2),
            ),
        )
        .toBe(true);
    await page.reload();
    await expect(page.getByTestId('message-mention')).toHaveCount(2);
    await input.fill('@');
    await expect(picker.getByText('Recently referenced', { exact: true })).toBeVisible();
    await expect(picker.getByRole('option', { name: /orders.*Orders \/ main/ })).toBeVisible();
    await input.press('Escape');
    await expect(picker).toBeHidden();
    await input.fill('@nothing-matches');
    await expect(picker.getByRole('status')).toContainText('No matching resources');
    await input.press('Enter');
    await expect(input).toHaveText('@nothing-matches');
    await input.fill('');
    const clipboard = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        const span = window.document.createElement('span');
        span.setAttribute('data-dory-reference', JSON.stringify({ kind: 'report', id: 'unknown-report', title: 'Forged', revision: 99 }));
        span.textContent = '@Forged · v99';
        data.setData('text/html', span.outerHTML);
        data.setData('text/plain', '@Forged · v99');
        return data;
    });
    await input.evaluate((element, data) => element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })), clipboard);
    await expect(input).toHaveText('@Forged · v99');
    await expect(composer.getByTestId('mention-chip')).toHaveCount(0);
    await clipboard.dispose();
    await input.fill('@orders');
    await expect(picker.getByRole('option')).toHaveCount(3);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(picker).toBeVisible();
    const small = await picker.boundingBox();
    expect(small!.width).toBeLessThanOrEqual(366);
    expect(small!.x).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('mention-search-dark-narrow.png'), animations: 'disabled' });
    document.revision = 7;
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route('**/api/chat/session/other-mention', route =>
        route.fulfill({ json: { code: 0, data: { session: { ...session, id: 'other-mention', title: 'Other Work' }, messages: [] } } }),
    );
    await page.goto(`/${organization}/work?chat=other-mention`);
    await input.fill('@');
    await expect(picker.getByText('Current Work', { exact: true })).toHaveCount(0);
    await expect(picker.getByText('Recently referenced', { exact: true })).toBeVisible();
    await expect(picker.getByRole('option', { name: /Report · v6/ })).toBeVisible();
    await expect(picker.getByRole('option', { name: /Report · v7/ })).toHaveCount(0);
    await picker.getByRole('option', { name: /Report · v6/ }).click();
    await expect(composer.getByTestId('mention-chip')).toContainText('v6');
    const knownClipboard = await page.evaluateHandle(
        ref => {
            const data = new DataTransfer();
            const element = window.document.createElement('span');
            element.setAttribute('data-dory-reference', JSON.stringify(ref));
            element.textContent = '@orders · v6';
            data.setData('text/html', element.outerHTML);
            data.setData('text/plain', element.textContent);
            return data;
        },
        { kind: 'report', id: document.id, title: 'orders', revision: 6 },
    );
    await input.evaluate((element, data) => element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })), knownClipboard);
    await expect(composer.getByTestId('mention-chip')).toHaveCount(2);
    await knownClipboard.dispose();
    await expectAppHealthy(appErrors);
});

test('Reports library filters, renames, archives and returns with its filters intact', async ({ page, appErrors }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    const active = { ...makeDocument(), sourceLabels: ['Orders', 'sales.csv'] };
    const archived = { ...makeDocument(), id: 'doc-archived', title: 'Archived report', archivedAt: now, sourceLabels: [] as string[] };
    const documents = [active, archived];
    let failArchive = false;
    await page.route('**/api/data-agent', route =>
        route.fulfill({ json: { connections: [{ id: connection.connection.id, name: 'Orders' }], models: [], sessions: [], works: [] } }),
    );
    await page.route('**/api/work-documents?*', route => {
        const search = new URL(route.request().url()).searchParams;
        const state = search.get('archiveState') ?? (search.get('archived') === 'true' ? 'all' : 'active');
        const filtered = documents.filter(
            document =>
                (state === 'all' || (state === 'archived' ? Boolean(document.archivedAt) : !document.archivedAt)) &&
                document.title.toLowerCase().includes((search.get('q') ?? '').toLowerCase()) &&
                (!search.get('connectionId') || document.scope.connectionIds.includes(search.get('connectionId')!)),
        );
        return route.fulfill({ json: { documents: filtered } });
    });
    await page.route('**/api/work-documents/doc-*', async route => {
        const id = new URL(route.request().url()).pathname.split('/').pop();
        const document = documents.find(item => item.id === id)!;
        if (route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON();
            if (body.action === 'rename') {
                document.title = body.title;
                document.revision++;
            } else {
                if (failArchive) return route.fulfill({ status: 409, json: { error: 'Archive failed' } });
                document.archivedAt = body.archived ? now : null;
            }
        }
        return route.fulfill({ json: { document, versions: [{ revision: document.revision, source: 'user', createdAt: now }] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports?archived=true`);
    await expect(page.getByRole('combobox', { name: 'Report status' })).toContainText('All reports');
    await expect(page.getByTestId('report-row')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Generate report', exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Report status' }).click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();
    await expect(page.getByTestId('report-row')).toHaveCount(1);
    await expect(page.getByTestId('report-row')).toContainText('Orders +1');
    await page.getByText('Orders +1', { exact: true }).focus();
    await expect(page.getByRole('tooltip')).toContainText('sales.csv');
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: 'Search reports…' }).fill('Revenue');
    await page.getByRole('combobox', { name: 'Analysis scope' }).click();
    await page.getByRole('option', { name: 'Orders', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`connectionId=${connection.connection.id}`));
    await page.getByRole('combobox', { name: 'Analysis scope' }).click();
    await page.getByRole('option', { name: 'All data sources', exact: true }).click();
    await expect(page).not.toHaveURL(/connectionId=/);
    await page.getByRole('combobox', { name: 'Analysis scope' }).click();
    await page.getByRole('option', { name: 'Orders', exact: true }).click();
    await page.getByRole('link', { name: 'Revenue analysis', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search reports…' })).toHaveValue('Revenue');
    await expect(page.getByRole('combobox', { name: 'Analysis scope' })).toContainText('Orders');
    await page.getByRole('button', { name: 'Actions for Revenue analysis' }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeFocused();
    await title.fill('Revenue reviewed');
    await title.press('Enter');
    await expect(page.getByRole('link', { name: 'Revenue reviewed' })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Revenue reviewed' }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await title.fill('Cancelled title');
    await title.press('Escape');
    await expect(page.getByRole('link', { name: 'Revenue reviewed' })).toBeVisible();
    failArchive = true;
    await page.getByRole('button', { name: 'Actions for Revenue reviewed' }).click();
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Archive failed', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revenue reviewed' })).toBeVisible();
    failArchive = false;
    await page.getByRole('button', { name: 'Actions for Revenue reviewed' }).click();
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('No reports match your filters.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Report status' }).click();
    await page.getByRole('option', { name: 'Archived', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Revenue reviewed' })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Revenue reviewed' }).click();
    await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeDisabled();
    await page.getByRole('menuitem', { name: 'Unarchive', exact: true }).click();
    await expect(page.getByText('No reports match your filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('link', { name: 'Revenue reviewed' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Analysis scope' }).click();
    await expect(page.getByRole('option', { name: 'Orders', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('reports-list-light.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await page.getByRole('combobox', { name: 'Report status' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('reports-list-dark-mobile.png'), animations: 'disabled', fullPage: true });
    await page.keyboard.press('Escape');
    await expectAppHealthy(appErrors);
});

test('Reports distinguish first visit, archived-only, filtered and failed states', async ({ page }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [], works: [] } }));
    let hasArchived = false;
    let failed = false;
    await page.route('**/api/work-documents?*', route => {
        if (failed) return route.fulfill({ status: 500, json: { error: 'Reports unavailable' } });
        const all = new URL(route.request().url()).searchParams.get('archiveState') === 'all';
        return route.fulfill({ json: { documents: all && hasArchived ? [{ ...makeDocument(), archivedAt: now }] : [] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports`);
    await expect(page.getByRole('link', { name: 'Go to Work', exact: true })).toBeVisible();
    hasArchived = true;
    await page.reload();
    await expect(page.getByText('No active reports.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Work', exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Report status' }).click();
    await page.getByRole('option', { name: 'Archived', exact: true }).click();
    await expect(page.getByText('No archived reports.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Search reports…' }).fill('missing');
    await expect(page.getByText('No reports match your filters.')).toBeVisible();
    await expect(page).toHaveURL(/q=missing/);
    failed = true;
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'Reports unavailable' })).toBeVisible();
    await expect(page.getByText('No reports match your filters.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Go to Work', exact: true })).toHaveCount(0);
    failed = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No reports match your filters.')).toBeVisible();
});

test('report navigation protects unsaved changes and exports a complete Markdown package and print snapshot', async ({ page }, testInfo) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    let document = makeDocument();
    document.content.markdown += '\n\n| Label | Amount |\n| :--- | ---: |\n| ' + 'LongColumn'.repeat(35) + ' | 42 |';
    let failSave = true;
    let writes = 0;
    await page.route('**/api/work-documents/doc-report', async route => {
        if (route.request().method() === 'PATCH') {
            writes++;
            if (failSave) return route.fulfill({ status: 409, json: { error: 'Save conflict' } });
            const body = route.request().postDataJSON();
            document = { ...document, title: body.draft.title, revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [{ revision: document.revision, source: 'user', createdAt: now }] } });
    });
    await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [document] } }));
    await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [], works: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/reports/doc-report?q=Revenue&archiveState=all`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Human changes');
    await expect.poll(() => writes).toBe(1);
    await page.getByRole('button', { name: 'Continue analysis', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Human changes');
    await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save and continue', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/reports\/doc-report/);
    failSave = false;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save and continue', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search reports…' })).toHaveValue('Revenue');
    await expect(page.getByRole('combobox', { name: 'Report status' })).toContainText('All reports');
    await page.getByRole('link', { name: 'Human changes', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Markdown package', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Human changes.zip');
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(Buffer.concat(chunks));
    expect(strFromU8(files['report.md'])).toContain('Human changes');
    expect(Object.keys(files)).toContain('assets/chart.svg');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Print / Save as PDF', exact: true }).click();
    const printFrame = page.frameLocator('iframe[title="Human changes"]');
    await expect(printFrame.getByRole('heading', { name: 'Human changes', exact: true })).toHaveText('Human changes');
    await expect(printFrame.locator('table')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('report-detail-light.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('report-detail-dark-mobile.png'), animations: 'disabled', fullPage: true });
    failSave = true;
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Discard this');
    await page.getByRole('button', { name: 'Back to Reports', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Human changes' })).toBeVisible();
});
