import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type Draft = {
    id: string;
    payload: { kind: string; name: string; description: string; sourceConnectionId: string | null; ruleCandidateIds?: string[] };
    action: string;
    targetAssetId: string | null;
    targetRevision: null;
    evidence: never[];
};
const draft = (id: string, patch: Partial<Draft> = {}): Draft => ({
    id,
    payload: { kind: 'business_rule', name: `Rule ${id}`, description: 'Reviewed business guidance with source evidence.', sourceConnectionId: null },
    action: 'add',
    targetAssetId: null,
    targetRevision: null,
    evidence: [],
    ...patch,
});
async function fixture(page: Page, request: APIRequestContext) {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/')[1];
    async function action(actionId: string, input: Record<string, unknown>, confirmationToken?: string) {
        const response = await request.post('/api/actions/execute', { data: { actionId, input, confirmationToken } });
        const body = await response.json();
        expect(body.ok, body.message).toBe(true);
        return body.data;
    }
    const { connections } = await action('connection.list', {});
    const connectionId: string = connections[0].connection.id;
    const model = await action('knowledge.create', { name: `review-ui-${randomUUID()}`, connectionIds: [connectionId] });
    const state = {
        candidates: [draft('a'), draft('b')],
        canManage: true,
        job: { status: 'completed', error: null as string | null, lastCompletedAt: null as string | null },
        listError: false,
        listCalls: 0,
        approveCalls: [] as Array<{ candidateIds: string[]; expectedRuleRevisions: Record<string, number>; expectedMetricRevisions: Record<string, string> }>,
        failId: null as string | null,
        networkFailureAt: 0,
        organizeCalls: 0,
    };
    await page.clock.install();
    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON();
        let data: unknown;
        switch (body.actionId) {
            case 'knowledge.getExtractionStatus':
                data = { canManage: state.canManage, connectors: [], jobs: [], pendingCount: state.candidates.length, organizationJob: state.job };
                break;
            case 'knowledge.listCandidates':
                state.listCalls++;
                if (state.listError) return route.fulfill({ status: 500, json: { ok: false, message: 'Cannot load drafts' } });
                data = {
                    candidates: state.candidates,
                    targets: [],
                    metrics: [{ id: 'metric:m', revision: 'metric-v1', sourceConnectionId: connectionId }],
                    rules: [{ id: 'rule:r', revision: 3 }],
                };
                break;
            case 'knowledge.approveCandidates': {
                state.approveCalls.push(body.input);
                if (state.approveCalls.length === state.networkFailureAt) return route.fulfill({ status: 503, json: { ok: false, message: 'Temporary approval outage' } });
                const results = body.input.candidateIds.map((id: string) => ({
                    id,
                    approved: id !== state.failId,
                    ...(id === state.failId ? { error: 'Source changed; review again' } : {}),
                }));
                const approved = new Set(results.filter((r: { approved: boolean }) => r.approved).map((r: { id: string }) => r.id));
                state.candidates = state.candidates.filter(d => !approved.has(d.id));
                data = { results };
                break;
            }
            case 'knowledge.organizeCandidates':
                state.organizeCalls++;
                state.job = { status: 'queued', error: null, lastCompletedAt: state.job.lastCompletedAt };
                data = {};
                break;
            default:
                return route.continue();
        }
        await route.fulfill({ json: { ok: true, data } });
    });
    const open = () => page.goto(`/${organization}/knowledge/${model.id}?tab=review`);
    const list = page.getByRole('list', { name: 'Pending review', exact: true });
    const selectAll = page.getByRole('checkbox', { name: 'Select all', exact: true });
    const approve = page.getByRole('button', { name: /Approve selected|Approving/ });
    const organize = page.getByRole('button', { name: 'AI organize drafts', exact: true });
    const refresh = async (count: number) => {
        await page.clock.fastForward(11_000);
        await expect(list.getByRole('listitem')).toHaveCount(count);
    };
    return { state, connectionId, open, list, selectAll, approve, organize, refresh, close: () => action('knowledge.delete', { knowledgeModelId: model.id }, 'review-ui-cleanup') };
}

