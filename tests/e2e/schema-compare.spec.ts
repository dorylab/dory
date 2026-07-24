import { expect, type Route } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

const coverage = {
    tables: 'complete',
    columns: 'complete',
    indexes: 'complete',
    constraints: 'complete',
    views: 'complete',
    statistics: 'complete',
} as const;

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
} as const;

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

function comparisonRun(
    id: string,
    comparisonId: string,
    options: {
        status?: 'running' | 'success' | 'failed';
        aiReviewStatus?: 'pending' | 'running' | 'success' | 'failed' | 'unavailable' | 'not_needed';
        failureMessage?: string | null;
    } = {},
) {
    return {
        id,
        organizationId: 'org_mock',
        comparisonId,
        createdByUserId: 'user_mock',
        actorType: 'user',
        workId: null,
        status: options.status ?? 'success',
        configurationSnapshot: {
            version: 1,
            configurationVersion: 1,
            name: 'Production vs Staging',
            source: { connectionId: 'conn_prod', identityId: 'conn_prod_identity', database: 'app_prod' },
            target: { connectionId: 'conn_staging', identityId: 'conn_staging_identity', database: 'app_staging' },
            schemaFilter: ['public'],
            objectTypes: ['table', 'column', 'index', 'constraint', 'view'],
            dialectFamily: 'postgres',
        },
        coverage: options.status === 'failed' ? null : coverage,
        summary: options.status === 'failed' ? null : summary,
        sourceSnapshotHash: options.status === 'failed' ? null : 'source_hash',
        targetSnapshotHash: options.status === 'failed' ? null : 'target_hash',
        artifactRef: options.status === 'failed' ? null : { version: 1 },
        resultSetId: options.status === 'failed' ? null : 'rs_schema_diff',
        aiReviewStatus: options.aiReviewStatus ?? 'pending',
        aiReview: null,
        aiReviewError: options.aiReviewStatus === 'unavailable' ? 'No AI model configured' : null,
        failureCode: options.status === 'failed' ? 'connection_failed' : null,
        failureMessage: options.failureMessage ?? null,
        startedAt: '2026-07-23T04:00:00.000Z',
        updatedAt: '2026-07-23T04:00:03.000Z',
        completedAt: options.status === 'running' ? null : '2026-07-23T04:00:03.000Z',
    };
}

