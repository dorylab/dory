import { expect, test } from '@playwright/test';
import { z } from 'zod';

test.use({ storageState: { cookies: [], origins: [] } });

test('new SQL and ResultSet names remain readable after execution and reload', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const login = await page.request.post('/api/auth/demo');
    expect(login.ok()).toBeTruthy();
    const session = await (await page.request.get('/api/auth/get-session')).json();
    const organizationId = z.string().parse(session.session.activeOrganizationId);
    async function action(actionId: string, input: unknown, connectionId?: string) {
        const response = await page.request.post('/api/actions/execute', { data: { actionId, input, organizationId, currentConnectionId: connectionId } });
        const envelope = await response.json();
        expect(response.ok(), `${actionId}: ${envelope.message ?? ''}`).toBeTruthy();
        expect(envelope.ok).toBeTruthy();
        return envelope.data as unknown;
    }
    const connections = z.object({ connections: z.array(z.object({ connection: z.object({ id: z.string(), type: z.string() }) })) }).parse(await action('connection.list', {}));
    const connectionId = connections.connections.find(item => item.connection.type === 'sqlite')?.connection.id;
    expect(connectionId, 'demo workspace provides SQLite').toBeTruthy();
    if (!connectionId) return;
    const sql = 'SELECT count(*) AS total FROM sqlite_master';
    const tab = z.object({ tabId: z.string() }).parse(await action('tab.create', { connectionId, content: sql }, connectionId));
    try {
        await page.addInitScript(({ id, tabId }) => localStorage.setItem(`sqlconsole:activeTabId:${id}`, tabId), { id: connectionId, tabId: tab.tabId });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/\/[^/]+\/work$/);
        const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
        await page.goto(`/${organization}/${connectionId}/sql-console`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('run-query')).toBeEnabled({ timeout: 60_000 });
        const executed = page.waitForResponse(response => response.url().includes('/api/sql-console/query/stream') && response.request().method() === 'POST');
        await page.getByTestId('run-query').click();
        const response = await executed;
        expect(response.ok()).toBeTruthy();
        await response.finished();
        const events = (await response.text())
            .trim()
            .split('\n')
            .map(line => JSON.parse(line) as unknown);
        const final = events.map(event => z.object({ type: z.string(), payload: z.unknown() }).parse(event)).findLast(event => event.type === 'session-finished');
        const sessionId = z.object({ session: z.object({ sessionId: z.string() }) }).parse(final?.payload).session.sessionId;
        const tabSchema = z.array(z.object({ tabId: z.string(), tabName: z.string(), namingSource: z.string() }));
        let title = '';
        await expect
            .poll(
                async () => {
                    const named = tabSchema.parse(await action('tab.list', { connectionId }, connectionId)).find(item => item.tabId === tab.tabId);
                    title = named?.tabName ?? '';
                    return named?.namingSource;
                },
                { timeout: 25_000 },
            )
            .toMatch(/^(ai|rule)$/);
        expect(title).not.toMatch(/^(New Query|SELECT|Result Set)/i);
        expect(Array.from(title).length).toBeLessThanOrEqual(40);
        await expect(page.getByRole('tab').filter({ hasText: title }).first()).toBeVisible();
        let resultTitle = '';
        await expect
            .poll(
                async () => {
                    const results = z
                        .object({ resultSets: z.array(z.object({ title: z.string(), namingSource: z.string() })) })
                        .parse(await action('query.resultSets.list', { sessionId, includeProfile: false }, connectionId));
                    resultTitle = results.resultSets[0]?.title ?? '';
                    return results.resultSets[0]?.namingSource;
                },
                { timeout: 25_000 },
            )
            .toMatch(/^(ai|rule)$/);
        await expect(page.getByTestId('result-table').getByRole('tab').filter({ hasText: resultTitle })).toBeVisible();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('tab').filter({ hasText: title }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('result-table').getByRole('tab').filter({ hasText: resultTitle })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('readable-names.png'), fullPage: true });
    } finally {
        await action('tab.delete', { connectionId, tabId: tab.tabId }, connectionId).catch(() => undefined);
    }
});
