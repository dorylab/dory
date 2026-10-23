import { openDataSources } from './helpers/navigation';
import { expect, type Page, type Route } from '@playwright/test';

import { test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole } from './helpers/workbench';

/**
 * expectAppHealthy variant that ignores PostHog console errors
 * (PostHog has no valid API key in the test environment).
 */
function expectAppHealthy(appErrors: string[]) {
    const relevant = appErrors.filter(e => !/posthog/i.test(e));
    expect(relevant, relevant.join('\n')).toEqual([]);
}

const seededConnection = createWorkbenchConnection();

const json = async (route: Route, body: unknown, status = 200) => {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
};

/**
 * Mock chatbot-related APIs so the page renders without a real backend.
 * Response format must match ApiEnvelope: { code: 0, data: { ... } }
 */
async function mockChatApis(page: Page) {
    const sessions: Array<{ id: string; title: string | null; type: string; createdAt: string }> = [];

    await page.route('**/api/chat/sessions*', async route => {
        const request = route.request();
        if (request.method() === 'GET') {
            await json(route, { code: 0, message: 'success', data: { sessions } });
            return;
        }
        if (request.method() === 'POST') {
            const now = new Date().toISOString();
            const session = {
                id: `session-${sessions.length + 1}`,
                title: null,
                type: 'global',
                createdAt: now,
                updatedAt: now,
                lastMessageAt: null,
                archivedAt: null,
                metadata: null,
            };
            sessions.push(session);
            await json(route, { code: 0, message: 'success', data: { session } });
            return;
        }
        await route.fallback();
    });

    await page.route('**/api/chat/session/*', async route => {
        const request = route.request();
        if (request.method() === 'GET') {
            const url = new URL(request.url());
            const sessionId = url.pathname.split('/').pop();
            const session = sessions.find(s => s.id === sessionId) ?? sessions[0];
            await json(route, {
                code: 0,
                message: 'success',
                data: {
                    session: session ?? { id: sessionId, title: null, type: 'global' },
                    messages: [],
                },
            });
            return;
        }
        await route.fallback();
    });

    // Mock the main chat POST — return a simple streamed text response
    await page.route('**/api/chat', async route => {
        if (route.request().method() !== 'POST') {
            await route.fallback();
            return;
        }

        const body = route.request().postDataJSON() as any;
        const chatId = body?.chatId ?? sessions[0]?.id ?? 'session-1';

        const responseText = 'Here is the result for your query.';
        const streamParts = [`0:${JSON.stringify(responseText)}\n`];

        await route.fulfill({
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            headers: { 'x-chat-id': chatId },
            body: streamParts.join(''),
        });
    });
}

/**
 * Navigate to chatbot page with mocked connection in localStorage.
 */
async function openMockConnectionChatbot(page: Page, connection = seededConnection) {
    await page.goto('/');
    await openDataSources(page);

    const match = page.url().match(/\/([^/]+)\/connections$/);
    const orgId = match?.[1];
    if (!orgId) throw new Error(`Failed to resolve org id from URL: ${page.url()}`);

    await page.evaluate(value => window.localStorage.setItem('currentConnection', JSON.stringify(value)), connection);

    await page.goto(`/${orgId}/${connection.connection.id}/chatbot`);
}

// ---------------------------------------------------------------------------
// Chatbot welcome page tests
// ---------------------------------------------------------------------------

test.describe('Chatbot welcome page', () => {
    test('shows welcome heading and suggested prompts when no session is selected', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockChatApis(page);
        await openMockConnectionChatbot(page);

        // Welcome heading should be visible
        await expect(page.getByText('Ask anything about your data')).toBeVisible();

        // Subheading should be visible
        await expect(page.getByText(/AI generates SQL/i)).toBeVisible();

        // Suggested prompt buttons should be visible
        await expect(page.getByRole('button', { name: /top 10 users/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /error logs/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /order trends/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /table.*row counts/i })).toBeVisible();

        await expectAppHealthy(appErrors);
    });

    test('clicking a suggested prompt creates a session and sends a message', async ({ page, appErrors }) => {
        await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
        await mockChatApis(page);
        await openMockConnectionChatbot(page);

        // Wait for welcome state to be ready
        await expect(page.getByRole('button', { name: /top 10 users/i })).toBeVisible();

        // Click a suggestion
        await page.getByRole('button', { name: /top 10 users/i }).click();

        // Welcome page should disappear and chat view should appear
        await expect(page.getByText('Ask anything about your data')).toBeHidden({ timeout: 15000 });

        // The chat input area should now be visible (the PromptInput textarea within ChatBotComp)
        await expect(page.locator('textarea[name="message"]')).toBeVisible();

        await expectAppHealthy(appErrors);
    });
});
