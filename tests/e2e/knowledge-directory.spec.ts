import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { openDataSources } from './helpers/navigation';

function knowledgeActions(request: APIRequestContext) {
    return async function action<T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    };
}

test('organizes nested Markdown, preserves navigation and follows a moved query source', async ({ page, request }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await openDataSources(page);
    const slug = new URL(page.url()).pathname.split('/')[1]!;
    const action = knowledgeActions(request);
    const { connections } = await action<{ connections: { connection: { id: string } }[] }>('connection.list', {});
    const connectionId = connections[0]!.connection.id;
    const name = 'Directory ' + randomUUID().slice(0, 8);
    const { id: knowledgeModelId } = await action<{ id: string }>('knowledge.create', { name, connectionIds: [connectionId] });
    const scope = { knowledgeModelId };
    const crumb = page.getByRole('navigation', { name: 'Folder path' });
    const tree = page.getByRole('navigation', { name: 'Directory' });
    const dialog = page.getByRole('dialog');
    const card = (folder: string, count: number) => page.getByRole('button', { name: folder + ' ' + count + ' ' + (count === 1 ? 'document' : 'documents'), exact: true });
    async function newItem(label: string) {
        await page.getByRole('button', { name: 'New', exact: true }).click();
        await page.getByRole('menuitem', { name: label, exact: true }).click();
    }
    async function submit() {
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog).toBeHidden();
    }
    async function menu(label: string, item: string) {
        await page.getByRole('button', { name: 'Actions for ' + label, exact: true }).click();
        await page.getByRole('menuitem', { name: item, exact: true }).click();
    }
    try {
        await page.goto('/' + slug + '/knowledge/' + knowledgeModelId);
        for (const folder of ['Operations', 'Orders', 'Refunds']) {
            await newItem('New folder');
            await dialog.getByRole('textbox', { name: 'Name' }).fill(folder);
            await submit();
            await card(folder, 0).click();
        }
        await newItem('New document');
        await dialog.getByLabel('Document title').fill('Policy');
        await dialog.getByLabel('Markdown content').fill('# Refund window');
        await submit();
        const [source] = (await action<{ sources: { id: string; folderId: string }[] }>('knowledge.listKnowledgeSources', scope)).sources;
        await action('knowledge.createVerifiedQuery', {
            ...scope,
            sourceConnectionId: connectionId,
            title: 'Refund SQL',
            question: 'Which orders were refunded?',
            sql: 'SELECT 1',
            knowledgeSourceIds: [source!.id],
        });
        await expect(page).toHaveURL(new RegExp('folder=' + source!.folderId));
        await page.reload();
        await expect(crumb.getByRole('button', { name: 'Refunds' })).toHaveAttribute('aria-current', 'page');
        await expect(tree.getByRole('button', { name: 'Policy.md', exact: true })).toBeVisible();
        await newItem('Upload Markdown');
        await dialog.locator('input[type=file]').setInputFiles({ name: 'Checklist.md', mimeType: 'text/markdown', buffer: Buffer.from('# Check') });
        await dialog.getByRole('button', { name: /Upload 1/ }).click();
        await expect(dialog).toBeHidden();
        const checklist = tree.getByRole('button', { name: 'Checklist.md', exact: true });
        await tree.getByRole('button', { name: 'Collapse Refunds' }).click();
        await expect(checklist).toBeHidden();
        await tree.getByRole('button', { name: 'Expand Refunds' }).click();
        await checklist.click();
        await expect(checklist).toHaveAttribute('aria-current', 'page');
        await expect(page).toHaveURL(/file=/);
        const originalLink = page.url();
        await page.reload();
        await expect(page.getByRole('region', { name: 'Checklist.md' }).getByRole('heading', { name: 'Check', exact: true })).toBeVisible();
        await expect(crumb.locator('[aria-current="page"]')).toHaveText('Checklist.md');
        await crumb.getByRole('button', { name: 'Refunds' }).click();
        await menu('Checklist.md', 'Move to…');
        await dialog.getByRole('combobox').selectOption({ label: name });
        await submit();
        await crumb.getByRole('button', { name, exact: true }).click();
        await expect(card('Operations', 1)).toBeVisible();
        await expect(page).not.toHaveURL(/[?&]folder=/);
        await page.goBack();
        await expect(crumb.getByRole('button', { name: 'Refunds' })).toBeVisible();
        await page.goForward();
        await page.locator('section').getByRole('button', { name: 'Checklist.md', exact: true }).dragTo(card('Operations', 1));
        await expect(card('Operations', 2)).toBeVisible();
        await page.goto(originalLink);
        await expect(crumb.locator('[aria-current="page"]')).toHaveText('Checklist.md');
        await expect(crumb.getByRole('button', { name: 'Refunds' })).toHaveCount(0);
        await expect(page).not.toHaveURL(originalLink);
        await crumb.getByRole('button', { name, exact: true }).click();
        await tree.getByRole('button', { name: 'Collapse Operations' }).click();
        await expect(tree.getByRole('button', { name: /^Orders \d/ })).toBeHidden();
        await tree.getByRole('button', { name: 'Expand Operations' }).click();
        await tree.getByRole('button', { name: 'Orders 1', exact: true }).click();
        await tree.getByRole('button', { name: 'Actions for Refunds' }).click();
        await page.getByRole('menuitem', { name: 'Move to…' }).click();
        await dialog.getByRole('combobox').selectOption({ label: name });
        await submit();
        await crumb.getByRole('button', { name, exact: true }).click();
        await card('Refunds', 1).dragTo(card('Operations', 1));
        await expect(card('Operations', 2)).toBeVisible();
        await newItem('New document');
        await dialog.getByLabel('Document title').fill('Policy');
        await dialog.getByLabel('Markdown content').fill('# Root policy');
        await submit();
        await page.getByRole('searchbox').fill('Policy');
        await expect(tree.getByRole('button', { name: /Policy.md/ })).toHaveCount(2);
        await expect(tree).toContainText(name + ' / Operations / Refunds / Policy.md');
        await tree.getByRole('button', { name: /Refunds \/ Policy.md/ }).click();
        await expect(page.getByRole('region', { name: 'Policy.md' }).getByRole('heading', { name: 'Refund window' })).toBeVisible();
        await crumb.getByRole('button', { name: 'Refunds', exact: true }).click();
        await menu('Policy.md', 'Rename');
        await dialog.getByRole('textbox').fill('Updated policy.md');
        await submit();
        if (!(await page.locator('html').evaluate(element => element.classList.contains('dark')))) await page.getByRole('button', { name: /toggle theme/i }).click();
        await expect(page.locator('html')).toHaveClass(/dark/);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Operations 2', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(crumb.getByRole('button', { name: 'Operations' })).toHaveAttribute('aria-current', 'page');
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('tab', { name: 'Verified queries' }).click();
        await page.getByRole('button', { name: 'Which orders were refunded?' }).click();
        const sourceLink = page.getByRole('link', { name: 'Updated policy.md', exact: true });
        await expect(sourceLink).toHaveAttribute('href', '?tab=sources&source=' + source!.id);
        await sourceLink.click();
        await expect(page.getByRole('link', { name: 'Refund SQL', exact: true })).toBeVisible();
        await menu('Updated policy.md', 'View');
        await expect(dialog.getByRole('heading', { name: 'Refund window' })).toBeVisible();
        await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(dialog.getByLabel('Markdown content')).toHaveValue('# Refund window');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog.getByRole('heading', { name: 'Refund window' })).toBeVisible();
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});

