import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import { openDataSources } from './helpers/navigation';

test('organizes nested Markdown, preserves navigation and follows a moved query source', async ({ page, request }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await openDataSources(page);
    const slug = new URL(page.url()).pathname.split('/')[1]!;
    async function action<T>(actionId: string, input: Record<string, unknown>, confirmationToken?: string): Promise<T> {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    }
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
        await expect(page.getByRole('button', { name: 'Policy.md', exact: true })).toBeVisible();
        await newItem('Upload Markdown');
        await dialog.locator('input[type=file]').setInputFiles({ name: 'Checklist.md', mimeType: 'text/markdown', buffer: Buffer.from('# Check') });
        await dialog.getByRole('button', { name: /Upload 1/ }).click();
        await expect(dialog).toBeHidden();
        await menu('Checklist.md', 'Move to…');
        await dialog.getByRole('combobox').selectOption({ label: name });
        await submit();
        await crumb.getByRole('button', { name, exact: true }).click();
        await expect(card('Operations', 1)).toBeVisible();
        await expect(page).not.toHaveURL(/[?&]folder=/);
        await page.goBack();
        await expect(crumb.getByRole('button', { name: 'Refunds' })).toBeVisible();
        await page.goForward();
        await page.getByRole('button', { name: 'Checklist.md', exact: true }).dragTo(card('Operations', 1));
        await expect(card('Operations', 2)).toBeVisible();
        await tree.getByRole('button', { name: 'Collapse Operations' }).click();
        await expect(tree.getByRole('button', { name: /^Orders \d/ })).toBeHidden();
        await tree.getByRole('button', { name: 'Expand Operations' }).click();
        await tree.getByRole('button', { name: 'Orders 1', exact: true }).click();
        await menu('Refunds', 'Move to…');
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
        await expect(dialog.getByRole('heading', { name: 'Refund window' })).toBeVisible();
        await page.keyboard.press('Escape');
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
    } finally {
        await action('knowledge.delete', scope, 'knowledge.delete');
    }
});
