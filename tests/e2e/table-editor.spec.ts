import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole } from './helpers/workbench';

test('edits SQLite table rows through the pending changes workflow', async ({ page, appErrors }) => {
    test.setTimeout(120_000);

    const connection = createWorkbenchConnection({
        id: 'sqlite-editor',
        name: 'SQLite Editor',
    }) as any;
    connection.connection.type = 'sqlite';
    connection.connection.engine = 'sqlite';
    connection.connection.database = 'demo';

    const rows = [
        { id: 1, name: 'one', note: 'first', count: 10, active: true, created_at: '2026-08-01', payload: { source: 'seed' } },
        { id: 2, name: 'two', note: 'second', count: 20, active: false, created_at: '2026-08-02', payload: { source: 'seed' } },
    ];
    let rejectCommit = false;

    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', async route => {
        const payload = route.request().postDataJSON() as {
            actionId?: string;
            input?: {
                table?: string;
                rows?: Array<{
                    key: Record<string, unknown>;
                    changes: Array<{ column: string; originalValue: unknown; nextValue: unknown }>;
                }>;
            };
        };
        const success = async (data: unknown) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    data,
                    execution: {
                        actionId: payload.actionId,
                        runId: 'e2e-run',
                        startedAt: new Date().toISOString(),
                        finishedAt: new Date().toISOString(),
                    },
                }),
            });

        if (payload.actionId === 'connection.list') {
            await success({ connections: [connection] });
            return;
        }
        if (payload.actionId === 'connection.get') {
            await success(connection);
            return;
        }
        if (payload.actionId === 'connection.connect') {
            await success({ connectionId: 'sqlite-editor', identityId: 'identity-1', status: 'Connected' });
            return;
        }
        if (payload.actionId === 'schema.listDatabases') {
            await success({ databases: [{ label: 'demo', value: 'demo' }] });
            return;
        }
        if (payload.actionId === 'schema.listTables') {
            await success({
                tables: [
                    { label: 'numbers', value: 'numbers' },
                    { label: 'read_only', value: 'read_only' },
                ],
            });
            return;
        }
        if (payload.actionId === 'schema.listViews') {
            await success({ views: [] });
            return;
        }
        if (payload.actionId === 'tab.list') {
            await success([]);
            return;
        }
        if (payload.actionId === 'tab.create' || payload.actionId === 'tab.save') {
            await success((payload.input as any)?.state ?? {});
            return;
        }
        if (payload.actionId === 'tab.delete') {
            await success({ deleted: true });
            return;
        }
        if (payload.actionId === 'schema.describeTable') {
            const hasPrimaryKey = payload.input?.table !== 'read_only';
            await success({
                columns: [
                    { columnName: 'id', columnType: 'INTEGER', nullable: false, isPrimaryKey: hasPrimaryKey },
                    { columnName: 'name', columnType: 'TEXT', nullable: false, isPrimaryKey: false },
                    { columnName: 'note', columnType: 'TEXT', nullable: true, isPrimaryKey: false },
                    { columnName: 'count', columnType: 'INTEGER', nullable: false, isPrimaryKey: false },
                    { columnName: 'active', columnType: 'BOOLEAN', nullable: false, isPrimaryKey: false },
                    { columnName: 'created_at', columnType: 'DATE', nullable: false, isPrimaryKey: false },
                    { columnName: 'payload', columnType: 'JSON', nullable: true, isPrimaryKey: false },
                ],
            });
            return;
        }
        if (payload.actionId === 'table.getProperties') {
            await success({
                properties: {
                    engine: 'sqlite',
                    totalRows: 1000,
                    primaryKey: payload.input?.table === 'read_only' ? null : 'id',
                },
            });
            return;
        }
        if (payload.actionId === 'table.getStats') {
            await success({ stats: { rowCount: 1000, partitions: [], partitionCount: 0, partCount: 0, activeMutations: [] } });
            return;
        }
        if (payload.actionId === 'table.preview') {
            await success({
                queryResultSets: [
                    {
                        columns: [
                            { name: 'id', type: 'INTEGER' },
                            { name: 'name', type: 'TEXT' },
                            { name: 'note', type: 'TEXT' },
                            { name: 'count', type: 'INTEGER' },
                            { name: 'active', type: 'BOOLEAN' },
                            { name: 'created_at', type: 'DATE' },
                            { name: 'payload', type: 'JSON' },
                        ],
                        totalRows: 1000,
                        unfilteredTotalRows: 1000,
                    },
                ],
                results: [rows.map(row => ({ ...row }))],
            });
            return;
        }
        if (payload.actionId === 'table.commitUpdates') {
            if (rejectCommit) {
                await route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: false,
                        code: 'ACTION_EXECUTION_FAILED',
                        message: 'The row changed after it was loaded.',
                        details: { code: 'TABLE_MUTATION_CONFLICT', rowIndex: 0 },
                    }),
                });
                return;
            }
            for (const update of payload.input?.rows ?? []) {
                const row = rows.find(item => item.id === update.key.id);
                if (!row) continue;
                for (const change of update.changes) {
                    (row as Record<string, unknown>)[change.column] = change.nextValue;
                }
            }
            await success({
                updatedRows: payload.input?.rows?.length ?? 0,
                updatedCells: payload.input?.rows?.reduce((total, row) => total + row.changes.length, 0) ?? 0,
            });
            return;
        }

        await success({});
    });

    await openMockConnectionConsole(page, connection);
    await page.getByRole('button', { name: /Insert select for numbers/i }).click();

    const nameCell = page.locator('[data-cell="0@@name"]');
    await expect(nameCell).toContainText('one');
    const tableBrowserLayoutBox = await page.getByTestId('table-browser-layout').boundingBox();
    const searchBox = await page.getByPlaceholder('Search (Ctrl/Cmd+F to focus)').boundingBox();
    expect(tableBrowserLayoutBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(searchBox!.y - tableBrowserLayoutBox!.y).toBeCloseTo(4, 0);
    const subTabsFooter = page.getByTestId('table-subtabs-footer');
    const pagination = page.getByTestId('data-preview-pagination');
    await expect(subTabsFooter).toBeVisible();
    await expect(pagination).toBeVisible();
    await expect(pagination.getByRole('button', { name: 'First page' })).toHaveCount(0);
    await expect(pagination.getByText('Go to', { exact: true })).toHaveCount(0);
    const subTabsFooterBox = await subTabsFooter.boundingBox();
    const paginationBox = await pagination.boundingBox();
    const dataTabBox = await subTabsFooter.getByRole('tab', { name: 'Data' }).boundingBox();
    const nameCellBox = await nameCell.boundingBox();
    expect(subTabsFooterBox).not.toBeNull();
    expect(paginationBox).not.toBeNull();
    expect(dataTabBox).not.toBeNull();
    expect(nameCellBox).not.toBeNull();
    expect(subTabsFooterBox!.height).toBeCloseTo(28, 0);
    expect(dataTabBox!.height).toBeLessThanOrEqual(24);
    expect(paginationBox!.height).toBeLessThanOrEqual(24);
    expect(Math.abs(paginationBox!.y + paginationBox!.height / 2 - (subTabsFooterBox!.y + subTabsFooterBox!.height / 2))).toBeLessThanOrEqual(1);
    expect(dataTabBox!.x + dataTabBox!.width).toBeLessThan(paginationBox!.x);
    expect(subTabsFooterBox!.y).toBeGreaterThan(nameCellBox!.y + nameCellBox!.height);

    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 720, height: 720 });
    const compactFooterMetrics = await subTabsFooter.evaluate(element => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        offsetHeight: element.offsetHeight,
        overflowY: getComputedStyle(element).overflowY,
        scrollWidth: element.scrollWidth,
    }));
    expect(compactFooterMetrics.offsetHeight).toBe(28);
    expect(compactFooterMetrics.overflowY).toBe('hidden');
    expect(compactFooterMetrics.scrollWidth).toBeGreaterThan(compactFooterMetrics.clientWidth);
    const footerScrollLeft = await subTabsFooter.evaluate(element => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
    });
    expect(footerScrollLeft).toBeGreaterThan(0);
    if (originalViewport) {
        await page.setViewportSize(originalViewport);
    }

    await subTabsFooter.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByTestId('data-preview-pagination')).toHaveCount(0);
    await subTabsFooter.getByRole('tab', { name: 'Data' }).click();
    await expect(pagination).toBeVisible();
    await expect(nameCell).toContainText('one');

    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('previewPage')).toBe('2');
    await expect(pagination.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute('aria-current', 'page');
    await pagination.getByRole('button', { name: 'Previous' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('previewPage')).toBeNull();
    await pagination.getByRole('combobox').click();
    await page.getByRole('option', { name: '50', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('previewPageSize')).toBe('50');
    await expect(nameCell).toContainText('one');

    await nameCell.click();
    const inspectorPanel = page.getByTestId('cell-inspector-panel');
    await expect(inspectorPanel).toBeVisible();
    await expect(inspectorPanel.getByText('Row details', { exact: true })).toBeVisible();
    await expect(inspectorPanel.getByTestId('row-editor-field')).toHaveCount(7);
    await expect(inspectorPanel.getByLabel('Primary key')).toBeVisible();
    await expect(inspectorPanel.getByLabel('id', { exact: true })).toBeDisabled();
    await expect(nameCell).toHaveAttribute('data-active-row', 'true');

    const fieldSearch = inspectorPanel.getByPlaceholder('Filter fields...');
    await fieldSearch.fill('boolean');
    await expect(inspectorPanel.getByTestId('row-editor-field')).toHaveCount(1);
    await expect(inspectorPanel.locator('[data-testid="row-editor-field"][data-column="active"]')).toBeVisible();
    await fieldSearch.clear();
    await inspectorPanel.getByRole('button', { name: 'View JSON' }).click();
    await expect(inspectorPanel.getByRole('button', { name: 'Copy JSON' })).toBeVisible();
    await expect(inspectorPanel.getByRole('textbox')).toHaveCount(0);
    await inspectorPanel.getByRole('button', { name: 'View table' }).click();

    const rowNameInput = inspectorPanel.getByLabel('name', { exact: true });
    await rowNameInput.fill('updated');
    await rowNameInput.press('Enter');
    await expect(nameCell).toContainText('updated');
    await expect(nameCell).toHaveAttribute('data-changed', 'true');
    await expect(nameCell).toHaveClass(/text-orange-700/);
    await expect(page.getByTestId('pending-row-indicator')).toHaveClass(/bg-orange-500/);
    const changesButton = page.getByRole('button', { name: 'Changes (1)' });
    await expect(changesButton).toHaveClass(/border-orange-500/);
    await expect(changesButton.getByTestId('pending-changes-indicator')).toHaveClass(/bg-orange-500/);

    const secondRowNameCell = page.locator('[data-cell="1@@name"]');
    await secondRowNameCell.click();
    await expect(inspectorPanel.getByLabel('name', { exact: true })).toHaveValue('two');
    await expect(secondRowNameCell).toHaveAttribute('data-active-row', 'true');
    await nameCell.click();
    await expect(inspectorPanel.getByLabel('name', { exact: true })).toHaveValue('updated');

    const countField = inspectorPanel.locator('[data-testid="row-editor-field"][data-column="count"]');
    await countField.getByLabel('count').fill('11');
    await countField.getByLabel('count').press('Enter');
    await expect(page.locator('[data-cell="0@@count"]')).toContainText('11');
    await expect(page.getByRole('button', { name: 'Changes (2)' })).toBeVisible();
    await countField.getByRole('button', { name: 'Revert count' }).click();
    await expect(page.locator('[data-cell="0@@count"]')).toContainText('10');

    const activeField = inspectorPanel.locator('[data-testid="row-editor-field"][data-column="active"]');
    await activeField.getByLabel('active').selectOption('false');
    await activeField.getByLabel('active').blur();
    await expect(page.locator('[data-cell="0@@active"]')).toContainText('false');
    await activeField.getByRole('button', { name: 'Revert active' }).click();

    const dateField = inspectorPanel.locator('[data-testid="row-editor-field"][data-column="created_at"]');
    await dateField.getByLabel('created_at').fill('2026-08-03');
    await dateField.getByLabel('created_at').press('Enter');
    await expect(page.locator('[data-cell="0@@created_at"]')).toContainText('2026-08-03');
    await dateField.getByRole('button', { name: 'Revert created_at' }).click();

    const noteField = inspectorPanel.locator('[data-testid="row-editor-field"][data-column="note"]');
    await noteField.getByRole('button', { name: 'Set NULL' }).click();
    await expect(page.locator('[data-cell="0@@note"]')).toContainText('NULL');
    await noteField.getByRole('button', { name: 'Revert note' }).click();
    await expect(page.locator('[data-cell="0@@note"]')).toContainText('first');
    await expect(inspectorPanel.locator('[data-testid="row-editor-field"][data-column="payload"] pre')).toContainText('"source": "seed"');
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();

    const undoShortcut = process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';
    const redoShortcut = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z';
    await nameCell.focus();
    await page.keyboard.press(undoShortcut);
    await expect(nameCell).toContainText('one');
    await expect(nameCell).not.toHaveAttribute('data-changed', 'true');
    await expect(page.getByTestId('pending-row-indicator')).toHaveCount(0);
    await expect(page.getByTestId('pending-changes-indicator')).toHaveCount(0);
    await page.keyboard.press(redoShortcut);
    await expect(nameCell).toContainText('updated');
    await expect(nameCell).toHaveAttribute('data-changed', 'true');

    const noteCell = page.locator('[data-cell="0@@note"]');
    await noteCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open Cell Inspector' }).click();
    await expect(inspectorPanel).toBeVisible();
    await expect(inspectorPanel.getByText('Cell inspector', { exact: true })).toBeVisible();
    await expect(inspectorPanel.getByText(/Row 1 · note/)).toBeVisible();
    await expect(page.getByTestId('table-editor-panel')).toHaveCount(0);
    const inspectorBox = await inspectorPanel.boundingBox();
    expect(inspectorBox).not.toBeNull();
    expect(inspectorBox!.y).toBeCloseTo(0, 0);
    expect(inspectorBox!.height).toBeCloseTo(page.viewportSize()!.height, 0);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const inspectorSurfaceColors = await page.evaluate(() => {
        const appSidebar = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"]')).find(element => element.getClientRects().length > 0) ?? null;
        const tableSidebar = document.querySelector<HTMLElement>('[data-testid="sql-console-sidebar-surface"]');
        const tableSurface = document.querySelector<HTMLElement>('[data-testid="vtable-surface"]');
        const inspector = document.querySelector<HTMLElement>('[data-testid="cell-inspector-panel"]');
        const backgroundAlpha = (element: HTMLElement | null) => {
            if (!element) return null;
            const color = getComputedStyle(element).backgroundColor;
            const slashAlpha = color.match(/\/\s*([\d.]+)(%)?\s*\)$/);
            if (slashAlpha) {
                const alpha = Number(slashAlpha[1]);
                return slashAlpha[2] ? alpha / 100 : alpha;
            }
            const rgbaAlpha = color.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/);
            return rgbaAlpha ? Number(rgbaAlpha[1]) : 1;
        };

        return {
            appSidebar: appSidebar ? getComputedStyle(appSidebar).backgroundColor : null,
            tableSidebar: tableSidebar ? getComputedStyle(tableSidebar).backgroundColor : null,
            tableSidebarBorderWidth: tableSidebar ? getComputedStyle(tableSidebar).borderLeftWidth : null,
            tableSidebarBorderStyle: tableSidebar ? getComputedStyle(tableSidebar).borderLeftStyle : null,
            table: tableSurface ? getComputedStyle(tableSurface).backgroundColor : null,
            inspector: inspector ? getComputedStyle(inspector).backgroundColor : null,
            inspectorAlpha: backgroundAlpha(inspector),
        };
    });
    expect(inspectorSurfaceColors.appSidebar).not.toBeNull();
    expect(inspectorSurfaceColors.tableSidebar).toBe(inspectorSurfaceColors.appSidebar);
    expect(inspectorSurfaceColors.tableSidebarBorderWidth).toBe('1px');
    expect(inspectorSurfaceColors.tableSidebarBorderStyle).toBe('solid');
    expect(inspectorSurfaceColors.table).toBe(inspectorSurfaceColors.appSidebar);
    expect(inspectorSurfaceColors.inspector).toBe(inspectorSurfaceColors.appSidebar);
    expect(inspectorSurfaceColors.inspectorAlpha).toBe(1);
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await inspectorPanel.getByRole('button', { name: 'Close' }).click();

    await nameCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'View row details' }).click();
    await expect(inspectorPanel.getByText('Row details', { exact: true })).toBeVisible();
    await expect(inspectorPanel.getByTestId('inspector-review-changes')).toHaveAccessibleName('Review changes (1)');
    await inspectorPanel.getByRole('button', { name: 'View JSON' }).click();
    await expect(inspectorPanel.getByRole('button', { name: 'Copy JSON' })).toBeVisible();
    await inspectorPanel.getByRole('button', { name: 'Close' }).click();

    await noteCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Set to NULL' }).click();
    await expect(noteCell).toContainText('NULL');
    await expect(noteCell).toHaveAttribute('data-changed', 'true');
    await nameCell.click();
    await expect(inspectorPanel).toBeVisible();
    await inspectorPanel.getByRole('button', { name: 'Review changes (2)' }).click();
    const editorPanel = page.getByTestId('table-editor-panel');
    await expect(editorPanel).toBeVisible();
    await expect(editorPanel.getByText(/Pending Changes/)).toBeVisible();
    const pendingCards = editorPanel.getByTestId('pending-change-card');
    const nameCard = editorPanel.locator('[data-testid="pending-change-card"][data-column="name"]');
    const noteCard = editorPanel.locator('[data-testid="pending-change-card"][data-column="note"]');
    await expect(pendingCards).toHaveCount(2);
    await expect(nameCard).toContainText('numbers');
    await expect(nameCard).toContainText('id=1');
    await expect(nameCard).toContainText('name');
    await expect(nameCard).toContainText('one');
    await expect(nameCard).toContainText('updated');
    await expect(noteCard).toContainText('numbers');
    await expect(noteCard).toContainText('id=1');
    await expect(noteCard).toContainText('note');
    await expect(noteCard).toContainText('first');
    await expect(noteCard).toContainText('NULL');
    await expect(nameCard.getByTestId('pending-change-card-indicator')).toHaveClass(/bg-orange-500/);
    await expect(page.getByTestId('cell-inspector-panel')).toHaveCount(0);
    await expect(editorPanel.getByRole('tab', { name: /Pending Changes/ })).toHaveCount(0);
    const editorBox = await editorPanel.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(editorBox!.y).toBeCloseTo(inspectorBox!.y, 0);
    expect(editorBox!.height).toBeCloseTo(inspectorBox!.height, 0);
    expect(editorBox!.y).toBeCloseTo(0, 0);
    expect(editorBox!.height).toBeCloseTo(page.viewportSize()!.height, 0);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const darkSurfaceColors = await page.evaluate(() => {
        const appSidebar = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"]')).find(element => element.getClientRects().length > 0) ?? null;
        const tableSidebar = document.querySelector<HTMLElement>('[data-testid="sql-console-sidebar-surface"]');
        const tableSurface = document.querySelector<HTMLElement>('[data-testid="vtable-surface"]');
        const editorPanelElement = document.querySelector<HTMLElement>('[data-testid="table-editor-panel"]');
        const card = document.querySelector<HTMLElement>('[data-testid="pending-change-card"]');
        const backgroundAlpha = (element: HTMLElement | null) => {
            if (!element) return null;
            const color = getComputedStyle(element).backgroundColor;
            const slashAlpha = color.match(/\/\s*([\d.]+)(%)?\s*\)$/);
            if (slashAlpha) {
                const alpha = Number(slashAlpha[1]);
                return slashAlpha[2] ? alpha / 100 : alpha;
            }
            const rgbaAlpha = color.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/);
            return rgbaAlpha ? Number(rgbaAlpha[1]) : 1;
        };

        return {
            appSidebar: appSidebar ? getComputedStyle(appSidebar).backgroundColor : null,
            tableSidebar: tableSidebar ? getComputedStyle(tableSidebar).backgroundColor : null,
            table: tableSurface ? getComputedStyle(tableSurface).backgroundColor : null,
            editor: editorPanelElement ? getComputedStyle(editorPanelElement).backgroundColor : null,
            card: card ? getComputedStyle(card).backgroundColor : null,
            editorAlpha: backgroundAlpha(editorPanelElement),
        };
    });
    expect(darkSurfaceColors.appSidebar).not.toBeNull();
    expect(darkSurfaceColors.tableSidebar).toBe(darkSurfaceColors.appSidebar);
    expect(darkSurfaceColors.table).toBe(darkSurfaceColors.appSidebar);
    expect(darkSurfaceColors.editor).not.toBeNull();
    expect(darkSurfaceColors.card).not.toBeNull();
    expect(darkSurfaceColors.editor).toBe(darkSurfaceColors.appSidebar);
    expect(darkSurfaceColors.editorAlpha).toBe(1);
    expect(darkSurfaceColors.card).not.toBe(darkSurfaceColors.editor);
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    const commitAllButton = editorPanel.getByRole('button', { name: 'Commit All (2)' });
    await expect(editorPanel.getByText('All updates commit atomically.')).toHaveCount(0);
    await commitAllButton.hover();
    await expect(page.getByRole('tooltip')).toHaveText('All updates commit atomically.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await commitAllButton.focus();
    await expect(page.getByRole('tooltip')).toHaveText('All updates commit atomically.');
    await page.keyboard.press('Escape');

    await nameCard.getByRole('button', { name: 'Jump to cell' }).click();
    await expect(nameCell).toHaveClass(/bg-primary\/10/);
    await noteCard.getByRole('button', { name: 'Revert this cell' }).click();
    await expect(pendingCards).toHaveCount(1);
    await expect(noteCell).not.toHaveAttribute('data-changed', 'true');
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
    await nameCell.focus();
    await page.keyboard.press(undoShortcut);
    await expect(pendingCards).toHaveCount(2);
    await expect(noteCell).toHaveAttribute('data-changed', 'true');

    await editorPanel.getByRole('tab', { name: 'SQL' }).click();
    await expect(editorPanel.getByText(/UPDATE "demo"\."numbers"/)).toBeVisible();
    await expect(page.getByText(/IS \?/)).toBeHidden();

    const saveShortcut = process.platform === 'darwin' ? 'Meta+S' : 'Control+S';
    await nameCell.focus();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.keyboard.press(saveShortcut);
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(/2 fields.*1 UPDATE.*1 rows/i)).toBeVisible();
    const commitSqlPreview = page.getByTestId('commit-sql-preview');
    const commitSqlPreviewStyle = await commitSqlPreview.evaluate(element => {
        const style = getComputedStyle(element);
        return {
            backgroundColor: style.backgroundColor,
            borderWidth: style.borderWidth,
            padding: style.padding,
        };
    });
    expect(commitSqlPreviewStyle).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderWidth: '0px',
        padding: '0px',
    });
    const alertDialogOverlay = page.locator('[data-slot="alert-dialog-overlay"]');
    await expect.poll(() => alertDialogOverlay.evaluate(element => getComputedStyle(element).backgroundColor)).toContain('0.75');
    await page.getByRole('button', { name: 'Commit now' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await expect(page.getByRole('button', { name: 'Changes (0)' })).toBeVisible();
    await expect(page.getByTestId('pending-changes-indicator')).toHaveCount(0);
    await expect(page.getByTestId('pending-row-indicator')).toHaveCount(0);
    await expect(nameCell).not.toHaveAttribute('data-changed', 'true');
    await expect(noteCell).not.toHaveAttribute('data-changed', 'true');
    expect(rows[0]).toEqual({ id: 1, name: 'updated', note: null, count: 10, active: true, created_at: '2026-08-01', payload: { source: 'seed' } });

    rejectCommit = true;
    await page.getByRole('button', { name: 'Close editor panel' }).click();
    const conflictCell = page.locator('[data-cell="0@@name"]');
    await conflictCell.dblclick();
    const conflictEditor = conflictCell.locator('input');
    await expect(conflictEditor).toBeVisible();
    await conflictEditor.fill('conflict');
    await conflictEditor.press('Enter');
    await expect(conflictCell).toContainText('conflict');
    await expect(conflictCell).toHaveAttribute('data-changed', 'true');
    await page.getByRole('button', { name: 'Changes (1)' }).click();
    await page.getByRole('button', { name: 'Commit All (1)' }).click();
    await page.getByRole('button', { name: 'Commit now' }).click();
    await expect(page.getByText('The row changed after it was loaded.')).toBeVisible();
    expect(rows[0]?.name).toBe('updated');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
    await expect(conflictCell).toHaveAttribute('data-changed', 'true');
    await editorPanel.getByRole('tab', { name: 'Visual' }).click();
    await expect(editorPanel.getByTestId('pending-change-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(conflictCell).not.toHaveAttribute('data-changed', 'true');
    await expect(page.getByTestId('pending-changes-indicator')).toHaveCount(0);
    await page.getByRole('button', { name: /Insert select for read_only/i }).click();
    await expect(page.getByText('Read-only', { exact: true })).toBeVisible();
    const readOnlyCell = page.locator('[data-cell="0@@name"]');
    await readOnlyCell.click();
    await expect(inspectorPanel).toBeVisible();
    await expect(inspectorPanel.getByLabel('name', { exact: true })).toBeDisabled();
    await expect(inspectorPanel.getByText('This table has no primary key, so editing is disabled.')).toBeVisible();
    await readOnlyCell.dblclick();
    await expect(readOnlyCell.locator('input')).toHaveCount(0);
    await expectAppHealthy(appErrors);
});
