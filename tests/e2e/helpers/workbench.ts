import { expect, type Page, type Route } from '@playwright/test';

type ConnectionRecord = {
    connection: {
        id: string;
        type: 'clickhouse';
        engine: string;
        name: string;
        description: string | null;
        host: string;
        port: number;
        httpPort: number | null;
        database: string | null;
        options: string;
        status: 'Connected';
        configVersion: number;
        createdAt: string;
        updatedAt: string;
        deletedAt: null;
        lastUsedAt: null;
        lastCheckStatus: 'ok';
        lastCheckAt: string;
        lastCheckLatencyMs: number;
        lastCheckError: null;
        environment: string;
        tags: string;
    };
    identities: Array<{
        id: string;
        name: string;
        username: string;
        role: null;
        isDefault: true;
        database: null;
        enabled: true;
        status: 'active';
    }>;
    ssh: null;
};

type MockWorkbenchOptions = {
    initialConnections?: ConnectionRecord[];
};

const createWorkbenchConnection = ({
    id = 'conn-1',
    name = 'E2E ClickHouse',
    host = 'localhost',
    port = 8123,
    username = 'default',
}: {
    id?: string;
    name?: string;
    host?: string;
    port?: number;
    username?: string;
} = {}): ConnectionRecord => {
    const now = new Date().toISOString();

    return {
        connection: {
            id,
            type: 'clickhouse',
            engine: 'clickhouse',
            name,
            description: null,
            host,
            port: 9000,
            httpPort: port,
            database: null,
            options: '{"ssl":false,"useSSL":false,"protocol":"http","httpPort":8123}',
            status: 'Connected',
            configVersion: 1,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            lastUsedAt: null,
            lastCheckStatus: 'ok',
            lastCheckAt: now,
            lastCheckLatencyMs: 12,
            lastCheckError: null,
            environment: 'local',
            tags: '',
        },
        identities: [
            {
                id: 'identity-1',
                name: username,
                username,
                role: null,
                isDefault: true,
                database: null,
                enabled: true,
                status: 'active',
            },
        ],
        ssh: null,
    };
};

const json = async (route: Route, body: unknown, status = 200) => {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
};

async function collectOpenConsoleDiagnostics(page: Page) {
    return page
        .evaluate(() => {
            const cards = Array.from(document.querySelectorAll('[data-testid="connection-card"]')).map(card => ({
                text: card.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                connectionId: card.getAttribute('data-connection-id'),
            }));

            return {
                href: window.location.href,
                title: document.title,
                currentConnectionLocalStorage: window.localStorage.getItem('currentConnection'),
                cards,
            };
        })
        .catch(e => ({
            evaluationError: e instanceof Error ? e.message : String(e),
        }));
}

