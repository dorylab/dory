import { defineConfig, devices } from '@playwright/test';

const defaultPort = '3100';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: 'chromium',
            dependencies: ['setup'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'playwright/.auth/user.json',
            },
        },
    ],
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command:
                  `export PATH="$(pwd)/node_modules/.bin:$PATH" && cd apps/web && mkdir -p ./.tmp/playwright && DB_TYPE='pglite' PGLITE_DB_PATH='./.tmp/playwright/dory' DS_SECRET_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' NEXT_PUBLIC_DORY_CLOUD_API_URL='' BETTER_AUTH_URL='${baseURL}' TRUSTED_ORIGINS='${baseURL}' bun run prebuild && DB_TYPE='pglite' PGLITE_DB_PATH='./.tmp/playwright/dory' DS_SECRET_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' NEXT_PUBLIC_DORY_CLOUD_API_URL='' BETTER_AUTH_URL='${baseURL}' TRUSTED_ORIGINS='${baseURL}' bun ./scripts/dev-bootstrap.ts && DB_TYPE='pglite' PGLITE_DB_PATH='./.tmp/playwright/dory' DS_SECRET_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' NEXT_PUBLIC_DORY_CLOUD_API_URL='' BETTER_AUTH_URL='${baseURL}' TRUSTED_ORIGINS='${baseURL}' bun --bun next dev --turbopack --hostname 127.0.0.1 --port ${defaultPort}`,
              url: baseURL,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
          },
});
