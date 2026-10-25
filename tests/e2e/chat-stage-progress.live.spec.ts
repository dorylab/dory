import type { ChatCheckpoints } from '@dory/shared/types/chat-checkpoints';
import { expect } from '@playwright/test';
import { test } from './fixtures';

// Explicitly opt in: this runs the configured real model and creates real chat history.
test.describe('real model stage explanations', () => {
    test.skip(process.env.DORY_E2E_LIVE_MODEL !== '1', 'Requires an authenticated running app and a configured real model.');
    test.describe.configure({ mode: 'serial' });
    for (const entrypoint of ['work', 'datasource'] as const) {
        test(`${entrypoint}: progress precedes completion, survives refresh and collapses`, async ({ page }, testInfo) => {
            test.setTimeout(240_000);
            await page.goto('/');
            await page.waitForURL(/\/[^/]+\/(work|connections)$/);
            const organization = new URL(page.url()).pathname.split('/')[1];
            const provider = await (await page.request.get('/api/organization/ai-providers')).json();
            const runtime = provider.data?.runtime;
            const active = provider.data?.providerResolution?.activeProvider;
            await testInfo.attach('runtime-model', {
                body: JSON.stringify({ runtime, provider: active?.provider, model: active?.model, bridges: provider.data?.localAiStatus?.bridges }),
                contentType: 'application/json',
            });
            if (entrypoint === 'datasource') {
                const options = await (await page.request.get('/api/data-agent')).json();
                const connections = (options.data ?? options).connections as { id: string; name: string }[];
                const connection = connections.find(item => /olist/i.test(item.name)) ?? connections[0];
                expect(connection, 'Real datasource is required for this acceptance').toBeTruthy();
                const sessionsLoaded = page.waitForResponse(response => response.url().includes('/api/chat/sessions'));
                await page.goto(`/${organization}/${connection.id}/chatbot`);
                await sessionsLoaded;
                await page.getByRole('button', { name: /New session|新建会话/ }).click();
            } else await page.goto(`/${organization}/work`);
            const startedAt = Date.now();
            const snapshots: { status: string; state: ChatCheckpoints }[] = [];
            page.on('response', async response => {
                if (!response.url().includes('/api/chat/run-activity?')) return;
                try {
                    const data = await response.json();
                    if (data.checkpoints && Date.parse(data.work?.metadata?.chatTurn?.startedAt) >= startedAt - 1000)
                        snapshots.push({ status: data.work.status, state: data.checkpoints });
                } catch {
                    /* A closing page can abort an unrelated poll. */
                }
            });
            const question =
                entrypoint === 'work' ? '帮我看看最近的订单情况' : '帮我看看最近的订单情况。请先用读取知识工具打开相关知识定义，不要只依赖预置摘要，然后检查订单结构和数据。';
            await page.locator('textarea').fill(question);
            const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
            await page.locator('button[type=submit]').click();
            const response = await responsePromise;
            expect(response.status()).toBe(200);
            await response.finished();
            const process = page.getByTestId('chat-analysis-process').last();
            await expect(process).toBeVisible();
            await expect.poll(() => snapshots.at(-1)?.status, { timeout: 20_000 }).toBe('completed');
            await expect(process).not.toHaveAttribute('open');
            const final = snapshots.at(-1)!.state;
            if (entrypoint === 'datasource') expect(final.entries.some(entry => entry.toolName === 'dory_read_asset')).toBe(true);
            expect(final.entries.filter(entry => entry.kind === 'text').length).toBeGreaterThanOrEqual(2);
            expect(snapshots.some(snapshot => snapshot.status === 'active' && snapshot.state.entries.filter(entry => entry.kind === 'text').length >= 2)).toBe(true);
            let actions = 0;
            for (const entry of final.entries) {
                if (entry.kind === 'text') {
                    actions = 0;
                    expect(entry.text!.length).toBeGreaterThan(12);
                } else {
                    actions++;
                    expect(actions).toBeLessThanOrEqual(3);
                }
                expect(entry.toolName ?? '').not.toContain('publish_progress');
            }
            await process.locator('summary').first().click();
            const explanation = final.entries.filter(entry => entry.kind === 'text').at(-1)!.text!;
            await expect(process).toContainText(explanation);
            await page.waitForTimeout(1600);
            await expect(process).toHaveAttribute('open', '');
            await testInfo.attach('expanded', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
            await page.reload();
            await expect(process).toBeVisible();
            await expect(process).not.toHaveAttribute('open');
            await process.locator('summary').first().click();
            await expect(process).toContainText(explanation);
            await page.getByRole('button', { name: /Toggle theme|切换主题/ }).click();
            await page.setViewportSize({ width: 430, height: 900 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
            await testInfo.attach('narrow-theme', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
            await testInfo.attach('checkpoint-history', { body: JSON.stringify(final, null, 2), contentType: 'application/json' });
        });
    }
});