export async function mockWorkbenchApis(page: Page, options: MockWorkbenchOptions = {}) {
    const connections: ConnectionRecord[] = [...(options.initialConnections ?? [])];
    const tabs = new Map<string, any>();

    await page.route('**/api/connection/test', async route => {
        await json(route, {
            code: 0,
            message: 'success',
            data: { version: '24.8.1' },
        });
    });

    await page.route('**/api/connection/connect', async route => {
        const payload = route.request().postDataJSON() as { connection?: { id?: string }; identityId?: string | null };
        await json(route, {
            code: 0,
            message: 'success',
            data: {
                connectionId: payload.connection?.id ?? 'conn-1',
                identityId: payload.identityId ?? null,
                status: 'Connected',
            },
        });
    });

    await page.route('**/api/connection', async route => {
        const request = route.request();
        if (request.method() === 'GET') {
            await json(route, { code: 0, message: 'success', data: connections });
            return;
        }

        if (request.method() === 'POST') {
            const payload = request.postDataJSON() as any;
            const now = new Date().toISOString();
            const id = `conn-${connections.length + 1}`;
            const username = payload.identities?.[0]?.username ?? 'default';

            const created: ConnectionRecord = {
                connection: {
                    id,
                    type: 'clickhouse',
                    engine: 'clickhouse',
                    name: payload.connection.name,
                    description: null,
                    host: payload.connection.host,
                    port: payload.connection.port ?? 9000,
                    httpPort: payload.connection.httpPort ?? 8123,
                    database: null,
                    options: payload.connection.options ?? '{}',
                    status: 'Connected',
                    configVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                    lastUsedAt: null,
                    lastCheckStatus: 'ok',
                    lastCheckAt: now,
                    lastCheckLatencyMs: 12,
                    lastCheckError: null,
                    environment: 'local',
                    tags: '',
                },
                identities: [
                    {
                        id: `identity-${connections.length + 1}`,
                        name: username,
                        username,
                        role: null,
                        isDefault: true,
                        database: null,
                        enabled: true,
                        status: 'active',
                    },
                ],
                ssh: null,
            };

            connections.unshift(created);
            await json(route, { code: 0, message: 'success', data: created });
            return;
        }

        await route.fallback();
    });

    await page.route('**/api/connection/*/databases', async route => {
        await json(route, {
            code: 0,
            message: 'success',
            data: [{ label: 'demo', value: 'demo' }],
        });
    });

    await page.route('**/api/connection/*/databases/*/tables', async route => {
        await json(route, {
            code: 0,
            message: 'success',
            data: [{ label: 'numbers', value: 'numbers' }],
        });
    });

    await page.route('**/api/connection/*/databases/*/tables/*/columns', async route => {
        await json(route, {
            code: 0,
            message: 'success',
            data: [
                { columnName: 'number', columnType: 'UInt8' },
                { columnName: 'label', columnType: 'String' },
            ],
        });
    });

    await page.route('**/api/sql-console/tabs*', async route => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.method() === 'GET') {
            await json(route, { code: 1, data: Array.from(tabs.values()) });
            return;
        }

        if (request.method() === 'POST' || request.method() === 'PATCH') {
            const payload = request.postDataJSON() as any;
            tabs.set(payload.tabId, payload.state);
            await json(route, { code: 1, result: payload.state });
            return;
        }

        if (request.method() === 'DELETE') {
            const tabId = url.searchParams.get('tabId');
            if (tabId) tabs.delete(tabId);
            await json(route, { code: 1 });
            return;
        }

        await route.fallback();
    });

    await page.route('**/api/sql-console/saved-queries', async route => {
        await json(route, { code: 0, message: 'success', data: [] });
    });

    await page.route('**/api/sql-console/saved-query-folders', async route => {
        await json(route, { code: 0, message: 'success', data: [] });
    });

    await page.route('**/api/sql-console/saved-query-folders/reorder', async route => {
        await json(route, { code: 0, message: 'success', data: { reordered: true } });
    });

    await page.route('**/api/sql-console/saved-queries/reorder', async route => {
        await json(route, { code: 0, message: 'success', data: { reordered: true } });
    });

    await page.route('**/api/ai/tab-title', async route => {
        await json(route, { title: 'SELECT 1' });
    });

    await page.route('**/api/query/cancel', async route => {
        await json(route, { code: 0, message: 'success', data: null });
    });

    await page.route('**/api/query', async route => {
        const payload = route.request().postDataJSON() as { sql?: string; sessionId?: string };
        const sql = (payload.sql ?? '').trim();
        const now = new Date().toISOString();
        const isError = /from\s+missing_table|syntax_error|select\s+from/i.test(sql.toLowerCase());

        if (isError) {
            await json(route, {
                code: 0,
                message: 'success',
                data: {
                    session: {
                        sessionId: payload.sessionId ?? 'session-error',
                        sqlText: sql,
                        status: 'error',
                        errorMessage: 'Syntax error near FROM',
                        startedAt: now,
                        finishedAt: now,
                        durationMs: 8,
                        resultSetCount: 1,
                        stopOnError: false,
                        source: 'sql-console',
                    },
                    queryResultSets: [
                        {
                            sessionId: payload.sessionId ?? 'session-error',
                            setIndex: 0,
                            sqlText: sql,
                            sqlOp: 'SELECT',
                            title: 'SELECT',
                            columns: null,
                            rowCount: 0,
                            affectedRows: null,
                            status: 'error',
                            errorMessage: 'Syntax error near FROM',
                            errorCode: 'SYNTAX_ERROR',
                            errorSqlState: null,
                            errorMeta: null,
                            warnings: null,
                            startedAt: now,
                            finishedAt: now,
                            durationMs: 8,
                        },
                    ],
                    results: [[]],
                    meta: {
                        totalSets: 1,
                    },
                },
            });
            return;
        }

        await json(route, {
            code: 0,
            message: 'success',
            data: {
                session: {
                    sessionId: payload.sessionId ?? 'session-success',
                    sqlText: sql,
                    status: 'success',
                    errorMessage: null,
                    startedAt: now,
                    finishedAt: now,
                    durationMs: 5,
                    resultSetCount: 1,
                    stopOnError: false,
                    source: 'sql-console',
                },
                queryResultSets: [
                    {
                        sessionId: payload.sessionId ?? 'session-success',
                        setIndex: 0,
                        sqlText: sql,
                        sqlOp: 'SELECT',
                        title: 'SELECT 1',
                        columns: [{ name: 'value', type: 'UInt8' }],
                        rowCount: 1,
                        affectedRows: null,
                        status: 'success',
                        errorMessage: null,
                        errorCode: null,
                        errorSqlState: null,
                        errorMeta: null,
                        warnings: null,
                        startedAt: now,
                        finishedAt: now,
                        durationMs: 5,
                    },
                ],
                results: [[{ value: 1 }]],
                meta: {
                    totalSets: 1,
                },
            },
        });
    });
}