test('compact review list selects only eligible drafts, supports mixed state and fits mobile themes', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        const metric = draft('mapped', { payload: { ...draft('mapped').payload, kind: 'metric', sourceConnectionId: f.connectionId } });
        f.state.candidates = [
            draft('a'),
            metric,
            draft('conflict', { action: 'conflict' }),
            draft('changed', { action: 'source_changed' }),
            draft('target', { targetAssetId: 'existing' }),
            draft('dependent', { payload: { ...metric.payload, name: 'Dependent metric', ruleCandidateIds: ['rule-draft'] } }),
            draft('unmapped', { payload: { ...metric.payload, name: 'Unmapped metric', sourceConnectionId: null } }),
            draft('foreign', { payload: { ...metric.payload, name: 'Foreign metric', sourceConnectionId: 'unlinked' } }),
        ];
        await f.open();
        await expect(f.list.getByRole('listitem')).toHaveCount(8);
        await expect(f.list.getByRole('checkbox', { disabled: true })).toHaveCount(6);
        await expect(f.approve).toBeDisabled();
        await expect(page.getByText('No completion recorded yet', { exact: true })).toHaveCount(0);
        await f.organize.hover();
        await expect(page.getByRole('tooltip')).toContainText('No completion recorded yet');
        await expect(page.getByRole('tooltip')).toContainText('Human review is still required');
        await f.selectAll.focus();
        await f.organize.focus();
        await expect(page.getByRole('tooltip')).toContainText('reviewed knowledge is not changed');
        await f.list.getByRole('checkbox', { name: 'Select Rule a', exact: true }).check();
        await expect(f.selectAll).toHaveAttribute('aria-checked', 'mixed');
        await f.selectAll.focus();
        await page.keyboard.press('Space');
        await expect(f.selectAll).toBeChecked();
        await expect(f.approve).toHaveText('Approve selected (2)');
        await expect(f.list.getByRole('checkbox', { checked: true })).toHaveCount(2);
        await f.selectAll.uncheck();
        await expect(f.approve).toBeDisabled();
        await expect(f.list.getByText('Review individually', { exact: true })).toHaveCount(3);
        await expect(f.list.getByText('Review with required rules', { exact: true })).toBeVisible();
        await expect(f.organize).toHaveAttribute('data-variant', 'outline');
        await expect(f.approve).toHaveAttribute('data-variant', 'default');
        for (const theme of ['theme-default', 'theme-green', 'theme-amber', 'theme-blue']) {
            await page.evaluate(value => {
                for (const name of [...document.body.classList]) {
                    if (/^theme-(default|blue|green|amber|mono)(-scaled)?$/.test(name)) document.body.classList.remove(name);
                }
                document.body.classList.add(value);
            }, theme);
            for (const control of [f.organize, f.approve]) {
                expect(
                    await control.evaluate(
                        el => getComputedStyle(el).getPropertyValue('--primary').trim() === getComputedStyle(document.body).getPropertyValue('--primary').trim(),
                    ),
                ).toBe(true);
            }
        }
        const check = await f.selectAll.boundingBox();
        const rowCheck = await f.list.getByRole('checkbox').first().boundingBox();
        expect(Math.abs(check!.x - rowCheck!.x)).toBeLessThan(2);
        const button = await f.approve.boundingBox();
        expect(button!.x).toBeGreaterThan(check!.x);
        await page.setViewportSize({ width: 390, height: 844 });
        for (const dark of [false, true]) {
            await page.evaluate(value => {
                document.documentElement.classList.toggle('dark', value);
                document.documentElement.classList.toggle('light', !value);
                document.documentElement.style.colorScheme = value ? 'dark' : 'light';
            }, dark);
            await expect(f.organize).toBeVisible();
            await expect(f.approve).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await f.list.getByRole('listitem').filter({ hasText: 'Dependent metric' }).getByRole('button', { name: 'Review', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
    } finally {
        await f.close();
    }
});

test('polling drops removed and newly ineligible selected drafts', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        await f.open();
        await f.selectAll.check();
        await expect(f.approve).toHaveText('Approve selected (2)');
        f.state.candidates = [draft('b', { action: 'conflict' }), draft('new')];
        await f.refresh(2);
        await expect(f.approve).toHaveText('Approve selected (0)');
        await expect(f.selectAll).not.toBeChecked();
        await f.selectAll.check();
        await f.approve.click();
        await expect.poll(() => f.state.approveCalls.length).toBe(1);
        expect(f.state.approveCalls[0].candidateIds).toEqual(['new']);
        await expect(f.selectAll).toBeDisabled();
    } finally {
        await f.close();
    }
});

test('review pagination selects eligible drafts across pages and clamps after polling', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        f.state.candidates = [...Array.from({ length: 11 }, (_, index) => draft(String(index))), draft('conflict', { action: 'conflict' })];
        await f.open();
        await expect(f.list.getByRole('listitem')).toHaveCount(10);
        await f.selectAll.check();
        await expect(f.approve).toHaveText('Approve selected (11)');
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page).toHaveURL(/reviewPage=2/);
        await expect(f.list.getByRole('listitem')).toHaveCount(2);
        await expect(f.list.getByRole('checkbox', { name: 'Select Rule 10' })).toBeChecked();
        await expect(f.list.getByRole('checkbox', { name: 'Select Rule conflict' })).toBeDisabled();
        f.state.candidates = [draft('0'), draft('conflict', { action: 'conflict' })];
        await f.refresh(2);
        await expect(page).not.toHaveURL(/reviewPage=2/);
        await expect(f.approve).toHaveText('Approve selected (1)');
        await expect(f.selectAll).toBeChecked();
    } finally {
        await f.close();
    }
});