function comparisonRecord(id: string, run = comparisonRun('cmprun_1', id)) {
    return {
        id,
        organizationId: 'org_mock',
        createdByUserId: 'user_mock',
        name: 'Production vs Staging',
        kind: 'schema',
        sourceEndpoint: { connectionId: 'conn_prod', identityId: 'conn_prod_identity', database: 'app_prod' },
        targetEndpoint: { connectionId: 'conn_staging', identityId: 'conn_staging_identity', database: 'app_staging' },
        schemaFilter: ['public'],
        objectTypes: ['table', 'column', 'index', 'constraint', 'view'],
        dialectFamily: 'postgres',
        configurationVersion: 1,
        latestRunId: run.id,
        latestSuccessfulRunId: run.status === 'success' ? run.id : null,
        createdAt: '2026-07-23T04:00:00.000Z',
        updatedAt: '2026-07-23T04:00:03.000Z',
        latestRun: run,
        latestSuccessfulRun: run.status === 'success' ? run : null,
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

test('saved Comparisons support create, AI recovery, immutable Run history, Diff views, editing, and themes', async ({ page, appErrors }) => {
    const connections = [
        connection('conn_prod', 'Production', 'app_prod', 'prod'),
        connection('conn_staging', 'Staging', 'app_staging', 'staging'),
        connection('conn_mysql', 'MySQL QA', 'app_qa', 'qa', 'mysql'),
    ];
    const historical = comparisonRecord('cmp_history', comparisonRun('cmprun_history', 'cmp_history', { aiReviewStatus: 'success' }));
    let created = comparisonRecord('cmp_new');
    let runs = [created.latestRun];
    let reviewAttempts = 0;
    let updateCalled = false;
    const resultSetInputs: Array<Record<string, unknown>> = [];
    const actionOrganizations: Array<{ actionId: string; organizationId?: string }> = [];

    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string; input?: Record<string, unknown>; organizationId?: string };
        actionOrganizations.push({
            actionId: body.actionId,
            organizationId: body.organizationId,
        });
        switch (body.actionId) {
            case 'connection.list':
                await actionResponse(route, { connections });
                return;
            case 'comparison.list':
                await actionResponse(route, { rows: [historical], total: 1 });
                return;
            case 'comparison.create':
                await actionResponse(route, {
                    comparison: created,
                    run: created.latestRun,
                    result: { version: 1, family: 'postgres', currentHash: 'a', desiredHash: 'b', coverage, summary, changes: [], warnings: [] },
                    topChanges: [],
                });
                return;
            case 'comparison.get':
                await actionResponse(route, body.input?.comparisonId === historical.id ? historical : created);
                return;
            case 'comparison.run.list':
                await actionResponse(route, { rows: body.input?.comparisonId === historical.id ? [historical.latestRun] : runs, total: runs.length });
                return;
            case 'comparison.run.get':
                await actionResponse(route, runs.find(run => run.id === body.input?.runId) ?? created.latestRun);
                return;
            case 'comparison.run.create': {
                const nextRun = comparisonRun('cmprun_2', created.id, { aiReviewStatus: 'not_needed' });
                nextRun.summary = { ...summary, totalChanges: 0, breakingChanges: 0, added: 0, modified: 0, highRisk: 0, lowRisk: 0, readiness: 'compatible' };
                runs = [nextRun, ...runs];
                created = { ...created, latestRunId: nextRun.id, latestSuccessfulRunId: nextRun.id, latestRun: nextRun, latestSuccessfulRun: nextRun };
                await actionResponse(route, { comparison: created, run: nextRun, result: null, topChanges: [] });
                return;
            }
            case 'comparison.update':
                updateCalled = true;
                created = { ...created, name: String(body.input?.name ?? created.name) };
                await actionResponse(route, { comparison: created, run: null, result: null, topChanges: [] });
                return;
            case 'comparison.run.aiReview':
                reviewAttempts += 1;
                if (reviewAttempts === 1) {
                    const unavailable = { ...created.latestRun, aiReviewStatus: 'unavailable', aiReviewError: 'No AI model configured' };
                    created = { ...created, latestRun: unavailable, latestSuccessfulRun: unavailable };
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ ok: false, code: 'AI_UNAVAILABLE', message: 'No AI model configured' }),
                    });
                    return;
                }
                const review = {
                    summary: 'The primary-key removal is unsafe; the email widening is compatible.',
                    deploymentNotes: ['Review foreign-key consumers before deployment.'],
                    risks: [{ changeId: 'chg_orders_pk', explanation: 'This removes the orders primary key.' }],
                    recommendations: ['Keep the existing primary key.'],
                    limitations: ['Statistics are catalog estimates.'],
                    generatedAt: '2026-07-23T04:02:00.000Z',
                };
                const reviewed = { ...created.latestRun, aiReviewStatus: 'success', aiReviewError: null, aiReview: review };
                created = { ...created, latestRun: reviewed, latestSuccessfulRun: reviewed };
                runs = runs.map(run => (run.id === reviewed.id ? reviewed : run));
                await actionResponse(route, { run: reviewed, review });
                return;
            case 'resultSet.rows.read': {
                resultSetInputs.push(body.input ?? {});
                const filters = (body.input?.filters as Array<{ col: string; value: string }> | undefined) ?? [];
                const risk = filters.find(filter => filter.col === 'riskLevel')?.value;
                const rows = risk ? changes.filter(change => change.riskLevel === risk) : changes;
                await actionResponse(route, { rows, rowCount: rows.length, unfilteredRowCount: changes.length });
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
                await actionResponse(route, { downloadUrl: '/api/result-set-exports/schema-compare-e2e' });
                return;
            default:
                await route.continue();
        }
    });
    await page.route('**/api/result-set-exports/schema-compare-e2e', route =>
        route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="schema-diff.csv"' },
            body: 'objectPath,riskLevel\npublic.orders.orders_pkey,high\n',
        }),
    );

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;

    const removedRoute = await page.goto(`/${organization}/compare`);
    expect(removedRoute?.status()).toBe(404);

    await page.goto(`/${organization}/comparisons`);
    await expect(page.getByRole('heading', { name: 'Database Comparisons' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Production vs Staging/ })).toBeVisible();
    await page.getByRole('link', { name: 'New Comparison' }).first().click();

    await page.getByLabel('Name').fill('Production vs Staging');
    await page.getByTestId('source-connection').click();
    await page.getByRole('option', { name: /Production/ }).click();
    await page.getByTestId('target-connection').click();
    await expect(page.getByRole('option', { name: /MySQL QA/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Staging/ }).click();
    await page.getByTestId('save-comparison').click();
    await page.waitForURL(new RegExp(`/${organization}/comparisons/cmp_new$`));
    const createOrganizationId = actionOrganizations.find(request => request.actionId === 'comparison.create')?.organizationId;
    expect(createOrganizationId).toBeTruthy();
    expect(createOrganizationId).not.toBe(organization);
    expect(actionOrganizations.some(request => request.actionId === 'connection.list' && request.organizationId === createOrganizationId)).toBe(true);

    await expect(page.getByText('No AI model configured')).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/primary-key removal is unsafe/i)).toBeVisible();
    await expect(page.getByText('public.users.email', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: /2026/ }).first().click();
    await page.waitForURL(new RegExp(`/comparisons/cmp_new/runs/cmprun_1`));
    await expect(page.getByRole('heading', { name: 'Comparison Run' })).toBeVisible();
    await page.getByRole('tab', { name: 'Table' }).click();
    await expect(page.getByRole('cell', { name: 'public.orders.orders_pkey' })).toBeVisible();
    await page.getByRole('tab', { name: 'Chart' }).click();
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
    expect(resultSetInputs.some(input => input.groupKey === 'riskLevel')).toBe(true);

    await page.getByRole('link', { name: 'Production vs Staging' }).click();
    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByText('No changes', { exact: true })).toBeVisible();
    await expect(page.getByText(/Configuration v1/)).toHaveCount(2);

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Name').fill('Production vs Pre-production');
    await page.getByTestId('save-comparison').click();
    await expect.poll(() => updateCalled).toBe(true);

    const wasDark = await page.locator('html').evaluate(element => element.classList.contains('dark'));
    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(!wasDark);
    await expectAppHealthy(appErrors);
});

test('failed first Run preserves the saved Comparison and exposes retry', async ({ page, appErrors }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;
    const failedRun = comparisonRun('cmprun_failed', 'cmp_failed', {
        status: 'failed',
        aiReviewStatus: 'not_needed',
        failureMessage: 'Connection refused',
    });
    const failedComparison = comparisonRecord('cmp_failed', failedRun);

    await page.route('**/api/actions/execute', async route => {
        const body = route.request().postDataJSON() as { actionId: string };
        if (body.actionId === 'comparison.get') {
            await actionResponse(route, failedComparison);
            return;
        }
        if (body.actionId === 'comparison.run.list') {
            await actionResponse(route, { rows: [failedRun], total: 1 });
            return;
        }
        await route.continue();
    });

    await page.goto(`/${organization}/comparisons/cmp_failed`);
    await expect(page.getByText('Connection refused')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run now' })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Production vs Staging' })).toBeVisible();
    await expectAppHealthy(appErrors);
});
