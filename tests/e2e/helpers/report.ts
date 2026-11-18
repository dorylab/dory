import type { Page } from '@playwright/test';

export async function chooseReportMode(page: Page, mode: 'View' | 'Edit' | 'Source') {
    const toolbar = page.getByTestId('report-toolbar');
    const button = toolbar.getByRole('button', { name: mode, exact: true });
    const compact = toolbar.getByRole('button', { name: 'Report mode', exact: true });
    await button.or(compact).first().waitFor({ state: 'visible' });
    if (await button.isVisible()) await button.click();
    else {
        await toolbar.getByRole('button', { name: 'Report mode', exact: true }).click();
        await page.getByRole('menuitemradio', { name: mode, exact: true }).click();
    }
}

export async function replaceReportSource(page: Page, body: string) {
    const input = page.getByTestId('markdown-source').locator('textarea').first();
    // Monaco chooses shortcuts from the browser user agent, which can differ
    // from the host OS when Playwright emulates Desktop Chrome.
    const modifier = (await page.evaluate(() => navigator.userAgent.includes('Macintosh'))) ? 'Meta' : 'Control';
    await input.press(`${modifier}+A`);
    await page.keyboard.insertText(body);
}
