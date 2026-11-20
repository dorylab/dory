import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { openDataSources } from './helpers/navigation';

test('local folder connections sync nested Markdown, preserve IDs and expose only viewing controls to readers', async ({ page, request }) => {
    test.setTimeout(150000);
    await page.goto('/');
    await openDataSources(page);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const action = async (actionId: string, input: Record<string, unknown>, confirmationToken?: string) => {
        const res = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await res.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    };
    const folder = await mkdtemp(join(tmpdir(), 'dory-folder-'));
    const second = await mkdtemp(join(tmpdir(), 'dory-other-'));
    const { connections } = await action('connection.list', {});
    const model = await action('knowledge.create', { name: basename(folder), connectionIds: [connections[0].connection.id] });
    const scope = { knowledgeModelId: model.id };
    try {
        await mkdir(join(folder, 'orders'));
        await writeFile(join(folder, 'orders', 'refund.markdown'), '# Refund policy');
        await writeFile(join(folder, 'skip.txt'), 'Ignored');
        await writeFile(join(second, 'other.md'), 'Second folder');
        const url = `/${organization}/knowledge/${model.id}`;
        await page.goto(url);
        const dialog = page.getByRole('dialog');
        const existing = page.getByRole('region', { name: 'Existing sources' });
        const tree = page.getByRole('navigation', { name: 'Directory' });
        await expect(tree.getByRole('button', { name: 'Dory 0', exact: true })).toHaveAttribute('aria-current', 'location');
        await page.getByRole('button', { name: 'New', exact: true }).click();
        await page.getByRole('menuitem', { name: 'New document' }).click();
        await dialog.getByLabel('Document title').fill('other.md');
        await dialog.getByLabel('Markdown content').fill('# Built-in version');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(tree.getByRole('button', { name: 'Dory 1', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Knowledge sources' }).click();
        await expect(page.getByText('Built into this knowledge base', { exact: true })).toBeVisible();
        const choose = async (path: string) => {
            // Exercise the native directory-input fallback using actual files on disk.
            await dialog.locator('input[type=file]').setInputFiles(path);
        };
        await page.getByRole('button', { name: 'Local folder 1 source' }).click();
        await choose(folder);
        await expect(existing.getByRole('heading', { name: basename(folder), exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Local folder 2 sources' }).click();
        // Supply a real browser directory handle at the OS selection boundary.
        const secondName = basename(second);
        await page.evaluate(async name => {
            const root = await navigator.storage.getDirectory();
            const directory = await root.getDirectoryHandle(name, { create: true });
            await directory.getDirectoryHandle('empty subfolder', { create: true });
            const document = await directory.getFileHandle('other.md', { create: true });
            const writer = await document.createWritable();
            await writer.write('Second folder');
            await writer.close();
            Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => directory });
        }, secondName);
        await dialog.getByRole('button', { name: 'Choose folder' }).click();
        const secondRow = existing.getByRole('listitem').filter({ has: page.getByRole('heading', { name: secondName, exact: true }) });
        await expect(secondRow).toBeVisible();
        await page.reload();
        await expect(page.getByRole('button', { name: 'Local folder 3 sources' })).toBeVisible();
        await secondRow.getByRole('button', { name: 'Sync now' }).click();
        await dialog.getByRole('button', { name: 'Sync now', exact: true }).click();
        await expect(secondRow).toBeVisible();
        const directory = await action('knowledge.listDirectory', scope);
        expect(directory.connectors.find((item: { displayName: string }) => item.displayName === secondName).syncedFolders).toContainEqual({
            name: 'empty subfolder',
            id: 'empty subfolder',
            parent: '',
        });
        const row = existing.getByRole('listitem').filter({ has: page.getByRole('heading', { name: basename(folder), exact: true }) });
        await row.getByRole('link', { name: 'View in documents' }).click();
        await expect(tree.locator(':scope > ul > li')).toHaveCount(3);
        await expect(tree.locator(':scope > ul > li').first()).toContainText('Dory');
        const search = page.getByRole('searchbox', { name: 'Search folders and documents' });
        await search.fill('other.md');
        await expect(tree.getByRole('button')).toHaveCount(2);
        await expect(tree).toContainText('Dory / other.md');
        await expect(tree).toContainText(secondName + ' / other.md');
        await search.fill('');
        await page.getByRole('button', { name: 'orders 1 document', exact: true }).click();
        await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'refund.markdown', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Refund policy' })).toBeVisible();
        await expect(page.getByRole('region').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        const file = new URL(page.url()).searchParams.get('file')!;
        await page.getByRole('tab', { name: 'Knowledge sources' }).click();
        await expect(page.getByRole('button', { name: 'Local folder 3 sources' })).toBeVisible();
        await row.getByRole('button', { name: 'Sync now' }).click();
        await choose(second);
        await expect(dialog.getByRole('alert')).toContainText(basename(folder));
        expect((await action('knowledge.getKnowledgeSource', { ...scope, id: file })).contentText).toBe('# Refund policy');
        await writeFile(join(folder, 'orders', 'refund.markdown'), '# Updated policy');
        await choose(folder);
        await expect(dialog).toBeHidden();
        expect((await action('knowledge.getKnowledgeSource', { ...scope, id: file })).contentText).toBe('# Updated policy');
        await row.getByRole('button', { name: 'Disconnect' }).click();
        await expect(dialog).toContainText(basename(folder));
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await page.route('**/api/actions/execute', async route => {
            if (route.request().postDataJSON().actionId !== 'knowledge.listConnectors') return route.continue();
            const response = await route.fetch();
            const body = await response.json();
            await route.fulfill({ response, json: { ...body, data: { ...body.data, canWrite: false, canManageLinear: false } } });
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await expect(page.getByRole('button', { name: 'Local folder 3 sources' })).toBeVisible();
        await expect(row.getByRole('link', { name: 'View in documents' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Local folder 3 sources' })).toBeDisabled();
        await expect(page.getByRole('button', { name: /Disconnect|Sync now/ })).toHaveCount(0);
        await page.unroute('**/api/actions/execute');
        await page.reload();
        await row.getByRole('button', { name: 'Disconnect' }).click();
        await dialog.getByRole('button', { name: 'Disconnect' }).click();
        await expect(row).toHaveCount(0);
        await expect(secondRow.getByRole('link', { name: 'View in documents' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Local folder 2 sources' })).toBeEnabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
        await Promise.all([rm(folder, { recursive: true }), rm(second, { recursive: true })]);
    }
});
