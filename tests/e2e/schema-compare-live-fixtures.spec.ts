import path from 'node:path';

import { expect } from '@playwright/test';

import { generateSchemaCompareFixtures } from '../../apps/web/lib/demo/schema-compare-fixtures';

import { expectAppHealthy, test } from './fixtures';

test.skip(process.env.SCHEMA_COMPARE_FIXTURES_LIVE !== '1', 'Run the schema-compare fixture seed first and opt into the live local integration test.');
test.setTimeout(120_000);

const pairs = [
    {
        id: '01-no-changes',
        current: 'Compare Lab · 01 No changes · Current',
        desired: 'Compare Lab · 01 No changes · Desired',
    },
    {
        id: '02-safe-additions',
        current: 'Compare Lab · 02 Safe additions · Current',
        desired: 'Compare Lab · 02 Safe additions · Desired',
    },
    {
        id: '03-review-changes',
        current: 'Compare Lab · 03 Review changes · Current',
        desired: 'Compare Lab · 03 Review changes · Desired',
    },
    {
        id: '04-unsafe-breaking',
        current: 'Compare Lab · 04 Unsafe breaking · Current',
        desired: 'Compare Lab · 04 Unsafe breaking · Desired',
    },
];

test('live fixture connections create deterministic comparison jobs', async ({ page, appErrors }) => {
    const generated = generateSchemaCompareFixtures(path.join(process.cwd(), 'apps/web/.tmp/schema-compare-fixtures'));
    const fixturePairs = pairs.map(pair => {
        const fixture = generated.find(candidate => candidate.id === pair.id)!;
        return {
            ...pair,
            currentPath: fixture.currentPath,
            desiredPath: fixture.desiredPath,
        };
    });

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;

    const results = await page.evaluate(
        async ({ organizationId, fixturePairs }) => {
            async function action<T>(actionId: string, input: unknown): Promise<T> {
                const response = await fetch('/api/actions/execute', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        actionId,
                        input,
                        organizationId,
                    }),
                });
                const payload = await response.json();
                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.message ?? `${actionId} failed with ${response.status}`);
                }
                return payload.data as T;
            }

            const connectionOutput = await action<{
                connections: Array<{
                    connection: { id: string; name: string };
                    identities: Array<{ id: string; isDefault: boolean }>;
                }>;
            }>('connection.list', {});
            async function ensureConnection(name: string, filePath: string, environment: 'prod' | 'staging') {
                const existing = connectionOutput.connections.find(item => item.connection.name === name);
                if (existing) return existing;

                const created = await action<(typeof connectionOutput.connections)[number]>('connection.create', {
                    payload: {
                        connection: {
                            type: 'sqlite',
                            engine: 'sqlite',
                            name,
                            description: 'Schema Compare live verification fixture',
                            host: null,
                            port: null,
                            database: 'main',
                            path: filePath,
                            status: 'Connected',
                            environment,
                            tags: 'blue',
                        },
                        identities: [],
                        ssh: null,
                    },
                });
                connectionOutput.connections.push(created);
                return created;
            }
            const comparisonOutput = await action<{
                rows: Array<{
                    id: string;
                    status: string;
                    currentEndpoint: { connectionId: string };
                    desiredEndpoint: { connectionId: string };
                    summary: Record<string, number | string> | null;
                }>;
            }>('comparison.list', { limit: 100 });
            const jobs = [...comparisonOutput.rows];

            const results = [];
            for (const pair of fixturePairs) {
                const current = await ensureConnection(pair.current, pair.currentPath, 'prod');
                const desired = await ensureConnection(pair.desired, pair.desiredPath, 'staging');

                const existing = jobs.find(
                    job => job.status === 'success' && job.currentEndpoint.connectionId === current.connection.id && job.desiredEndpoint.connectionId === desired.connection.id,
                );
                if (existing) {
                    results.push({
                        fixtureId: pair.id,
                        comparisonId: existing.id,
                        summary: existing.summary,
                        reused: true,
                    });
                    continue;
                }

                const created = await action<{
                    job: { id: string };
                    comparison: { summary: Record<string, number | string> };
                }>('comparison.schema.create', {
                    current: {
                        connectionId: current.connection.id,
                        identityId: current.identities.find(identity => identity.isDefault)?.id ?? null,
                        database: 'main',
                    },
                    desired: {
                        connectionId: desired.connection.id,
                        identityId: desired.identities.find(identity => identity.isDefault)?.id ?? null,
                        database: 'main',
                    },
                });
                results.push({
                    fixtureId: pair.id,
                    comparisonId: created.job.id,
                    summary: created.comparison.summary,
                    reused: false,
                });
            }
            return results;
        },
        {
            organizationId: organization,
            fixturePairs,
        },
    );

    const byId = new Map(results.map(result => [result.fixtureId, result]));
    expect(byId.get('01-no-changes')?.summary?.totalChanges).toBe(0);
    expect(byId.get('02-safe-additions')?.summary?.breakingChanges).toBe(0);
    expect(byId.get('02-safe-additions')?.summary?.highRisk).toBe(0);
    expect(Number(byId.get('03-review-changes')?.summary?.mediumRisk ?? 0)).toBeGreaterThan(0);
    expect(byId.get('03-review-changes')?.summary?.breakingChanges).toBe(0);
    expect(byId.get('04-unsafe-breaking')?.summary?.readiness).toBe('unsafe');
    expect(Number(byId.get('04-unsafe-breaking')?.summary?.breakingChanges ?? 0)).toBeGreaterThanOrEqual(4);

    const unsafeComparisonId = byId.get('04-unsafe-breaking')!.comparisonId;
    await page.goto(`/${organization}/compare/${unsafeComparisonId}`);
    await expect(page.getByText('unsafe', { exact: true })).toBeVisible();
    await expect(page.getByText('audit_log', { exact: false }).first()).toBeVisible();
    await expectAppHealthy(appErrors);
});
