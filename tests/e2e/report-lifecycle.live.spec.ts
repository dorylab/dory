import type { WorkDocumentContent } from '@dory/shared/types/work-document';
import { writeFile } from 'node:fs/promises';
import { expect, type TestInfo } from '@playwright/test';
import { test } from './fixtures';

type SavedReport = { id: string; revision: number; status: string; content: WorkDocumentContent };

async function retain(testInfo: TestInfo, name: string, attachment: { body: string | Buffer; contentType: string }) {
    const extension = attachment.contentType === 'image/png' ? 'png' : attachment.contentType === 'application/json' ? 'json' : 'txt';
    const path = testInfo.outputPath(`${name}.${extension}`);
    await writeFile(path, attachment.body);
    await testInfo.attach(name, { path, contentType: attachment.contentType });
}

// Real provider, real attachment SQL and persistence; no routes are mocked.
test('live report supports creation, open-report save, chart updates and durable reload', async ({ page }, testInfo) => {
    test.skip(process.env.DORY_E2E_LIVE_MODEL !== '1', 'Requires a configured real model.');
    test.setTimeout(600_000);
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/(work|connections)$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/work`);
    const composer = page.getByTestId('agent-composer');
    let turn = 0;
    const send = async (prompt: string) => {
        const before = await page.getByTestId('chat-completion').count();
        await composer.getByRole('textbox').fill(prompt);
        const pending = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST', { timeout: 180_000 });
        await composer.getByRole('button', { name: /^(Send|发送)$/ }).click();
        const response = await pending;
        expect(response.ok()).toBe(true);
        await response.finished();
        await retain(testInfo, `turn-${++turn}-stream`, { body: await response.body(), contentType: 'text/plain' });
        await expect(page.getByTestId('chat-completion')).toHaveCount(before + 1, { timeout: 180_000 });
        await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    };
    const csv = ['customer_id,active', ...Array.from({ length: 2000 }, (_, i) => `${i + 1},${i < 200}`)].join('\n');
    await composer
        .locator('input[type=file]')
        .first()
        .setInputFiles({ name: 'lifecycle-customers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await send('统计附件全部客户的活跃状态数量、比例和总数，生成并保存报告。报告必须包含客户总数指标卡、统计表和活跃状态数量柱状图。只使用附件数据。');
    const chatId = new URL(page.url()).searchParams.get('chat');
    const list = async () => (await (await page.request.get(`/api/work-documents?chatId=${chatId}`)).json()).documents as SavedReport[];
    expect(await list()).toHaveLength(1);
    const documentId = (await list())[0].id;
    const read = async () => (await (await page.request.get(`/api/work-documents/${documentId}`)).json()).document as SavedReport;
    const first = await read();
    expect(first.status).toBe('ready');
    expect(first.content.visuals.some(v => v.type === 'metric')).toBe(true);
    expect(first.content.visuals.some(v => v.type === 'table')).toBe(true);
    expect(first.content.visuals.some(v => v.chart?.type === 'bar')).toBe(true);
    const metric = first.content.visuals.find(v => v.type === 'metric')!;
    const metricEvidence = first.content.evidence.find(e => e.artifactId === metric.evidenceId)!;
    expect(Number(metricEvidence.rows[metric.metric!.rowIndex][metric.metric!.column])).toBe(2000);
    for (const visual of first.content.visuals) {
        expect(first.content.markdown).toContain(`dory://visual/${visual.id}`);
        expect(first.content.evidence.some(e => e.artifactId === visual.evidenceId)).toBe(true);
    }
    await page.goto(`/${organization}/work?chat=${chatId}&document=${documentId}&panel=report`);
    await expect(page.getByTestId('work-report').locator('.recharts-bar-rectangle').first()).toBeVisible();
    await send('帮我保存报告');
    const saved = await read();
    expect(saved.revision).toBeGreaterThan(first.revision);
    expect(await list()).toHaveLength(1);
    await send('给这份报告添加活跃与不活跃客户数量的饼图，保留已有图表和内容，并保存到原报告。');
    const updated = await read();
    expect(updated.revision).toBeGreaterThan(saved.revision);
    const pie = updated.content.visuals.find(v => v.chart?.type === 'pie');
    expect(pie).toBeTruthy();
    const source = updated.content.evidence.find(e => e.artifactId === pie!.evidenceId)!;
    const key = pie!.chart!.yKeys?.[0].key ?? pie!.chart!.yKey!;
    expect(source.rows.map(row => Number(row[key])).sort((a, b) => a - b)).toEqual([200, 1800]);
    expect(source.truncated).toBe(false);
    await send('将报告中的柱状图改成折线图，保留饼图、指标和统计表，然后保存报告。');
    const final = await read();
    expect(final.revision).toBeGreaterThan(updated.revision);
    expect(final.status).toBe('ready');
    expect(final.content.visuals.some(v => v.chart?.type === 'line')).toBe(true);
    expect(final.content.visuals.some(v => v.chart?.type === 'pie')).toBe(true);
    expect(final.content.visuals.some(v => v.type === 'metric')).toBe(true);
    expect(final.content.visuals.some(v => v.type === 'table')).toBe(true);
    expect(await list()).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    await page
        .getByTestId('chat-completion')
        .last()
        .getByRole('button', { name: /View report|查看报告/ })
        .click();
    await expect(page.getByTestId('work-report').locator('.recharts-pie-sector').first()).toBeVisible();
    await expect(page.getByTestId('work-report').locator('.recharts-line-curve').first()).toBeVisible();
    await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
    await retain(testInfo, 'saved-report-receipt', {
        body: JSON.stringify({ chatId, documentId, revisions: [first.revision, saved.revision, updated.revision, final.revision], content: final.content }, null, 2),
        contentType: 'application/json',
    });
    await page.getByTestId('work-report').locator('.recharts-pie-sector').first().scrollIntoViewIfNeeded();
    await retain(testInfo, 'saved-report-rendered', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('live database chart can be reused in a saved report', async ({ page }, testInfo) => {
    test.skip(process.env.DORY_E2E_LIVE_MODEL !== '1', 'Requires a configured real model.');
    test.setTimeout(420_000);
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/(work|connections)$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    const options = await (await page.request.get('/api/data-agent')).json();
    const connections = (options.data ?? options).connections as { id: string; name: string }[];
    const connection = connections.find(item => item.name === 'Demo Database');
    expect(connection, 'Existing demo database is required').toBeTruthy();
    await page.goto(`/${organization}/work?sources=${connection!.id}&connectionMode=manual&knowledgeMode=none`);
    const composer = page.getByTestId('agent-composer');
    const send = async (prompt: string, name: string) => {
        const count = await page.getByTestId('chat-completion').count();
        await composer.getByRole('textbox').fill(prompt);
        const pending = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST', { timeout: 180_000 });
        await composer.getByRole('button', { name: /^(Send|发送)$/ }).click();
        const response = await pending;
        expect(response.ok()).toBe(true);
        await response.finished();
        await retain(testInfo, name, { body: await response.body(), contentType: 'text/plain' });
        if (name === 'database-save-stream') {
            await expect(page.getByTestId('chat-completion')).toHaveCount(count + 1, { timeout: 180_000 });
            await expect(page.getByTestId('chat-completion').last()).toContainText(/Turn completed|本轮已完成/);
        }
    };
    await send(
        '只使用 Demo Database 数据源，先查看数据库和表结构，选择一个有分类字段的小表，只读查询按类别计数的汇总（最多10组），在聊天中显示柱状图并解释。先不要报告。',
        'database-chart-stream',
    );
    const chatId = new URL(page.url()).searchParams.get('chat');
    const session = (await (await page.request.get(`/api/chat/session/${chatId}`)).json()).data;
    const chart = session.messages
        .flatMap((m: { parts: { type: string; output?: { source?: { artifactId?: string } } }[] }) => m.parts)
        .find((p: { type: string; output?: { source?: { artifactId?: string } } }) => p.type === 'tool-chartBuilder' && p.output?.source?.artifactId);
    expect(chart?.output?.source?.artifactId).toBeTruthy();
    await send('将刚才的分析和柱状图保存成一份报告，直接复用刚才查询得到的结果和图表，并嵌入统计表。', 'database-save-stream');
    const documents = (await (await page.request.get(`/api/work-documents?chatId=${chatId}`)).json()).documents as SavedReport[];
    expect(documents).toHaveLength(1);
    const report = (await (await page.request.get(`/api/work-documents/${documents[0].id}`)).json()).document as SavedReport;
    expect(report.status).toBe('ready');
    const visual = report.content.visuals.find(v => v.chart?.type === 'bar');
    expect(visual?.evidenceId).toBe(chart.output.source.artifactId);
    expect(report.content.visuals.some(v => v.type === 'table')).toBe(true);
    await page.goto(`/${organization}/reports/${report.id}`);
    await expect(page.locator(`[data-visual="${visual!.id}"] .recharts-bar-rectangle`).first()).toBeVisible();
    await page.reload();
    await expect(page.locator(`[data-visual="${visual!.id}"] .recharts-bar-rectangle`).first()).toBeVisible();
    await retain(testInfo, 'database-report-receipt', {
        body: JSON.stringify({ chatId, documentId: report.id, revision: report.revision, content: report.content }, null, 2),
        contentType: 'application/json',
    });
    await page.locator(`[data-visual="${visual!.id}"]`).scrollIntoViewIfNeeded();
    await retain(testInfo, 'database-report-rendered', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
