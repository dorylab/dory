import { expect, type Page, type Route } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const seededConnection = createWorkbenchConnection();

const json = async (route: Route, body: unknown, status = 200) => {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
};

type MockFolder = { id: string; name: string; position: number; createdAt: string; updatedAt: string };
type MockQuery = {
    id: string;
    title: string;
    sqlText: string;
    folderId: string | null;
    position: number;
    connectionId: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: null;
    description: null;
    tags: string[];
    context: Record<string, unknown>;
    workId: null;
};
type MockAuditItem = {
    id: string;
    created_at: string;
    organizationId: string;
    user_id: string;
    source: 'user_sql_console';
    status: 'success' | 'error' | 'canceled';
    duration_ms: number | null;
    error_message: string | null;
    rows_read: number | null;
    bytes_read: number | null;
    rows_written: number | null;
    connection_id: string;
    connection_name: string;
    identity_id: string | null;
    identity_name: string | null;
    identity_username: string | null;
    identity_role: string | null;
    identity_database: string | null;
    database_name: string | null;
    sql_text: string;
    extra_json: Record<string, unknown>;
};

function createMockFolder(id: string, name: string, position: number): MockFolder {
    const now = new Date().toISOString();
    return { id, name, position, createdAt: now, updatedAt: now };
}

function createMockQuery(
    id: string,
    title: string,
    sqlText: string,
    folderId: string | null,
    position: number,
): MockQuery {
    const now = new Date().toISOString();
    return {
        id,
        title,
        sqlText,
        folderId,
        position,
        connectionId: 'conn-1',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        description: null,
        tags: [],
        context: {},
        workId: null,
    };
}

function createMockAuditItem(id: string, sqlText: string, status: MockAuditItem['status'] = 'success'): MockAuditItem {
    return {
        id,
        created_at: new Date().toISOString(),
        organizationId: 'org-1',
        user_id: 'user-1',
        source: 'user_sql_console',
        status,
        duration_ms: 23,
        error_message: status === 'error' ? 'Query failed' : null,
        rows_read: 10,
        bytes_read: 128,
        rows_written: null,
        connection_id: 'conn-1',
        connection_name: 'E2E ClickHouse',
        identity_id: 'identity-1',
        identity_name: 'default',
        identity_username: 'default',
        identity_role: null,
        identity_database: null,
        database_name: 'default',
        sql_text: sqlText,
        extra_json: {},
    };
}

/**
 * Layer folder-specific mock routes on top of mockWorkbenchApis.
 * Must be called AFTER mockWorkbenchApis so our routes take priority.
 */
async function mockFolderApis(
    page: Page,
    options: {
        initialFolders?: MockFolder[];
        initialQueries?: MockQuery[];
        initialHistory?: MockAuditItem[];
    } = {},
) {
    const folders: MockFolder[] = [...(options.initialFolders ?? [])];
    const queries: MockQuery[] = [...(options.initialQueries ?? [])];
    const history: MockAuditItem[] = [...(options.initialHistory ?? [])];
    let folderCounter = folders.length;

    // Remove the catch-all saved-queries handler from mockWorkbenchApis,
    // then register our stateful handlers using function matchers for precise URL matching.
    await page.unroute('**/api/sql-console/saved-queries');
    await page.unroute('**/api/sql-console/saved-query-folders');
    await page.unroute('**/api/sql-console/saved-query-folders/reorder');
    await page.unroute('**/api/sql-console/saved-queries/reorder');
    await page.unroute('**/api/query-audit').catch(() => undefined);

    // Reorder routes
    await page.route('**/api/sql-console/saved-queries/reorder', async route => {
        await json(route, { code: 0, message: 'success', data: { reordered: true } });
    });
    await page.route('**/api/sql-console/saved-query-folders/reorder', async route => {
        await json(route, { code: 0, message: 'success', data: { reordered: true } });
    });

    await page.route(url => url.pathname.endsWith('/api/sql-console/saved-queries'), async route => {
        const req = route.request();
        if (req.method() === 'GET') {
            const active = queries.filter(q => !q.archivedAt);
            await json(route, { code: 0, message: 'success', data: active });
            return;
        }
        if (req.method() === 'PATCH') {
            const url = new URL(req.url());
            const id = url.searchParams.get('id');
            const body = req.postDataJSON() as Partial<MockQuery>;
            const idx = queries.findIndex(q => q.id === id);
            if (idx >= 0) {
                queries[idx] = { ...queries[idx], ...body, updatedAt: new Date().toISOString() };
                await json(route, { code: 0, message: 'success', data: queries[idx] });
            } else {
                await json(route, { code: 1, message: 'not found' }, 404);
            }
            return;
        }
        if (req.method() === 'DELETE') {
            const url = new URL(req.url());
            const id = url.searchParams.get('id');
            const idx = queries.findIndex(q => q.id === id);
            if (idx >= 0) queries.splice(idx, 1);
            await json(route, { code: 0, message: 'success', data: { deleted: [id] } });
            return;
        }
        await route.fallback();
    });

    // Override saved-query-folders
    await page.route(url => url.pathname.endsWith('/api/sql-console/saved-query-folders'), async route => {
        const req = route.request();
        if (req.method() === 'GET') {
            await json(route, { code: 0, message: 'success', data: [...folders] });
            return;
        }
        if (req.method() === 'POST') {
            const body = req.postDataJSON() as { name: string };
            folderCounter++;
            const folder = createMockFolder(`folder-${folderCounter}`, body.name, folderCounter * 1000);
            folders.push(folder);
            await json(route, { code: 0, message: 'success', data: folder }, 201);
            return;
        }
        if (req.method() === 'PATCH') {
            const url = new URL(req.url());
            const id = url.searchParams.get('id');
            const body = req.postDataJSON() as { name?: string };
            const idx = folders.findIndex(f => f.id === id);
            if (idx >= 0) {
                if (body.name) folders[idx].name = body.name;
                folders[idx].updatedAt = new Date().toISOString();
                await json(route, { code: 0, message: 'success', data: folders[idx] });
            } else {
                await json(route, { code: 1, message: 'not found' }, 404);
            }
            return;
        }
        if (req.method() === 'DELETE') {
            const url = new URL(req.url());
            const id = url.searchParams.get('id');
            const idx = folders.findIndex(f => f.id === id);
            if (idx >= 0) {
                folders.splice(idx, 1);
                for (const q of queries) {
                    if (q.folderId === id) q.folderId = null;
                }
            }
            await json(route, { code: 0, message: 'success', data: { deleted: [id] } });
            return;
        }
        await route.fallback();
    });

    await page.route(url => url.pathname.endsWith('/api/query-audit'), async route => {
        await json(route, {
            code: 0,
            message: 'success',
            data: {
                items: history,
                total: history.length,
                nextCursor: null,
            },
        });
    });

    return { folders, queries };
}