export async function createConnectionAndOpenConsole(page: Page) {
    const connection = createWorkbenchConnection();

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    await page.getByRole('button', { name: /add connection/i }).click();
    const dialog = page.getByRole('dialog', { name: /create connection/i });
    await expect(dialog).toBeVisible();

    await page.getByLabel(/Connection Name/i).fill('E2E ClickHouse');
    await page.getByLabel(/Host/i).fill('localhost');
    await page.getByLabel(/^Port/i).fill('8123');
    await page.getByLabel(/Database Username/i).fill('default');
    await dialog.locator('input[type="password"]').fill('password');

    await page.getByRole('button', { name: /test connection/i }).click();
    await expect(page.getByText(/24\.8\.1/)).toBeVisible();

    await page.getByRole('button', { name: /create connection/i }).click();
    await expect(dialog).toBeHidden();

    const connectionCard = page.getByTestId('connection-card').filter({ hasText: connection.connection.name }).first();
    await expect(connectionCard).toBeVisible();
}

export async function openMockConnectionConsole(page: Page, connection: ConnectionRecord = createWorkbenchConnection()) {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    const match = page.url().match(/\/([^/]+)\/connections$/);
    const organizationId = match?.[1];

    if (!organizationId) {
        throw new Error(`Failed to resolve organization id from URL: ${page.url()}`);
    }

    await page.evaluate(
        value => {
            window.localStorage.setItem('currentConnection', JSON.stringify(value));
        },
        connection,
    );

    const targetPath = `/${organizationId}/${connection.connection.id}/sql-console`;

    try {
        await page.goto(targetPath, { waitUntil: 'commit' });
        await expect(page).toHaveURL(new RegExp(`/${organizationId}/${connection.connection.id}/sql-console$`));
        await expect(page.getByRole('button', { name: /New Console/i })).toBeEnabled();
    } catch (error) {
        const diagnostics = await collectOpenConsoleDiagnostics(page);

        console.error('[workbench helper] failed to open SQL console', {
            currentUrl: page.url(),
            targetPath,
            connectionId: connection.connection.id,
            connectionName: connection.connection.name,
            diagnostics,
        });

        throw error;
    }
}

export async function setSqlEditorValue(page: Page, sql: string) {
    const editorInput = page.getByRole('textbox', { name: /editor content/i });
    const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

    await editorInput.focus();
    await page.keyboard.press(selectAllShortcut);
    await page.keyboard.type(sql);
}

export { createWorkbenchConnection };
