import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { openDataSources } from './helpers/navigation';

test('local folder connections sync nested Markdown, preserve IDs and expose only viewing controls to readers', async ({ page, request }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(15_000);
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
        const tree = page.getByRole('navigation', { name: 'Directory' });
        const connectLocal = async () => {
            await expect(dialog).toBeHidden();
            await page.getByRole('button', { name: 'Knowledge base actions for ' + model.name, exact: true }).press('Enter');
            await page.getByRole('menuitem', { name: 'Knowledge sources' }).hover();
            await page.getByRole('menuitem', { name: 'Local folder' }).click();
        };
        const manage = (name: string) => tree.getByRole('button', { name: 'Actions for ' + name, exact: true }).click();
        await expect(tree.getByRole('button', { name: 'RULES.md', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Knowledge base actions for ' + model.name, exact: true }).click();
        await page.getByRole('menuitem', { name: 'New document' }).click();
        await dialog.getByLabel('Document title').fill('other.md');
        await dialog.getByLabel('Markdown content').fill('# Built-in version');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(tree.getByRole('button', { name: 'other.md', exact: true })).toBeVisible();

        const choose = async (path: string) => {
            // Exercise the native directory-input fallback using actual files on disk.
            await dialog.locator('input[type=file]').setInputFiles(path);
        };
        await connectLocal();
        await choose(folder);
        await expect(tree.getByRole('button', { name: 'Actions for ' + basename(folder), exact: true })).toBeVisible();
        await connectLocal();
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
        const sourceDialog = (name: string) => page.getByRole('dialog', { name, exact: true }).filter({ has: page.getByRole('link', { name: 'View in documents' }) });
        const secondSource = sourceDialog(secondName);
        await expect(tree.getByRole('button', { name: 'Actions for ' + secondName })).toBeVisible();
        await page.reload();
        await manage(secondName);
        const lastSync = await secondSource.getByText(/^Last synchronized /).boundingBox();
        const viewAction = await secondSource.getByRole('link', { name: 'View in documents' }).boundingBox();
        expect(viewAction!.y).toBeGreaterThanOrEqual(lastSync!.y + lastSync!.height);
        await secondSource.getByRole('button', { name: 'Sync now' }).click();
        await dialog.getByRole('button', { name: 'Sync now', exact: true }).click();
        await expect(secondSource).toBeVisible();
        const directory = await action('knowledge.listDirectory', scope);
        expect(directory.connectors.find((item: { displayName: string }) => item.displayName === secondName).syncedFolders).toContainEqual({
            name: 'empty subfolder',
            id: 'empty subfolder',
            parent: '',
        });
        const source = sourceDialog(basename(folder));
        await page.keyboard.press('Escape');
        await manage(basename(folder));
        await source.getByRole('link', { name: 'View in documents' }).click();
        await expect(tree.getByRole('button', { name: 'Actions for ' + secondName })).toBeVisible();
        const search = page.getByRole('searchbox', { name: 'Search knowledge bases, files or queries' });
        await search.fill('other.md');
        await expect(tree.getByRole('button').filter({ hasText: model.name + ' / other.md' })).toBeVisible();
        await expect(tree).toContainText(secondName + ' / other.md');
        await search.fill('');
        await page.getByRole('button', { name: 'orders 1 document', exact: true }).click();
        await page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: 'refund.markdown', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Refund policy' })).toBeVisible();
        await expect(page.getByRole('region').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        const addContent = page.getByRole('button', { name: 'Add content', exact: true });
        await addContent.click();
        await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
        await expect(dialog.getByText('Target folder: ' + model.name, { exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        const file = new URL(page.url()).searchParams.get('file')!;
        await manage(basename(folder));
        await source.getByRole('button', { name: 'Sync now' }).click();
        await choose(second);
        await expect(dialog.getByRole('alert')).toContainText(basename(folder));
        expect((await action('knowledge.getKnowledgeSource', { ...scope, id: file })).contentText).toBe('# Refund policy');
        await writeFile(join(folder, 'orders', 'refund.markdown'), '# Updated policy');
        await choose(folder);
        await expect(source).toBeVisible();
        expect((await action('knowledge.getKnowledgeSource', { ...scope, id: file })).contentText).toBe('# Updated policy');
        await source.getByRole('button', { name: 'Disconnect' }).click();
        await expect(dialog).toContainText(basename(folder));
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await page.route('**/api/actions/execute', async route => {
            if (!['knowledge.listConnectors', 'knowledge.listDirectory'].includes(route.request().postDataJSON().actionId)) return route.continue();
            const response = await route.fetch();
            const body = await response.json();
            await route.fulfill({ response, json: { ...body, data: { ...body.data, canWrite: false, canManageLinear: false } } });
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Updated policy' })).toBeVisible();
        await expect(addContent).toHaveCount(0);
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Actions for ' + basename(folder), exact: true }).click();
        await expect(source.getByRole('link', { name: 'View in documents' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Disconnect|Sync now/ })).toHaveCount(0);
        await page.unroute('**/api/actions/execute');
        await page.reload();
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Actions for ' + basename(folder), exact: true }).click();
        await source.getByRole('button', { name: 'Disconnect' }).click();
        await dialog.getByRole('button', { name: 'Disconnect' }).click();
        await expect(dialog).toBeHidden();
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Actions for ' + basename(folder), exact: true })).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: 'Actions for ' + secondName, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
        await Promise.all([rm(folder, { recursive: true }), rm(second, { recursive: true })]);
    }
});