// ---------------------------------------------------------------------------
// Open sidebar helper
// ---------------------------------------------------------------------------

async function openSavedQueriesSidebar(page: Page) {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    expect(organization).toBeTruthy();

    const connectionCard = page.getByTestId('connection-card').filter({ hasText: seededConnection.connection.name }).first();
    await expect(connectionCard).toBeVisible();
    await connectionCard.click({ position: { x: 24, y: 24 } });
    const consoleUrl = `/${organization}/${seededConnection.connection.id}/sql-console`;
    try {
        await expect(page).toHaveURL(new RegExp(`/[^/]+/${seededConnection.connection.id}/sql-console$`), { timeout: 5000 });
    } catch {
        await page.goto(consoleUrl);
        await expect(page).toHaveURL(new RegExp(`/[^/]+/${seededConnection.connection.id}/sql-console$`), { timeout: 15000 });
    }

    const tab = page.getByRole('tab', { name: /^Queries$/i });
    await expect(tab).toBeVisible();
    await tab.click({ force: true });
    if ((await tab.getAttribute('data-state')) !== 'active') {
        await tab.focus();
        await page.keyboard.press('Enter');
    }
    if ((await tab.getAttribute('data-state')) !== 'active') {
        await page.evaluate(() => {
            const trigger = document.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="content-saved"]');
            trigger?.click();
        });
    }
    await expect(tab).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('combobox').filter({ hasText: /My Queries/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search/i)).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Saved Query Folders', () => {
    test('displays folders and queries grouped correctly', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockFolderApis(page, {
            initialFolders: [
                createMockFolder('folder-1', 'Analytics', 1000),
                createMockFolder('folder-2', 'Debug', 2000),
            ],
            initialQueries: [
                createMockQuery('q1', 'revenue_by_day', 'SELECT * FROM revenue', 'folder-1', 1000),
                createMockQuery('q2', 'revenue_by_month', 'SELECT * FROM revenue_monthly', 'folder-1', 2000),
                createMockQuery('q3', 'join_test', 'SELECT * FROM joins', 'folder-2', 1000),
                createMockQuery('q4', 'Actor count', 'SELECT count(*) FROM actors', null, 1000),
            ],
            initialHistory: [
                createMockAuditItem('audit-1', 'SELECT * FROM audit_history'),
            ],
        });

        await openSavedQueriesSidebar(page);

        await expect(page.getByText('Analytics')).toBeVisible();
        await expect(page.getByText('Debug')).toBeVisible();
        await expect(page.getByText('Actor count')).toBeVisible();

        await page
            .getByRole('combobox')
            .filter({ hasText: /My Queries/i })
            .click();
        await page.getByRole('option', { name: /Query History/i }).click();
        await expect(page.getByRole('button', { name: /SELECT \* FROM audit_history/i })).toBeVisible();
        await expect(page.getByPlaceholder(/Search/i)).toBeHidden();

        await page
            .getByRole('combobox')
            .filter({ hasText: /Query History/i })
            .click();
        await page.getByRole('option', { name: /My Queries/i }).click();
        await expect(page.getByText('Analytics')).toBeVisible();
        await expect(page.getByText('Actor count')).toBeVisible();

        await expectAppHealthy(appErrors);
    });

    test('can create a new folder', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockFolderApis(page, {
            initialQueries: [
                createMockQuery('q1', 'my query', 'SELECT 1', null, 1000),
            ],
        });

        await openSavedQueriesSidebar(page);

        const createBtn = page.getByRole('button', { name: /new folder/i });
        await createBtn.click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        await dialog.getByRole('textbox').fill('My Folder');
        await dialog.getByRole('button', { name: /Save/i }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByText('My Folder')).toBeVisible();

        await expectAppHealthy(appErrors);
    });

    test('can expand and collapse a folder', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockFolderApis(page, {
            initialFolders: [createMockFolder('folder-1', 'Analytics', 1000)],
            initialQueries: [
                createMockQuery('q1', 'revenue_by_day', 'SELECT * FROM revenue', 'folder-1', 1000),
            ],
        });

        await openSavedQueriesSidebar(page);

        const folderText = page.getByText('Analytics');
        await expect(folderText).toBeVisible();

        // Click to expand
        await folderText.click();
        await expect(page.getByText('revenue_by_day')).toBeVisible();

        // Click to collapse
        await folderText.click();
        await expect(page.getByText('revenue_by_day')).toBeHidden();

        await expectAppHealthy(appErrors);
    });

    test('search shows flat results ignoring folders', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockFolderApis(page, {
            initialFolders: [createMockFolder('folder-1', 'Analytics', 1000)],
            initialQueries: [
                createMockQuery('q1', 'revenue_by_day', 'SELECT * FROM revenue', 'folder-1', 1000),
                createMockQuery('q2', 'Actor count', 'SELECT count(*) FROM actors', null, 1000),
            ],
        });

        await openSavedQueriesSidebar(page);

        const searchInput = page.getByPlaceholder(/Search/i);
        await searchInput.fill('revenue');

        await expect(page.getByText('revenue_by_day')).toBeVisible();
        await expect(page.getByText('Analytics')).toBeHidden();
        await expect(page.getByText('Actor count')).toBeHidden();

        await expectAppHealthy(appErrors);
    });

    test('can rename a folder', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockFolderApis(page, {
            initialFolders: [createMockFolder('folder-1', 'Old Name', 1000)],
            initialQueries: [],
        });

        await openSavedQueriesSidebar(page);

        // Hover folder row and open its "More actions" menu
        const folderRow = page.locator('.group.flex.items-center').filter({ hasText: 'Old Name' });
        await folderRow.hover();
        await folderRow.getByRole('button', { name: /More actions/i }).click();

        await page.getByRole('menuitem', { name: /Rename/i }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const input = dialog.getByRole('textbox');
        await input.clear();
        await input.fill('New Name');
        await dialog.getByRole('button', { name: /Save/i }).click();

        await expect(dialog).toBeHidden();
        await expectAppHealthy(appErrors);
    });

    test('can move a query to a folder via menu', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        const { queries } = await mockFolderApis(page, {
            initialFolders: [createMockFolder('folder-1', 'Analytics', 1000)],
            initialQueries: [
                createMockQuery('q1', 'Actor count', 'SELECT count(*) FROM actors', null, 1000),
            ],
        });

        await openSavedQueriesSidebar(page);

        // Open query menu
        const queryRow = page.locator('.group.flex.items-start').filter({ hasText: 'Actor count' });
        await queryRow.hover();
        await queryRow.getByRole('button', { name: /More actions/i }).click();

        // Hover on "Move to Folder" submenu
        const moveSubmenu = page.getByRole('menuitem', { name: /Move to Folder/i });
        await moveSubmenu.hover();

        // Select target folder
        await page.getByRole('menuitem', { name: 'Analytics' }).click();

        expect(queries[0].folderId).toBe('folder-1');

        await expectAppHealthy(appErrors);
    });

    test('delete folder moves queries to root', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        const { queries, folders } = await mockFolderApis(page, {
            initialFolders: [createMockFolder('folder-1', 'ToDelete', 1000)],
            initialQueries: [
                createMockQuery('q1', 'inside_query', 'SELECT 1', 'folder-1', 1000),
            ],
        });

        await openSavedQueriesSidebar(page);

        // Open folder menu
        const folderRow = page.locator('.group.flex.items-center').filter({ hasText: 'ToDelete' });
        await folderRow.hover();
        await folderRow.getByRole('button', { name: /More actions/i }).click();

        // Click delete
        await page.getByRole('menuitem', { name: /Delete/i }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: /Delete/i }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByText('ToDelete')).toBeHidden();
        await expect(page.getByText('inside_query')).toBeVisible();

        expect(folders.length).toBe(0);
        expect(queries[0].folderId).toBeNull();

        await expectAppHealthy(appErrors);
    });
});
