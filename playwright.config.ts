import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const defaultPort = '3100';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;
const videoMode = process.env.PLAYWRIGHT_VIDEO_MODE ?? 'retain-on-failure';
const isDemoRecording = process.env.PLAYWRIGHT_DEMO_RECORDING === '1';
const demoRecordingViewport = {
    width: 2560,
    height: 1600,
};

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    workers: process.env.CI ? 1 : undefined,
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
        viewport: isDemoRecording ? demoRecordingViewport : undefined,
        video: isDemoRecording ? 'off' : (videoMode as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry'),
        contextOptions: isDemoRecording
            ? {
                  deviceScaleFactor: 2,
                  recordVideo: {
                      dir: path.resolve('test-results/demo-flow-video'),
                      size: demoRecordingViewport,
                  },
              }
            : undefined,
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
                viewport: isDemoRecording ? demoRecordingViewport : devices['Desktop Chrome'].viewport,
                deviceScaleFactor: isDemoRecording ? 2 : devices['Desktop Chrome'].deviceScaleFactor,
                storageState: 'playwright/.auth/user.json',
            },
        },
    ],
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command: `cd apps/web && mkdir -p ./.tmp/playwright && DB_TYPE='pglite' PGLITE_DB_PATH='./.tmp/playwright/dory' DS_SECRET_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' NEXT_PUBLIC_DORY_CLOUD_API_URL='' BETTER_AUTH_URL='${baseURL}' npx tsx ./scripts/dev-bootstrap.ts && DB_TYPE='pglite' PGLITE_DB_PATH='./.tmp/playwright/dory' DS_SECRET_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' NEXT_PUBLIC_DORY_CLOUD_API_URL='' BETTER_AUTH_URL='${baseURL}' yarn next dev --turbopack --hostname 127.0.0.1 --port ${defaultPort}`,
              url: baseURL,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
          },
});
