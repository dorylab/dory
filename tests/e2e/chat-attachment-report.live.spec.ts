import { expect } from '@playwright/test';
import { test } from './fixtures';

// Opt-in acceptance: uses the configured model and persists a new isolated conversation.
test('real model analyzes the complete CSV and adds a pie to the same report next turn', async ({ page }, testInfo) => {
    test.skip(process.env.DORY_E2E_LIVE_MODEL !== '1', 'Requires a configured model.');
    test.setTimeout(420_000);
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/(work|connections)$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/work`);
    const composer = page.getByTestId('agent-composer');
    const csv = ['customer_id,active', ...Array.from({ length: 2000 }, (_, i) => `${i + 1},${i < 200}`)].join('\n');
    await composer
        .locator('input[type=file]')
        .first()
        .setInputFiles({ name: 'full-customer-acceptance.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await composer.getByRole('textbox').fill('统计附件完整 CSV 中 active 为 true 和 false 的客户数量、比例和总数，生成并保存一份报告，先只放统计表，不要图表。数据只来自附件。');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/chat') && response.request().method() === 'POST', { timeout: 180_000 });
    await composer.getByRole('button', { name: /^(Send|发送)$/ }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    await response.finished();
    await expect(page.getByTestId('chat-completion').last()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    const chatId = new URL(page.url()).searchParams.get('chat');
    expect(chatId).toBeTruthy();
    const list = await (await page.request.get(`/api/work-documents?chatId=${chatId}`)).json();
    expect(list.documents).toHaveLength(1);
    const documentId = list.documents[0].id;
    const readReport = async () => (await (await page.request.get(`/api/work-documents/${documentId}`)).json()).document;
    const first = await readReport();
    expect(first.status).toBe('ready');
    expect(first.content.evidence.some((item: { attachmentSource?: unknown }) => item.attachmentSource)).toBe(true);
    const sourceValues = first.content.evidence.flatMap((item: { rows: Record<string, unknown>[] }) => item.rows.flatMap(row => Object.values(row).map(Number)));
    expect(sourceValues).toContain(200);
    expect(sourceValues).toContain(1800);
    const before = first.revision;
    await composer.getByRole('textbox').fill('给刚才这份报告的活跃客户比例统计加一个饼图，并保存到原报告。');
    const followupPromise = page.waitForResponse(response => response.url().endsWith('/api/chat') && response.request().method() === 'POST', { timeout: 180_000 });
    await composer.getByRole('button', { name: /^(Send|发送)$/ }).click();
    await (await followupPromise).finished();
    await expect(page.getByTestId('chat-completion').last()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    const updated = await readReport();
    expect(updated.revision).toBeGreaterThan(before);
    const visual = updated.content.visuals.find((item: { chart?: { type: string } }) => item.chart?.type === 'pie');
    expect(visual).toBeTruthy();
    expect(updated.content.markdown).toContain(`dory://visual/${visual.id}`);
    const evidence = updated.content.evidence.find((item: { artifactId: string }) => item.artifactId === visual.evidenceId);
    const valueKey = visual.chart.yKey ?? visual.chart.yKeys[0].key;
    const values = evidence.rows.map((row: Record<string, unknown>) => Number(row[valueKey])).sort((a: number, b: number) => a - b);
    expect(values).toHaveLength(2);
    expect(values[0] / (values[0] + values[1])).toBeCloseTo(0.1);
    expect(values[1] / (values[0] + values[1])).toBeCloseTo(0.9);
    expect(evidence.truncated).toBe(false);
    expect((await (await page.request.get(`/api/work-documents?chatId=${chatId}`)).json()).documents).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    await testInfo.attach('saved-report', {
        body: JSON.stringify({ documentId, before, revision: updated.revision, receipt: updated.content.agentWrite, evidence }, null, 2),
        contentType: 'application/json',
    });
    await page.getByTestId('chat-completion').last().scrollIntoViewIfNeeded();
    await testInfo.attach('final-chat', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page
        .getByTestId('chat-completion')
        .last()
        .getByRole('button', { name: /View report|查看报告/ })
        .click();
    await expect(page.locator('svg[data-chart-type="pie"]')).toBeVisible();
    await testInfo.attach('saved-pie-report', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
