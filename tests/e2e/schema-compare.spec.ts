import { expect, type Route } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

const coverage = {
    tables: 'complete',
    columns: 'complete',
    indexes: 'complete',
    constraints: 'complete',
    views: 'complete',
    statistics: 'complete',
};

const summary = {
    totalChanges: 2,
    breakingChanges: 1,
    added: 1,
    removed: 0,
    modified: 1,
    renamed: 0,
    highRisk: 1,
    mediumRisk: 0,
    lowRisk: 1,
    unknownRisk: 0,
    readiness: 'unsafe',
};

const changes = [
    {
        changeId: 'chg_email_type',
        objectType: 'column',
        objectPath: 'public.users.email',
        changeType: 'modified',
        attribute: 'dataType',
        currentValue: 'varchar(100)',
        desiredValue: 'varchar(255)',
        riskLevel: 'low',
        breaking: false,
        riskReason: 'Character length is widened.',
        estimatedRows: 2_300_000,
        tableBytes: 98_000_000,
        indexScans: null,
        statisticsSource: 'catalog_estimate',
        changeCount: 1,
    },
    {
        changeId: 'chg_orders_pk',
        objectType: 'constraint',
        objectPath: 'public.orders.orders_pkey',
        changeType: 'removed',
        attribute: null,
        currentValue: 'PRIMARY KEY (id)',
        desiredValue: null,
        riskLevel: 'high',
        breaking: true,
        riskReason: 'Removing a primary key can break references and identity assumptions.',
        estimatedRows: 23_000_000,
        tableBytes: 840_000_000,
        indexScans: 812_044,
        statisticsSource: 'catalog_estimate',
        changeCount: 1,
    },
];

function connection(id: string, name: string, database: string, environment: string, type = 'postgres') {
    const now = new Date('2026-07-23T04:00:00.000Z').toISOString();
    return {
        connection: {
            id,
            type,
            engine: type,
            name,
            description: null,
            host: 'localhost',
            port: type === 'postgres' ? 5432 : 3306,
            database,
            status: 'Connected',
            environment,
            tags: '',
            configVersion: 1,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            lastUsedAt: null,
            lastCheckStatus: 'ok',
            lastCheckAt: now,
            lastCheckLatencyMs: 4,
            lastCheckError: null,
        },
        identities: [
            {
                id: `${id}_identity`,
                name: 'Default',
                username: 'dory',
                role: null,
                isDefault: true,
                database,
                enabled: true,
                status: 'active',
            },
        ],
        ssh: null,
    };
}

function comparisonJob(id: string, currentDatabase: string, desiredDatabase: string, aiReviewStatus: 'pending' | 'running' | 'success' | 'failed' | 'unavailable' = 'pending') {
    return {
        id,
        status: 'success',
        currentEndpoint: {
            connectionId: 'conn_prod',
            identityId: 'conn_prod_identity',
            database: currentDatabase,
            schemas: ['public'],
        },
        desiredEndpoint: {
            connectionId: 'conn_staging',
            identityId: 'conn_staging_identity',
            database: desiredDatabase,
            schemas: ['public'],
        },
        dialectFamily: 'postgres',
        coverage,
        summary,
        resultSetId: 'rs_schema_diff',
        workId: null,
        aiReviewStatus,
        aiReview: null,
        aiReviewError: null,
        failureMessage: null,
        createdAt: '2026-07-23T04:00:00.000Z',
        completedAt: '2026-07-23T04:00:03.000Z',
    };
}

async function actionResponse(route: Route, data: unknown) {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            ok: true,
            data,
            execution: {
                requestId: 'schema-compare-e2e',
                actionId: 'mock',
                durationMs: 1,
            },
        }),
    });
}