test('creates in a targeted directory, retries only failed uploads and returns to the Markdown reader', async ({ page, request }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await openDataSources(page);
    const slug = new URL(page.url()).pathname.split('/')[1]!;
    const action = knowledgeActions(request);
    const { connections } = await action<{ connections: { connection: { id: string } }[] }>('connection.list', {});
    const name = 'Folder actions ' + randomUUID().slice(0, 8);
    const model = await action<{ id: string }>('knowledge.create', { name, connectionIds: [connections[0]!.connection.id] });
    const scope = { knowledgeModelId: model.id };
    const url = '/' + slug + '/knowledge/' + model.id;
    const dialog = page.getByRole('dialog');
    const tree = page.getByRole('navigation', { name: 'Directory' });
    const crumbs = page.getByRole('navigation', { name: 'Folder path' });
    const choose = async (item: string) => page.getByRole('menuitem', { name: item, exact: true }).click();
    const save = async () => dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const cancel = async () => dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const folder = async (name: string, parentId: string | null = null) =>
        (await action<{ id: string }>('knowledge.changeDirectory', { ...scope, change: { operation: 'create', name, parentId } })).id;
    try {
        const ops = await folder('Operations');
        const orders = await folder('Orders', ops);
        const returns = await folder('Returns', orders);
        const support = await folder('Support', ops);
        await page.goto(url + '?folder=' + ops);
        const ordersMenu = page.locator('section').getByRole('button', { name: 'Actions for Orders', exact: true });
        await ordersMenu.click();
        await choose('New folder');
        await expect(dialog).toContainText(name + ' / Operations / Orders');
        await dialog.getByLabel('Name', { exact: true }).fill('Returns');
        await save();
        await expect(page.getByText(/already exists/i).first()).toBeVisible();
        await expect(page).toHaveURL(new RegExp('folder=' + ops));
        await dialog.getByLabel('Name', { exact: true }).fill('Exchanges');
        await save();
        await expect(page).toHaveURL(new RegExp('folder=' + orders));
        await expect(page.getByRole('button', { name: 'Exchanges 0 documents' })).toBeVisible();
        await page.goBack();
        await expect(crumbs.getByRole('button', { name: 'Operations' })).toHaveAttribute('aria-current', 'page');
        await tree.getByRole('button', { name: 'Actions for Returns' }).click();
        await choose('New document');
        await expect(dialog).toContainText(name + ' / Operations / Orders / Returns');
        await cancel();
        await expect(page).toHaveURL(new RegExp('folder=' + ops));
        await tree.getByRole('button', { name: 'Actions for Returns' }).click();
        await choose('New document');
        await dialog.getByLabel('Document title').fill('Window');
        await dialog.getByLabel('Markdown content').fill('# Returns policy');
        await save();
        await expect(page).toHaveURL(new RegExp('folder=' + returns));
        await expect(tree.getByRole('button', { name: 'Orders 1', exact: true })).toBeVisible();
        await page.reload();
        await expect(tree.getByRole('button', { name: 'Window.md', exact: true })).toBeVisible();
        await tree.getByRole('button', { name: 'Actions for Orders' }).click();
        await choose('Rename');
        await dialog.getByLabel('Name', { exact: true }).fill('Orders 2026');
        await save();
        await expect(crumbs.getByRole('button', { name: 'Orders 2026', exact: true })).toBeVisible();
        await expect(page).toHaveURL(new RegExp('folder=' + returns));
        await page.getByRole('searchbox').fill('Window');
        await expect(tree).toContainText(name + ' / Operations / Orders 2026 / Returns / Window.md');
        await page.getByRole('searchbox').fill('');
        // The mobile tree opens the same actions for a sibling without first entering it.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Actions for Support' }).click();
        await choose('Upload Markdown');
        await expect(dialog).toContainText(name + ' / Operations / Support');
        const attempts: string[] = [];
        await page.route('**/api/actions/execute', async route => {
            const body = route.request().postDataJSON();
            if (body.actionId === 'knowledge.createKnowledgeSource') {
                attempts.push(body.input.fileName);
                if (body.input.fileName === 'Retry.md' && attempts.filter(name => name === 'Retry.md').length === 1)
                    return route.fulfill({ status: 503, json: { ok: false, message: 'Temporary upload failure' } });
            }
            await route.fallback();
        });
        await dialog
            .locator('input[type=file]')
            .setInputFiles(['Saved.md', 'Retry.md'].map(fileName => ({ name: fileName, mimeType: 'text/markdown', buffer: Buffer.from('# Uploaded') })));
        await dialog.getByRole('button', { name: /Upload 2/ }).click();
        await expect(dialog.getByText('Saved.md', { exact: true })).toHaveCount(0);
        await expect(dialog.getByText('Retry.md', { exact: true })).toBeVisible();
        await expect(page).toHaveURL(new RegExp('folder=' + returns));
        await dialog.getByRole('button', { name: /Upload 1/ }).click();
        await expect(page).toHaveURL(new RegExp('folder=' + support));
        expect(attempts.sort()).toEqual(['Retry.md', 'Retry.md', 'Saved.md']);
        await page.getByRole('button', { name: 'Saved.md', exact: true }).click();
        const preview = page.getByRole('region', { name: 'Saved.md' });
        const edit = preview.getByRole('button', { name: 'Edit', exact: true });
        const body = preview.getByLabel('Markdown content');
        await expect(preview.getByRole('heading', { name: 'Uploaded', exact: true })).toBeVisible();
        await edit.click();
        await body.fill('# Discard draft');
        await expect(page).toHaveURL(/file=/);
        await action('knowledge.updateKnowledgeSource', { ...scope, id: new URL(page.url()).searchParams.get('file'), contentText: '# Server revision' });
        await page.waitForResponse(response => response.url().endsWith('/api/actions/execute') && response.request().postDataJSON()?.actionId === 'knowledge.listKnowledgeSources');
        await expect(body).toHaveValue('# Discard draft');
        await crumbs.getByRole('button', { name: 'Support', exact: true }).click();
        const guard = page.getByRole('alertdialog');
        await guard.getByRole('button', { name: 'Keep editing' }).click();
        await expect(body).toHaveValue('# Discard draft');
        await page.goBack();
        await guard.getByRole('button', { name: 'Keep editing' }).click();
        await expect(body).toHaveValue('# Discard draft');
        await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(preview.getByRole('heading', { name: 'Server revision', exact: true })).toBeVisible();
        await edit.click();
        await body.fill('# Revised upload');
        let failSave = true;
        await page.route('**/api/actions/execute', async route => {
            if (route.request().postDataJSON().actionId === 'knowledge.updateKnowledgeSource' && failSave) {
                failSave = false;
                return route.fulfill({ status: 503, json: { ok: false, message: 'Unable to save this revision' } });
            }
            await route.fallback();
        });
        await preview.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('Unable to save this revision', { exact: true })).toBeVisible();
        await expect(body).toHaveValue('# Revised upload');
        await preview.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(preview.getByRole('heading', { name: 'Revised upload', exact: true })).toBeVisible();
        await edit.click();
        await body.fill('# Unpublished');
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Retry.md', exact: true }).click();
        await guard.getByRole('button', { name: 'Discard changes' }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('region', { name: 'Retry.md' }).getByRole('heading', { name: 'Uploaded' })).toBeVisible();
        await page.goBack();
        await expect(preview.getByRole('heading', { name: 'Revised upload' })).toBeVisible();
        await page.goForward();
        await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Retry.md');
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await dialog.getByRole('button', { name: 'Actions for ' + name, exact: true }).click();
        await choose('New document');
        await expect(dialog.getByText('Target folder: ' + name, { exact: true })).toBeVisible();
        await dialog.getByLabel('Document title').fill('Overview');
        await dialog.getByLabel('Markdown content').fill('# Root');
        await save();
        await expect(page).not.toHaveURL(/[?&]folder=/);
        const { sources } = await action<{ sources: { fileName: string; folderId: string | null }[] }>('knowledge.listKnowledgeSources', scope);
        expect(sources.map(({ fileName, folderId }) => [fileName, folderId]).sort()).toEqual([
            ['Overview.md', null],
            ['Retry.md', support],
            ['Saved.md', support],
            ['Window.md', returns],
        ]);
        // Render the same real directory with read-only permissions.
        await page.route('**/api/actions/execute', async route => {
            if (route.request().postDataJSON().actionId !== 'knowledge.listDirectory') return route.fallback();
            const response = await route.fetch();
            const body = await response.json();
            return route.fulfill({ response, json: { ...body, data: { ...body.data, canWrite: false } } });
        });
        await page.reload();
        await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Overview.md', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Overview.md' }).getByRole('heading', { name: 'Root', exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Overview.md' }).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Directory', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Operations 3', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: /Actions for/ })).toHaveCount(0);
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});
