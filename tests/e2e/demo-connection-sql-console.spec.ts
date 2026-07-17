import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, type Locator, type Response } from '@playwright/test';

import { formatBytes } from '../../apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format';

import { expectAppHealthy, test } from './fixtures';

const SCREENSHOT_DIR = process.env.E2E_DEMO_SCREENSHOT_DIR ? path.resolve(process.env.E2E_DEMO_SCREENSHOT_DIR) : path.resolve(process.cwd(), 'apps/web/public/e2e-demo-flow');
const CINEMATIC_MODE = process.env.E2E_DEMO_CINEMATIC === '1';
const STEP_PAUSE_MS = Number(process.env.E2E_DEMO_STEP_PAUSE_MS ?? (CINEMATIC_MODE ? '900' : '0'));
const SHORT_PAUSE_MS = Number(process.env.E2E_DEMO_SHORT_PAUSE_MS ?? (CINEMATIC_MODE ? '350' : '0'));
const FOCUS_TRANSITION_MS = Number(process.env.E2E_DEMO_FOCUS_TRANSITION_MS ?? (CINEMATIC_MODE ? '1200' : '0'));
const QUERY_REQUEST_ATTEMPTS = process.env.CI ? 5 : 3;

const DEMO_CONNECTION_NAME = process.env.E2E_DEMO_CONNECTION_NAME ?? 'Demo Database';

test.use({ storageState: { cookies: [], origins: [] } });

async function saveShot(page: Parameters<typeof test>[0]['page'], fileName: string) {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, fileName),
        fullPage: true,
    });
}

async function beat(page: Parameters<typeof test>[0]['page'], ms = STEP_PAUSE_MS) {
    if (ms <= 0) return;
    await page.waitForTimeout(ms);
}

async function shortBeat(page: Parameters<typeof test>[0]['page']) {
    if (SHORT_PAUSE_MS <= 0) return;
    await page.waitForTimeout(SHORT_PAUSE_MS);
}

async function installCamera(page: Parameters<typeof test>[0]['page']) {
    if (!CINEMATIC_MODE) return;

    await page.evaluate(() => {
        if (!document.body) return;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
        document.body.style.transformOrigin = 'top left';
        document.body.style.willChange = 'transform';
        document.body.style.minHeight = '100vh';
    });
}

