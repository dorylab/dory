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
