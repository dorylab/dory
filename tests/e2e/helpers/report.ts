import type { WorkDocumentView } from '@dory/shared/types/work-document';
import type { Page } from '@playwright/test';

export async function chooseReportMode(page: Page, mode: 'View' | 'Edit' | 'Source') {
    const toolbar = page.getByTestId('report-toolbar');
    const button = toolbar.getByRole('button', { name: mode, exact: true });
    const compact = toolbar.getByRole('button', { name: 'Report mode', exact: true });
    await button.or(compact).first().click();
    const option = page.getByRole('menuitemradio', { name: mode, exact: true });
    if (await option.isVisible()) await option.click();
}

export async function replaceReportSource(page: Page, body: string) {
    const input = page.getByTestId('markdown-source').locator('textarea').first();
    // Monaco chooses shortcuts from the browser user agent, which can differ
    // from the host OS when Playwright emulates Desktop Chrome.
    const modifier = (await page.evaluate(() => navigator.userAgent.includes('Macintosh'))) ? 'Meta' : 'Control';
    await input.press(`${modifier}+A`);
    await page.keyboard.insertText(body);
}

export function pendingReport(page: Page): Promise<WorkDocumentView> {
    return page.evaluate(() => {
        const key = Object.keys(sessionStorage).find(key => key.startsWith('["report-editor",'));
        if (!key) throw new Error('No pending report edit');
        return JSON.parse(sessionStorage.getItem(key)!);
    });
}
