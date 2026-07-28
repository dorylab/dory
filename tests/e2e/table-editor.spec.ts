import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole } from './helpers/workbench';

test('edits SQLite table rows through the pending changes workflow', async ({ page, appErrors }) => {
    const connection = createWorkbenchConnection({
        id: 'sqlite-editor',
        name: 'SQLite Editor',
    }) as any;
    connection.connection.type = 'sqlite';
    connection.connection.engine = 'sqlite';
    connection.connection.database = 'demo';

    const rows = [
        { id: 1, name: 'one', note: 'first' },
        { id: 2, name: 'two', note: 'second' },
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
                ],
            });
            return;
        }
        if (payload.actionId === 'table.getProperties') {
            await success({
                properties: {
                    engine: 'sqlite',
                    totalRows: rows.length,
                    primaryKey: payload.input?.table === 'read_only' ? null : 'id',
                },
            });
            return;
        }
        if (payload.actionId === 'table.getStats') {
            await success({ stats: { rowCount: rows.length, partitions: [], partitionCount: 0, partCount: 0, activeMutations: [] } });
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
                        ],
                        totalRows: rows.length,
                        unfilteredTotalRows: rows.length,
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
    await nameCell.dblclick();
    const editor = nameCell.locator('input');
    await expect(editor).toBeVisible();
    await editor.fill('updated');
    await editor.press('Enter');
    await expect(nameCell).toContainText('updated');
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();

    const undoShortcut = process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';
    const redoShortcut = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z';
    await nameCell.focus();
    await page.keyboard.press(undoShortcut);
    await expect(nameCell).toContainText('one');
    await page.keyboard.press(redoShortcut);
    await expect(nameCell).toContainText('updated');

    const noteCell = page.locator('[data-cell="0@@note"]');
    await noteCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open Cell Inspector' }).click();
    await expect(page.getByText('Cell Inspector', { exact: true })).toBeVisible();
    await expect(page.getByText('note', { exact: true }).last()).toBeVisible();

    await noteCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Set to NULL' }).click();
    await expect(noteCell).toContainText('NULL');
    await page.getByRole('button', { name: 'Changes (2)' }).click();
    await expect(page.getByRole('tab', { name: /Pending Changes/ })).toBeVisible();
    await expect(page.getByText('updated', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('NULL', { exact: true }).last()).toBeVisible();

    await page.getByRole('tab', { name: 'SQL' }).click();
    await expect(page.getByText(/UPDATE "demo"\."numbers"/)).toBeVisible();
    await expect(page.getByText(/IS \?/)).toBeHidden();

    const saveShortcut = process.platform === 'darwin' ? 'Meta+S' : 'Control+S';
    await nameCell.focus();
    await page.keyboard.press(saveShortcut);
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(/2 fields.*1 UPDATE.*1 rows/i)).toBeVisible();
    await page.getByRole('button', { name: 'Commit now' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Changes (0)' })).toBeVisible();
    expect(rows[0]).toEqual({ id: 1, name: 'updated', note: null });

    rejectCommit = true;
    await page.getByRole('button', { name: 'Close utility panel' }).click();
    const conflictCell = page.locator('[data-cell="0@@name"]');
    await conflictCell.dblclick();
    const conflictEditor = conflictCell.locator('input');
    await expect(conflictEditor).toBeVisible();
    await conflictEditor.fill('conflict');
    await conflictEditor.press('Enter');
    await expect(conflictCell).toContainText('conflict');
    await page.getByRole('button', { name: 'Changes (1)' }).click();
    await page.getByRole('button', { name: 'Commit All (1)' }).click();
    await page.getByRole('button', { name: 'Commit now' }).click();
    await expect(page.getByText('The row changed after it was loaded.')).toBeVisible();
    expect(rows[0]?.name).toBe('updated');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.getByRole('button', { name: /Insert select for read_only/i }).click();
    await expect(page.getByText('Read-only', { exact: true })).toBeVisible();
    const readOnlyCell = page.locator('[data-cell="0@@name"]');
    await readOnlyCell.dblclick();
    await expect(readOnlyCell.locator('input')).toHaveCount(0);
    await expectAppHealthy(appErrors);
});