test('batch approval preserves failures and stops after a network failure without sending the last batch', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        f.state.candidates = Array.from({ length: 101 }, (_, i) => draft(String(i)));
        f.state.failId = '0';
        f.state.networkFailureAt = 2;
        await f.open();
        await f.selectAll.check();
        await f.approve.click();
        await expect(page.getByText('Temporary approval outage', { exact: true })).toBeVisible();
        await expect(f.approve).toHaveText('Approve selected (52)');
        expect(f.state.approveCalls.map(c => c.candidateIds.length)).toEqual([50, 50]);
        expect(f.state.approveCalls[0].expectedRuleRevisions).toEqual({ 'rule:r': 3 });
        expect(f.state.approveCalls[0].expectedMetricRevisions).toEqual({ 'metric:m': 'metric-v1' });
        await expect(f.list.getByRole('checkbox', { name: 'Select Rule 0', exact: true })).toBeChecked();
        await page.getByRole('button', { name: 'Last page' }).click();
        await expect(f.list.getByRole('checkbox', { name: 'Select Rule 100', exact: true })).toBeChecked();
        await expect(page.getByText('Rule 0: Source changed; review again', { exact: true })).toBeVisible();
    } finally {
        await f.close();
    }
});

test('more than 50 drafts approve in sequential batches and the final list becomes empty', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        f.state.candidates = Array.from({ length: 101 }, (_, i) => draft(String(i)));
        await f.open();
        await f.selectAll.check();
        await f.approve.click();
        await expect.poll(() => f.state.approveCalls.length).toBe(3);
        expect(f.state.approveCalls.map(c => c.candidateIds.length)).toEqual([50, 50, 1]);
        await expect(f.approve).toHaveText('Approve selected (0)');
        await expect(f.selectAll).toBeDisabled();
        await expect(f.list).toHaveCount(0);
    } finally {
        await f.close();
    }
});

test('organization status and last completion are shown only in the tooltip while queued work stays disabled', async ({ page, request }) => {
    const f = await fixture(page, request);
    try {
        const detail = 'Invalid organization output: ' + 'items.7.inputIds: too_small '.repeat(40);
        f.state.job = { status: 'failed', error: detail, lastCompletedAt: '2026-10-20T10:20:30.000Z' };
        await f.open();
        await expect(page.locator('time')).toHaveCount(0);
        await expect(page.getByText('Draft organization: Organization failed', { exact: true })).toHaveCount(0);
        await f.organize.hover();
        await expect(page.getByRole('tooltip').locator('time')).toHaveAttribute('datetime', '2026-10-20T10:20:30.000Z');
        await expect(page.getByRole('tooltip').locator('time')).not.toBeEmpty();
        await expect(page.getByRole('tooltip')).toContainText('Draft organization: Organization failed');
        await expect(page.getByRole('tooltip')).toContainText(detail.trim());
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await f.selectAll.check();
        await f.organize.click();
        await expect(f.organize).toBeDisabled();
        await expect(f.approve).toBeDisabled();
        await expect(f.list.getByRole('button', { name: 'Review', exact: true }).first()).toBeEnabled();
        expect(f.state.organizeCalls).toBe(1);
        f.state.job = { status: 'running', error: null, lastCompletedAt: f.state.job.lastCompletedAt };
        await page.clock.fastForward(11_000);
        await f.selectAll.hover();
        await f.organize.locator('..').focus();
        await expect(page.getByRole('tooltip')).toContainText('Draft organization: Organizing');
        await expect(page.getByRole('tooltip').locator('time')).toHaveAttribute('datetime', '2026-10-20T10:20:30.000Z');
        await expect(page.getByRole('tooltip')).toContainText('Human review is still required');
    } finally {
        await f.close();
    }
});

test('candidate load failure can be retried and readers cannot load drafts or use batch actions', async ({ page, request }) => {
    const f = await fixture(page, request);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    await page.route('**/api/actions/execute', async route => {
        if (route.request().postDataJSON().actionId === 'knowledge.listCandidates') await gate;
        await route.fallback();
    });
    try {
        f.state.listError = true;
        await f.open();
        await expect(page.getByText('Loading…', { exact: true }).first()).toBeVisible();
        await expect(f.selectAll).toBeDisabled();
        release();
        await expect(page.getByText('Cannot load drafts', { exact: true })).toBeVisible();
        f.state.listError = false;
        await page.getByRole('button', { name: 'Reload', exact: true }).click();
        await expect(f.list.getByRole('listitem')).toHaveCount(2);
        f.state.canManage = false;
        const calls = f.state.listCalls;
        await page.reload();
        await expect(page.getByText('Only organization owners and administrators can review extraction drafts.', { exact: true })).toBeVisible();
        await expect(f.selectAll).toHaveCount(0);
        await expect(f.organize).toHaveCount(0);
        expect(f.state.listCalls).toBe(calls);
    } finally {
        release();
        await f.close();
    }
});
