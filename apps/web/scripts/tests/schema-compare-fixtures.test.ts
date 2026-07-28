import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareSchemaSnapshots } from '@dory/schema-compare';
import { SqliteDatasource } from '@dory/drivers/database/sqlite/datasource';

import { generateSchemaCompareFixtures } from '@/lib/demo/schema-compare-fixtures';

async function snapshot(filePath: string) {
    const datasource = new SqliteDatasource({
        id: `fixture_${path.basename(filePath)}`,
        type: 'sqlite',
        host: '',
        path: filePath,
        database: 'main',
    });
    await datasource.init();
    try {
        return await datasource.getSchemaSnapshot({ database: 'main' });
    } finally {
        await datasource.close();
    }
}

test('schema compare fixtures exercise no-change, safe, review, and unsafe diffs', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-schema-compare-fixtures-'));
    try {
        const fixtures = generateSchemaCompareFixtures(directory);
        assert.equal(fixtures.length, 4);
        const comparisons = new Map<string, ReturnType<typeof compareSchemaSnapshots>>();

        for (const fixture of fixtures) {
            const [current, desired] = await Promise.all([snapshot(fixture.currentPath), snapshot(fixture.desiredPath)]);
            comparisons.set(fixture.id, compareSchemaSnapshots(current, desired));
        }

        const noChanges = comparisons.get('01-no-changes')!;
        assert.equal(noChanges.summary.totalChanges, 0);

        const safe = comparisons.get('02-safe-additions')!;
        assert.equal(safe.summary.breakingChanges, 0);
        assert.equal(safe.summary.highRisk, 0);
        assert.ok(safe.changes.some(change => change.objectType === 'table' && change.objectName === 'payments' && change.changeType === 'added'));
        assert.ok(safe.changes.some(change => change.objectType === 'column' && change.objectName === 'email' && change.risk.code === 'column_type_widened'));
        assert.ok(safe.changes.some(change => change.objectType === 'column' && change.objectName === 'timezone' && change.changeType === 'added'));

        const review = comparisons.get('03-review-changes')!;
        assert.equal(review.summary.breakingChanges, 0);
        assert.ok(review.summary.mediumRisk > 0);
        assert.ok(review.changes.some(change => change.objectType === 'index' && change.changeType === 'renamed'));
        assert.ok(review.changes.some(change => change.objectType === 'column' && change.objectName === 'availability' && change.risk.code === 'required_column_with_default'));
        assert.ok(review.changes.some(change => change.objectType === 'view' && change.changeType === 'modified'));

        const unsafe = comparisons.get('04-unsafe-breaking')!;
        assert.equal(unsafe.summary.readiness, 'unsafe');
        assert.ok(unsafe.summary.breakingChanges >= 4);
        assert.ok(unsafe.changes.some(change => change.objectType === 'table' && change.objectName === 'audit_log' && change.changeType === 'removed'));
        assert.ok(unsafe.changes.some(change => change.objectType === 'column' && change.objectName === 'region' && change.risk.code === 'required_column_without_default'));
        assert.ok(unsafe.changes.some(change => change.objectType === 'constraint' && change.risk.breaking));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