async function focusBox(
    page: Parameters<typeof test>[0]['page'],
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    },
    options?: {
        maxScale?: number;
        padding?: number;
        pauseMs?: number;
    },
) {
    if (!CINEMATIC_MODE) return;

    const maxScale = options?.maxScale ?? 3.2;
    const padding = options?.padding ?? 0.74;
    const pauseMs = options?.pauseMs ?? FOCUS_TRANSITION_MS;
    const transitionMs = Math.max(400, Math.min(1600, FOCUS_TRANSITION_MS));

    await page.evaluate(
        ({ box, focusMaxScale, focusPadding, focusTransitionMs }) => {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const scaleX = (viewportWidth * focusPadding) / Math.max(box.width, 1);
            const scaleY = (viewportHeight * focusPadding) / Math.max(box.height, 1);
            const scale = Math.max(1, Math.min(focusMaxScale, scaleX, scaleY));

            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const translateX = viewportWidth / 2 - centerX * scale;
            const translateY = viewportHeight / 2 - centerY * scale;

            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            document.body.style.transformOrigin = 'top left';
            document.body.style.willChange = 'transform';
            document.body.style.transition = `transform ${focusTransitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            document.body.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
        },
        {
            box: rect,
            focusMaxScale: maxScale,
            focusPadding: padding,
            focusTransitionMs: transitionMs,
        },
    );

    if (pauseMs > 0) {
        await page.waitForTimeout(pauseMs);
    }
}

async function focusLocator(
    page: Parameters<typeof test>[0]['page'],
    locator: Locator,
    options?: {
        maxScale?: number;
        padding?: number;
        pauseMs?: number;
    },
) {
    if (!CINEMATIC_MODE) return;

    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (!box) {
        throw new Error('Focus target has no bounding box');
    }

    await focusBox(page, box, options);
}

async function resetFocus(page: Parameters<typeof test>[0]['page'], pauseMs = FOCUS_TRANSITION_MS) {
    if (!CINEMATIC_MODE) return;

    const transitionMs = Math.max(400, Math.min(1600, FOCUS_TRANSITION_MS));
    await page.evaluate(focusTransitionMs => {
        document.body.style.transformOrigin = 'top left';
        document.body.style.transition = `transform ${focusTransitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        document.body.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
    }, transitionMs);

    if (pauseMs > 0) {
        await page.waitForTimeout(pauseMs);
    }
}

async function getOrganizationSlug(page: Parameters<typeof test>[0]['page']) {
    await page.waitForURL(/\/[^/]+\/connections$/);

    const url = new URL(page.url());
    const [organization] = url.pathname.split('/').filter(Boolean);

    expect(organization).toBeTruthy();
    return organization!;
}

async function loginAsDemo(page: Parameters<typeof test>[0]['page']) {
    console.log('[demo-flow] login:start');
    await page.goto('/sign-in');
    await installCamera(page);

    const demoButton = page.getByTestId('demo-sign-in').or(
        page.getByRole('button', {
            name: /enter as demo|login as demo|sign in as demo/i,
        }),
    );

    await focusLocator(page, demoButton, { maxScale: 4, padding: 0.48 });
    await expect(demoButton).toBeVisible();
    await demoButton.hover();
    await shortBeat(page);
    await demoButton.click();
    await page.waitForURL(/\/[^/]+\/connections$/);
    await resetFocus(page);
    await beat(page);
    console.log('[demo-flow] login:done');
}

async function getConnectionCard(page: Parameters<typeof test>[0]['page'], name: string) {
    return page.locator('[data-testid="connection-card"]').filter({
        has: page.getByText(name, { exact: true }),
    });
}

async function waitForExistingConnectionCard(page: Parameters<typeof test>[0]['page'], name: string, timeoutMs = 4_000) {
    const card = await getConnectionCard(page, name);

    try {
        await expect(card.first()).toBeVisible({ timeout: timeoutMs });
    } catch {
        // The demo workspace may still be bootstrapping its saved connections.
    }

    return card;
}

async function getConnectionIdFromCard(card: ReturnType<Parameters<typeof test>[0]['page']['locator']>) {
    return card.evaluate(node => node.getAttribute('data-connection-id'));
}

async function ensureSqlTab(page: Parameters<typeof test>[0]['page'], connectionId: string) {
    console.log('[demo-flow] sql-tab:check');
    console.log('[demo-flow] sql-tab:reset-and-bootstrap');

    await page.evaluate(
        async ({ id }) => {
            const existingTabsResponse = await fetch('/api/sql-console/tabs', {
                method: 'GET',
                headers: {
                    'X-Connection-ID': id,
                },
                credentials: 'include',
            });

            if (!existingTabsResponse.ok) {
                throw new Error(`Failed to load SQL tabs: ${existingTabsResponse.status}`);
            }

            const existingTabsPayload = await existingTabsResponse.json();
            const existingTabs = Array.isArray(existingTabsPayload?.data) ? existingTabsPayload.data : [];

            for (const tab of existingTabs) {
                if (!tab?.tabId) continue;

                const deleteResponse = await fetch(`/api/sql-console/tabs?tabId=${encodeURIComponent(tab.tabId)}`, {
                    method: 'DELETE',
                    headers: {
                        'X-Connection-ID': id,
                    },
                    credentials: 'include',
                });

                if (!deleteResponse.ok) {
                    throw new Error(`Failed to delete SQL tab ${tab.tabId}: ${deleteResponse.status}`);
                }
            }

            const tabId = crypto.randomUUID();
            const response = await fetch('/api/sql-console/tabs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Connection-ID': id,
                },
                credentials: 'include',
                body: JSON.stringify({
                    tabId,
                    state: {
                        tabId,
                        tabType: 'sql',
                        tabName: 'New Query',
                        content: '',
                        status: 'idle',
                        userId: '',
                        connectionId: id,
                        orderIndex: 0,
                        createdAt: new Date().toISOString(),
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to create SQL tab: ${response.status}`);
            }

            localStorage.setItem(`sqlconsole:activeTabId:${id}`, tabId);
        },
        { id: connectionId },
    );

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);
    const runButton = page.locator('[data-testid="run-query"]');
    await expect(runButton).toHaveCount(1);
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
    await page.waitForFunction(() => typeof window.__DORY_E2E_MONACO__?.setValue === 'function');
    await beat(page);
    console.log('[demo-flow] sql-tab:fallback-ready');
}

async function setEditorSql(page: Parameters<typeof test>[0]['page'], sql: string) {
    await page.waitForFunction(() => typeof window.__DORY_E2E_MONACO__?.setValue === 'function');
    await page.evaluate(value => {
        window.__DORY_E2E_MONACO__?.setValue(value);
    }, sql);
}

async function runSql(page: Parameters<typeof test>[0]['page'], sql: string, expectedStatus: 'success' | 'error' = 'success') {
    console.log(`[demo-flow] sql:run ${sql}`);
    await setEditorSql(page, sql);
    await page.waitForTimeout(CINEMATIC_MODE ? 900 : 500);

    const runButton = page.locator('[data-testid="run-query"]');
    await expect(runButton).toHaveCount(1);

    let response: Response | null = null;
    for (let attempt = 1; attempt <= QUERY_REQUEST_ATTEMPTS; attempt += 1) {
        await expect(runButton, `Run button should be enabled before query attempt ${attempt}`).toBeEnabled({
            timeout: 10_000,
        });

        const queryResponse = page
            .waitForResponse(candidate => candidate.url().includes('/api/query') && candidate.request().method() === 'POST', { timeout: 15_000 })
            .catch(() => null);

        await runButton.click();

        response = await queryResponse;
        if (response) {
            break;
        }

        console.log(`[demo-flow] sql:run-request-missing attempt=${attempt}`);
        if (attempt < QUERY_REQUEST_ATTEMPTS) {
            await setEditorSql(page, sql);
            await page.waitForTimeout(500);
        }
    }

    if (!response) {
        throw new Error(`Query request was not sent after ${QUERY_REQUEST_ATTEMPTS} Run attempts.`);
    }

    const body = await response.json();

    expect(response.ok()).toBeTruthy();
    expect(body?.data?.session?.status).toBe(expectedStatus);
    await beat(page, CINEMATIC_MODE ? 1200 : 0);
    console.log('[demo-flow] sql:done');

    return body;
}

test('demo login, SQLite demo connection, SQL console flow, and screenshots', async ({ page, appErrors }) => {
    test.setTimeout(process.env.CI ? 300_000 : 180_000);

    await loginAsDemo(page);

    const organization = await getOrganizationSlug(page);
    console.log(`[demo-flow] organization:${organization}`);

    const mainHeading = page.getByRole('heading', { name: /data sources|connections/i });
    await expect(mainHeading).toBeVisible();
    await focusLocator(page, mainHeading, { maxScale: 3, padding: 0.58 });
    await beat(page);
    await saveShot(page, '01-connections.png');

    const connectionCard = await waitForExistingConnectionCard(page, DEMO_CONNECTION_NAME, 15_000);
    await expect(connectionCard.first()).toBeVisible();

    const connectionId = await getConnectionIdFromCard(connectionCard.first());
    expect(connectionId).toBeTruthy();
    if (!connectionId) {
        throw new Error('Demo connection card is missing data-connection-id');
    }

    await focusLocator(page, connectionCard.first(), { maxScale: 3.1, padding: 0.58 });
    await beat(page);
    await saveShot(page, '04-connection-saved.png');
    console.log(`[demo-flow] connection:reused ${connectionId}`);

    console.log('[demo-flow] sql-console:goto');
    await resetFocus(page);
    await page.goto(`/${organization}/${connectionId}/sql-console`);
    await installCamera(page);
    await ensureSqlTab(page, connectionId);

    const dbSchemaResult = await runSql(page, "select 'main' as database_name, sqlite_version() as sqlite_version;");
    expect(dbSchemaResult?.data?.queryResultSets?.[0]?.rowCount).toBe(1);
    const resultTable = page.getByTestId('result-table');
    await expect(resultTable).toBeVisible();
    expect(dbSchemaResult?.data?.results?.[0]?.[0]?.database_name).toBe('main');
    expect(dbSchemaResult?.data?.results?.[0]?.[0]?.sqlite_version).toBeTruthy();
    await focusLocator(page, resultTable, { maxScale: 2.8, padding: 0.58 });
    await expect(resultTable.getByText('main', { exact: true })).toBeVisible();
    await saveShot(page, '05-sql-db-schema.png');
    await resultTable.getByRole('tab', { name: 'Overview' }).click();
    await expect(resultTable.locator('[data-slot="accordion-item"]')).toHaveCount(1);
    await expect(resultTable.locator('[data-slot="accordion-item"]')).toHaveAttribute('data-state', 'closed');
    await resultTable.getByRole('tab', { name: 'Result 1' }).click();

    const userCountResult = await runSql(page, 'select count(*) as user_count from users;');
    expect(Number(userCountResult?.data?.results?.[0]?.[0]?.user_count)).toBe(100);
    await focusLocator(page, resultTable, { maxScale: 3.3, padding: 0.5 });
    await expect(resultTable.getByText('100', { exact: true })).toBeVisible();
    await saveShot(page, '06-sql-user-count.png');

    const ordersResult = await runSql(page, 'select order_id, user_id, amount, status from orders order by order_id limit 5;');
    expect(ordersResult?.data?.queryResultSets?.[0]?.rowCount ?? 0).toBeGreaterThan(0);
    await focusLocator(page, resultTable, { maxScale: 2.4, padding: 0.56 });
    await expect(resultTable).toBeVisible();
    await saveShot(page, '07-sql-orders-sample.png');

    const selectionStartCell = resultTable.locator('[data-cell="0@@order_id"]');
    const selectionEndCell = resultTable.locator('[data-cell="1@@user_id"]');
    await expect(selectionStartCell).toBeVisible();
    await expect(selectionEndCell).toBeVisible();
    await selectionStartCell.click();
    await selectionEndCell.click({ modifiers: ['Shift'] });
    await selectionEndCell.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Copy', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'View cell', exact: true })).toHaveCount(0);
    await expect(selectionStartCell).toHaveClass(/bg-primary\/10/);
    await page.keyboard.press('Escape');

    const multiResult = await runSql(page, 'select 1 as value union all select 2; select 3 as value union all select 4;');
    expect(multiResult?.data?.queryResultSets).toHaveLength(2);
    const activeResultSet = multiResult?.data?.queryResultSets?.[1];
    if (!activeResultSet) throw new Error('Expected the second ResultSet metadata payload.');
    expect(activeResultSet.rowCount).toBe(2);
    expect(activeResultSet.byteSize).toBeGreaterThan(0);
    await expect(resultTable.getByText('Finished', { exact: true })).toBeVisible();
    await expect(resultTable.getByText(/Shown:/)).toHaveCount(0);
    await expect(resultTable.getByText('2 rows', { exact: true })).toBeVisible();
    await expect(resultTable.getByText(formatBytes(activeResultSet.byteSize), { exact: true })).toBeVisible();

    await resultTable.getByRole('tab', { name: 'Overview' }).click();
    const resultCards = resultTable.locator('[data-slot="accordion-item"]');
    await expect(resultCards).toHaveCount(2);
    await expect(resultCards.nth(0)).toHaveAttribute('data-state', 'closed');
    await expect(resultCards.nth(1)).toHaveAttribute('data-state', 'closed');
    const firstCardCursorAndAlignment = await resultCards.nth(0).evaluate(card => {
        const trigger = card.querySelector<HTMLElement>('[data-slot="accordion-trigger"]');
        const menu = card.querySelector<HTMLElement>('[aria-label="Result actions"]');
        const cardRect = card.getBoundingClientRect();
        const menuRect = menu?.getBoundingClientRect();
        return {
            triggerCursor: trigger ? getComputedStyle(trigger).cursor : null,
            menuCursor: menu ? getComputedStyle(menu).cursor : null,
            menuRightGap: menuRect ? Math.round(cardRect.right - menuRect.right) : null,
        };
    });
    expect(firstCardCursorAndAlignment).toEqual({ triggerCursor: 'pointer', menuCursor: 'pointer', menuRightGap: 16 });
    await resultCards.nth(0).getByRole('button').first().click();
    await expect(resultCards.nth(0)).toHaveAttribute('data-state', 'open');
    await expect(resultTable.getByText('Size', { exact: true })).toBeVisible();
    await expect(resultTable.getByText('Storage', { exact: true })).toBeVisible();
    await expect(resultTable.getByText('Source', { exact: true })).toHaveCount(0);
    await expect(resultTable.getByText('Snapshot status', { exact: true })).toHaveCount(0);
    await expect(resultTable.getByText('Expires', { exact: true })).toBeVisible();
    await resultCards.nth(1).getByRole('button').first().click();
    await expect(resultCards.nth(0)).toHaveAttribute('data-state', 'closed');
    await expect(resultCards.nth(1)).toHaveAttribute('data-state', 'open');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(resultTable).toBeVisible();
    await resultTable.getByRole('tab', { name: 'Overview' }).click();
    const restoredResultCards = resultTable.locator('[data-slot="accordion-item"]');
    await expect(restoredResultCards).toHaveCount(2);
    await expect(restoredResultCards.nth(0)).toHaveAttribute('data-state', 'closed');
    await restoredResultCards.nth(0).getByRole('button').first().click();
    await expect(resultTable.getByText('Source', { exact: true })).toHaveCount(0);
    await expect(resultTable.getByText('Snapshot status', { exact: true })).toHaveCount(0);

    const errorResult = await runSql(page, 'select * from missing_table_for_overview;', 'error');
    expect(errorResult?.data?.queryResultSets?.[0]?.resultSetId).toBeUndefined();
    expect(errorResult?.data?.queryResultSets?.[0]?.byteSize).toBeUndefined();
    await resultTable.getByRole('tab', { name: 'Overview' }).click();
    const errorCard = resultTable.locator('[data-slot="accordion-item"]');
    await expect(errorCard).toHaveCount(1);
    await errorCard.getByRole('button').first().click();
    await expect(errorCard.getByText(/no such table: missing_table_for_overview/i)).toBeVisible();
    for (const label of ['Rows', 'Size', 'Storage', 'Created', 'Query duration', 'Expires']) {
        await expect(errorCard.getByText(label, { exact: true })).toHaveCount(0);
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await resultTable.getByRole('tab', { name: 'Overview' }).click();
    const restoredErrorCard = resultTable.locator('[data-slot="accordion-item"]');
    await expect(restoredErrorCard).toHaveCount(1);
    await restoredErrorCard.getByRole('button').first().click();
    await expect(restoredErrorCard.getByText(/no such table: missing_table_for_overview/i)).toBeVisible();

    await resetFocus(page);
    const relevantAppErrors = appErrors.filter(
        error =>
            !error.includes('[PGlite migrate] failed: TypeError: Failed to fetch') &&
            !error.includes('[chat] fetch copilot session failed TypeError: Failed to fetch') &&
            error !== 'pageerror: ErrnoError',
    );
    await expectAppHealthy(relevantAppErrors);
});
