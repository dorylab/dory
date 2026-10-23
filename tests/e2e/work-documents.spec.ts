import { expect, type Page } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

const connection = createWorkbenchConnection();
const now = '2026-10-22T10:00:00Z';

test.beforeEach(async ({ page }) => {
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
    await page.getByPlaceholder('Search data sources…').fill('');
    await page.getByRole('option', { name: new RegExp(name) }).click();
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

test('Work edits, saves, restores and exports the same snapshot', async ({ page, appErrors }, testInfo) => {
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
            else document = { ...document, title: body.draft.title, content: { ...document.content, ...body.draft }, revision: document.revision + 1 };
            versions.unshift({ revision: document.revision, source: 'user', createdAt: now });
        }
        await route.fulfill({ json: { document, versions } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/works/doc-report`);
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Monthly revenue' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Document body', exact: true })).toBeVisible();
    await expect(page.getByTestId('visual-card')).toHaveCount(1);
    await page.getByRole('textbox', { name: 'Document body', exact: true }).getByRole('link', { name: 'Source', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('SELECT month');
    await page.keyboard.press('Escape');
    const beforeSwitch = document.revision;
    await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Document body', exact: true })).toBeVisible();
    expect(document.revision).toBe(beforeSwitch);
    await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+Home');
    await source.pressSequentially('Source note preserved.');
    await source.press('Enter');
    await source.press('Enter');
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Document body', exact: true })).toContainText('Source note preserved.');
    await expect.poll(() => document.content.markdown).toContain('Source note preserved.');
    const bodyEditor = page.getByRole('textbox', { name: 'Document body', exact: true });
    await bodyEditor.press('ControlOrMeta+End');
    await bodyEditor.press('ArrowDown');
    await bodyEditor.press('Enter');
    await page.keyboard.insertText('Human note preserved.');
    await expect.poll(() => document.content.markdown).toContain('Human note preserved.');
    await page.getByRole('textbox', { name: 'Title', exact: true }).first().fill('Human-reviewed analysis');
    await expect.poll(() => document.title).toBe('Human-reviewed analysis');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Human-reviewed analysis' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'HTML', exact: true }).click();
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
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
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
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('work-dark-mobile.png'), fullPage: true });
    await expectAppHealthy(appErrors);
});

test('Data Agent has explicit multi-source scope without creating an unsolicited report', async ({ page, appErrors }) => {
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
    await page.goto(`/${organization}/data-agent`);
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
    await page.getByPlaceholder('Search Knowledge…').fill('Commerce');
    await page.getByRole('option', { name: 'Commerce', exact: true }).click();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await expect(page.getByRole('option', { name: /Orders/ }).getByText('Selected', { exact: true })).toBeAttached();
    await expect(page.getByRole('option', { name: /Advertising/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByPlaceholder('Search data sources…').fill('Advertising');
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
    await page.goto(`/${organization}/data-agent`);
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
                        send({ type: 'start', messageId: 'live-report' });
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
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Revenue analysis Draft' })).toBeVisible();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await page.getByRole('button', { name: 'Revenue analysis Draft' }).click();
    await expect(page.getByTestId('work-report')).toBeVisible();
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await expect(page.getByTestId('work-report')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await page.getByRole('button', { name: 'Revenue analysis Draft' }).click();
    await expect(page.getByTestId('work-report')).toBeVisible();
    await expect(page.getByText('Preparing both sources.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'HTML', exact: true })).toBeDisabled();
    await selectReportVersion(page, 1);
    await expect(page.getByTestId('work-markdown')).toHaveText('Historical snapshot content');
    document.revision = 3;
    document.content.markdown = 'Latest generated content';
    await expect.poll(() => latestRead).toBe(3);
    await expect(page.getByTestId('work-markdown')).toHaveText('Historical snapshot content');
    await expect(page.getByRole('button', { name: 'Report version', exact: true })).toHaveText('v1');
    await page.getByRole('button', { name: 'Back to latest', exact: true }).click();
    await expect(page.getByTestId('work-markdown')).toHaveText('Latest generated content');
    await page.evaluate(() => (window as unknown as { finishReportStream: () => void }).finishReportStream());
    await expect(page.getByText('Preparing both sources. Report completed.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-report-split.png') });
    await expectAppHealthy(appErrors);
});

test('unsupported Markdown stays intact in source mode and never executes HTML', async ({ page, appErrors }) => {
    const document = makeDocument();
    document.content.markdown = '## Source preserved\n\n<div onclick="window.unexpectedExecution=true">Raw HTML stays literal</div>\n\n- [x] Unsupported task list';
    document.content.visuals = [];
    let writes = 0;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/doc-report', route => {
        if (route.request().method() !== 'GET') writes++;
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/works/doc-report`);
    await expect(page.getByTestId('work-markdown')).toContainText('<div onclick=');
    await expect(page.getByTestId('work-markdown').locator('[onclick]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'source' })).toBeVisible();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('work-markdown')).toContainText('Raw HTML stays literal');
    expect(writes).toBe(0);
    await expectAppHealthy(appErrors);
});

test('data cards stay read-only while moving and deleting their Markdown references', async ({ page, appErrors }) => {
    let document = makeDocument();
    document.content.markdown = '## Move target\n\nParagraph before the chart.\n\n![Monthly revenue](dory://visual/chart)\n\nClosing note.';
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/doc-report', route => {
        if (route.request().method() === 'PATCH') {
            const { draft } = route.request().postDataJSON();
            document = { ...document, content: { ...document.content, ...draft }, revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/works/doc-report`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const card = page.getByTestId('visual-card');
    await expect(card).toHaveAttribute('contenteditable', 'false');
    await card.locator('[data-drag-handle]').dragTo(page.getByRole('textbox', { name: 'Document body' }).locator('h2'), { targetPosition: { x: 10, y: 0 } });
    await expect.poll(() => document.content.markdown.indexOf('![Monthly revenue]') < document.content.markdown.indexOf('## Move target')).toBe(true);
    await card.getByRole('button', { name: 'Remove visual' }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(() => document.content.markdown).not.toContain('dory://visual/chart');
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
    await page.goto(`/${organization}/data-agent`);
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toBeEnabled();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-welcome-light.png') });
    await toggleSource(page, 'Orders');
    await toggleSource(page, 'Advertising');
    await page.getByRole('button', { name: 'Databases', exact: true }).click();
    await page.getByRole('option', { name: 'Orders: analytics', exact: true }).click();
    await page.getByRole('option', { name: 'Advertising: main', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Compare the selected databases');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => submitted?.analysisScope).toEqual(scope);
    await expect(page.getByText('Both databases received.', { exact: true })).toBeVisible();
    // Search and select the persisted conversation, then reload its URL state.
    await page.getByPlaceholder('Search sessions').fill('Monthly');
    await expect(page.getByRole('button', { name: 'Earlier analysis', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Monthly comparison', exact: true }).click();
    await expect(page.getByText('Orders and advertising are ready for analysis.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Orders and advertising are ready for analysis.')).toBeVisible();
    await page.getByRole('button', { name: 'Databases', exact: true }).click();
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
    // New conversations preserve the scope; legacy sessions restore activeDatabase.
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Ask anything about your data/ })).toBeVisible();
    await expect(page).toHaveURL(/databases=/);
    await page.getByRole('button', { name: 'Earlier analysis', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Databases', exact: true })).toHaveText('analytics');
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    const monthlyRow = page.getByRole('button', { name: 'Monthly comparison', exact: true }).locator('..');
    await monthlyRow.hover();
    await monthlyRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.getByPlaceholder('Enter a new session name').fill('Renamed comparison');
    await page.getByPlaceholder('Enter a new session name').press('Enter');
    await expect(page.getByRole('button', { name: 'Renamed comparison', exact: true })).toBeVisible();
    const renamedRow = page.getByRole('button', { name: 'Renamed comparison', exact: true }).locator('..');
    await renamedRow.hover();
    await renamedRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Renamed comparison', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 600, height: 850 });
    await expect(page.getByRole('button', { name: 'Data sources', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Ask a question/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-narrow-dark.png') });
    await expectAppHealthy(appErrors);
});

test('database loading failures block send and can be retried', async ({ page, appErrors }) => {
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
    await page.goto(`/${organization}/data-agent?sources=conn-1,missing`);
    await toggleSource(page, 'Unavailable source');
    await page.getByRole('textbox', { name: /Ask a question/ }).fill('Inspect data');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Databases', exact: true }).click();
    await expect(page.getByText('Could not load databases')).toBeVisible();
    failed = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Orders: main' })).toBeVisible();
    await page.keyboard.press('Escape');
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
            if (saveFails) return route.fulfill({ status: 409, json: { error: 'Work changed. Read the latest version.' } });
            const body = route.request().postDataJSON();
            expect(body.expectedRevision).toBe(document.revision);
            document = { ...document, title: body.draft.title, content: { ...document.content, ...body.draft }, revision: document.revision + 1 };
        }
        return route.fulfill({ json: { document, versions: [] } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/data-agent?chat=report-chat`);
    await expect(page.getByText('Updated analysis', { exact: true })).toBeVisible();
    await expect(page.getByTestId('agent-resources')).toHaveCount(0);
    const chatWidth = (await page.getByTestId('data-agent').locator('main').boundingBox())!.width;
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await expect(page.getByTestId('agent-resources')).toBeVisible();
    expect((await page.getByTestId('data-agent').locator('main').boundingBox())!.width).toBe(chatWidth);
    await page.getByRole('textbox', { name: /Ask a question/ }).click();
    await expect(page.getByTestId('agent-resources')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /Ask a question/ })).toBeFocused();
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Payment analysis' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Payment analysis' })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'View Agent Run' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Revenue analysis Ready' }).click();
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
    await expect(page.getByRole('button', { name: 'Session resources', exact: true })).toBeFocused();
    expect(document.title).toBe('Unsaved analysis');
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await page.getByRole('button', { name: 'Unsaved analysis Ready' }).click();
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
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-resources-dark.png') });
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByRole('dialog', { name: 'Session resources' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Close resources', exact: true }).click();
    await page.getByRole('button', { name: 'Session resources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Session resources' })).toBeVisible();
    const popupBounds = (await page.getByTestId('agent-resources').boundingBox())!;
    expect(popupBounds.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole('link', { name: 'Payment analysis' })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('agent-resources-mobile.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Session resources' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Session resources', exact: true })).toBeFocused();
    await expectAppHealthy(appErrors);
});

async function selectReportVersion(page: Page, revision: number | 'latest') {
    await page.getByRole('button', { name: 'Report version', exact: true }).click();
    await page.getByRole('menuitemradio', { name: revision === 'latest' ? /Latest/ : new RegExp(`^v${revision} ·`) }).click();
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
    await page.goto(`/${organization}/works/doc-report`);
    await expect(page.getByRole('heading', { name: 'Latest report' })).toBeVisible();
    await selectReportVersion(page, 1);
    await expect(page).toHaveURL(/revision=1/);
    await expect(page.getByRole('heading', { name: 'Revenue analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await expect(page.getByRole('img', { name: 'Monthly revenue' })).toBeVisible();
    expect(writes).toBe(0);
    await page.getByRole('button', { name: 'Evidence', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('September');
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'HTML', exact: true }).click();
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
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('version-dark-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Report version', exact: true })).toHaveText('v3');
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
    await page.goto(`/${organization}/works/doc-report`);
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
    await page.getByRole('button', { name: 'Back to latest', exact: true }).click();
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
                return route.fulfill({ status: 409, json: { error: 'Work changed. Reload the latest version before saving.' } });
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
    const url = `/${organization}/works/doc-report`;
    await page.goto(url);
    await selectReportVersion(page, 1);
    await expect.poll(() => Boolean(releaseFirst)).toBe(true);
    await expect(page.getByTestId('work-markdown')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'HTML', exact: true })).toBeDisabled();
    await selectReportVersion(page, 2);
    await expect(page.getByRole('heading', { name: 'Second version' })).toBeVisible();
    releaseFirst!();
    await expect(page.getByRole('heading', { name: 'Second version' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('Work changed');
    expect(restoreCalls).toBe(1);
    await expect(page.getByRole('heading', { name: 'Second version', includeHidden: true })).toBeVisible();
    conflict = false;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Report version', exact: true })).toHaveText('v5');
    failHistory = true;
    await page.goto(url + '?revision=1');
    await expect(page.getByTestId('work-report').getByRole('alert')).toContainText('Version not found.');
    await expect(page.getByTestId('work-markdown')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to latest', exact: true }).click();
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
    await page.goto(`/${organization}/data-agent?chat=payment-chart&panel=closed`);
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
    await page.goto(`/${organization}/data-agent?chat=report-chat&document=doc-report&panel=report&revision=1`);
    await expect(page.getByRole('button', { name: 'Report version', exact: true })).toHaveText('v1');
    await page.getByRole('button', { name: 'Back to resources', exact: true }).click();
    await page.getByRole('button', { name: 'Another report Ready' }).click();
    await expect(page.getByRole('heading', { name: 'Another report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report version', exact: true })).toHaveText('v3');
    await expect(page).not.toHaveURL(/revision=/);
});