test('schema compare supports history, review, ResultSet views, export, and theme changes', async ({ page, appErrors }) => {
    const connections = [
        connection('conn_prod', 'Production', 'app_prod', 'prod'),
        connection('conn_staging', 'Staging', 'app_staging', 'staging'),
        connection('conn_mysql', 'MySQL QA', 'app_qa', 'qa', 'mysql'),
    ];
    const historyJob = comparisonJob('cmp_history', 'legacy_prod', 'legacy_staging', 'success');
    historyJob.aiReview = {
        summary: 'Historical review.',
        deploymentNotes: [],
        risks: [],
        recommendations: [],
        limitations: [],
        generatedAt: '2026-07-23T04:01:00.000Z',
    };
    let createdJob = comparisonJob('cmp_new', 'app_prod', 'app_staging');
    let reviewAttempts = 0;
    const resultSetInputs: Array<Record<string, unknown>> = [];

    await page.route('**/api/actions/execute', async route => {
        const request = route.request();
        const body = request.postDataJSON() as {
            actionId: string;
            input?: Record<string, unknown>;
        };

        switch (body.actionId) {
            case 'connection.list':
                await actionResponse(route, { connections });
                return;
            case 'comparison.list':
                await actionResponse(route, { rows: [historyJob], total: 1 });
                return;
            case 'comparison.schema.create':
                await actionResponse(route, {
                    job: createdJob,
                    comparison: { summary, coverage, changes },
                    topChanges: changes,
                });
                return;
            case 'comparison.get': {
                const comparisonId = String(body.input?.comparisonId ?? '');
                await actionResponse(route, comparisonId === historyJob.id ? historyJob : createdJob);
                return;
            }
            case 'comparison.aiReview':
                reviewAttempts += 1;
                if (reviewAttempts === 1) {
                    createdJob = {
                        ...createdJob,
                        aiReviewStatus: 'unavailable',
                        aiReviewError: 'No AI model configured',
                    };
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            ok: false,
                            code: 'AI_UNAVAILABLE',
                            message: 'No AI model configured',
                        }),
                    });
                    return;
                }
                createdJob = {
                    ...createdJob,
                    aiReviewStatus: 'success',
                    aiReviewError: null,
                    aiReview: {
                        summary: 'The primary-key removal is unsafe; the email widening is compatible.',
                        deploymentNotes: ['Review foreign-key consumers before deployment.'],
                        risks: [
                            {
                                changeId: 'chg_orders_pk',
                                explanation: 'This canonical high-risk change removes the orders primary key.',
                            },
                        ],
                        recommendations: ['Keep the existing primary key.'],
                        limitations: ['Statistics are catalog estimates.'],
                        generatedAt: '2026-07-23T04:02:00.000Z',
                    },
                };
                await actionResponse(route, { job: createdJob, review: createdJob.aiReview });
                return;
            case 'resultSet.rows.read': {
                resultSetInputs.push(body.input ?? {});
                const filters = (body.input?.filters as Array<{ col: string; value: string }> | undefined) ?? [];
                const risk = filters.find(filter => filter.col === 'riskLevel')?.value;
                const rows = risk ? changes.filter(change => change.riskLevel === risk) : changes;
                await actionResponse(route, {
                    rows,
                    rowCount: rows.length,
                    unfilteredRowCount: changes.length,
                });
                return;
            }
            case 'resultSet.chart.read':
                resultSetInputs.push(body.input ?? {});
                await actionResponse(route, {
                    data: [
                        { xLabel: 'column', high: 0, low: 1 },
                        { xLabel: 'constraint', high: 1, low: 0 },
                    ],
                    series: [
                        { key: 'high', label: 'High' },
                        { key: 'low', label: 'Low' },
                    ],
                });
                return;
            case 'resultSet.export.create':
                resultSetInputs.push(body.input ?? {});
                await actionResponse(route, {
                    downloadUrl: '/api/result-set-exports/schema-compare-e2e',
                });
                return;
            default:
                await route.continue();
        }
    });
    await page.route('**/api/result-set-exports/schema-compare-e2e', async route => {
        await route.fulfill({
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="schema-diff.csv"',
            },
            body: 'objectPath,riskLevel\npublic.orders.orders_pkey,high\n',
        });
    });

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;

    await page.goto(`/${organization}/compare`);
    await expect(page.getByRole('heading', { name: 'Compare databases' })).toBeVisible();
    await expect(page.getByRole('link', { name: /legacy_prod.*legacy_staging/ })).toBeVisible();

    await page.getByTestId('current-connection').click();
    await page.getByRole('option', { name: /Production/ }).click();
    await page.getByTestId('desired-connection').click();
    await expect(page.getByRole('option', { name: /MySQL QA/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Staging/ }).click();

    const compareButton = page.getByTestId('compare-schema');
    await expect(compareButton).toBeEnabled();
    await compareButton.click();
    await page.waitForURL(new RegExp(`/${organization}/compare/cmp_new$`));

    await expect(page.getByText('public.users.email', { exact: true })).toBeVisible();
    const firstCardHeader = page.getByTestId('schema-diff-card-header').first();
    const firstCardHeaderBox = await firstCardHeader.boundingBox();
    const firstCardTitleBox = await firstCardHeader.getByText('public.users.email', { exact: true }).boundingBox();
    const firstCardRiskBox = await firstCardHeader.getByText('low', { exact: true }).boundingBox();
    expect(firstCardHeaderBox?.height).toBeLessThanOrEqual(72);
    expect(firstCardRiskBox!.x).toBeGreaterThan(firstCardTitleBox!.x + firstCardTitleBox!.width);
    await expect(page.getByText('AI Review is unavailable.')).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/primary-key removal is unsafe/i)).toBeVisible();
    await expect(page.getByText('chg_orders_pk', { exact: true })).toBeVisible();
    await expect(page.getByTestId('ai-review-icon')).toHaveClass(/text-\[#9460FF\]/);

    await page.getByRole('tab', { name: 'Table' }).click();
    await expect(page.getByRole('cell', { name: 'public.orders.orders_pkey' })).toBeVisible();
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'High' }).click();
    await expect(page).toHaveURL(/risk=high/);
    await expect(page.getByRole('cell', { name: 'public.users.email' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Object', exact: true }).click();
    await expect
        .poll(() => {
            const latest = resultSetInputs.filter(input => 'sorts' in input).at(-1);
            return latest?.sorts;
        })
        .toEqual([{ column: 'objectPath', direction: 'desc' }]);

    await page.getByRole('tab', { name: 'Chart' }).click();
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
    await expect
        .poll(() => {
            const latest = resultSetInputs.find(input => input.chartType === 'bar');
            return latest?.groupKey;
        })
        .toBe('riskLevel');

    await page.getByRole('button', { name: 'Export' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('schema-diff.csv');

    const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(wasDark);

    await expectAppHealthy(appErrors);
});

test('schema compare refreshes stale connection selections before creating a job', async ({ page, appErrors }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;

    const staleConnections = [
        connection('conn_old_current', 'Legacy Current', 'main', 'prod', 'sqlite'),
        connection('conn_old_desired', 'Legacy Desired', 'main', 'staging', 'sqlite'),
    ];
    const refreshedConnections = [
        connection('conn_new_current', 'Current database', 'main', 'prod', 'sqlite'),
        connection('conn_new_desired', 'Desired database', 'main', 'staging', 'sqlite'),
    ];
    let connectionListCalls = 0;
    let createAttempts = 0;
    let connectionsChanged = false;

    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as {
            actionId: string;
        };

        if (body.actionId === 'connection.list') {
            connectionListCalls += 1;
            await actionResponse(route, {
                connections: connectionsChanged ? refreshedConnections : staleConnections,
            });
            return;
        }
        if (body.actionId === 'comparison.list') {
            await actionResponse(route, { rows: [], total: 0 });
            return;
        }
        if (body.actionId === 'comparison.schema.create') {
            createAttempts += 1;
            await actionResponse(route, {
                job: comparisonJob('cmp_should_not_be_created', 'main', 'main'),
            });
            return;
        }
        await route.continue();
    });

    await page.goto(`/${organization}/compare`);
    await page.getByTestId('current-connection').click();
    await page.getByRole('option', { name: /Legacy Current/ }).click();
    await page.getByTestId('desired-connection').click();
    await page.getByRole('option', { name: /Legacy Desired/ }).click();
    connectionsChanged = true;

    const compareButton = page.getByTestId('compare-schema');
    await expect(compareButton).toBeEnabled();
    await compareButton.click();

    await expect(
        page.getByText('A selected connection is no longer available (it may have been deleted or recreated). The list was refreshed; select Current and Desired again.'),
    ).toBeVisible();
    await expect(compareButton).toBeDisabled();
    expect(connectionListCalls).toBeGreaterThanOrEqual(2);
    expect(createAttempts).toBe(0);
    await expectAppHealthy(appErrors);
});
