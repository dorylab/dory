import { openDataSources } from './helpers/navigation';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function action(request: APIRequestContext, actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
    const body = await response.json();
    expect(body.ok, body.message).toBe(true);
    return body.data;
}
async function removeModel(request: APIRequestContext, id: string) {
    await action(request, 'knowledge.delete', { knowledgeModelId: id }, 'publication-ui-cleanup');
}

async function openModelEditor(page: Page) {
    await page.getByRole('button', { name: 'Knowledge base actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    return page.getByRole('dialog', { name: 'Edit knowledge base' });
}

test('deleting a knowledge base from its actions menu requires confirmation', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `delete-confirmation-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    const listPath = `/${org}/knowledge`;
    let deleteRequests = 0;
    let deleted = false;

    page.on('request', req => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/actions/execute' && req.postDataJSON().actionId === 'knowledge.delete') {
            deleteRequests++;
        }
    });

    try {
        await page.goto(`${listPath}/${model.id}`);
        const actions = page.getByRole('button', { name: 'Knowledge base actions', exact: true });
        const deleteItem = page.getByRole('menuitem', { name: 'Delete', exact: true });
        const confirm = page.getByRole('alertdialog', { name: 'Delete knowledge base?' });
        await actions.click();
        await deleteItem.click();
        await expect(confirm).toContainText(model.name);
        expect(deleteRequests).toBe(0);

        await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(actions).toBeFocused();
        expect(deleteRequests).toBe(0);

        await actions.click();
        await deleteItem.click();
        await confirm.getByRole('button', { name: 'Delete knowledge base', exact: true }).click();
        await expect(page).not.toHaveURL(new RegExp(model.id));
        deleted = true;
        expect(deleteRequests).toBe(1);
        const { models } = await action(request, 'knowledge.list', { query: model.name });
        expect(models).toEqual([]);
    } finally {
        if (!deleted) await removeModel(request, model.id);
    }
});

test('knowledge base settings save metadata without legacy publication controls', async ({ page, request }) => {
    await page.goto('/');
    await openDataSources(page);
    const org = new URL(page.url()).pathname.split('/')[1];
    const { connections } = await action(request, 'connection.list', {});
    const model = await action(request, 'knowledge.create', { name: `publication-${randomUUID()}`, connectionIds: [connections[0].connection.id] });
    try {
        await page.goto(`/${org}/knowledge/${model.id}`);
        const editor = await openModelEditor(page);
        await expect(editor.getByRole('button', { name: 'Publication settings' })).toHaveCount(0);
        await expect(editor.getByRole('button', { name: 'Processing history' })).toHaveCount(0);
        await expect(editor.getByText(/Publication mode/)).toHaveCount(0);
        const updated = model.name + ' edited';
        await editor.getByRole('textbox').first().fill(updated);
        await editor.getByRole('button', { name: 'Save changes' }).click();
        await expect(editor).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Directory' }).getByRole('button', { name: updated, exact: true })).toBeVisible();
    } finally {
        await removeModel(request, model.id);
    }
});
