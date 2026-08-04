import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultMappings, hashImportPlan, importPlanV1Schema, validateTargetCoverage, type DatasetProfileV1, type ImportPlanV1, type TargetSchema } from '../../src';

const profile: DatasetProfileV1 = {
    version: 'dory.dataset-profile.v1',
    rows: 1,
    columns: [
        { name: 'id', detectedType: 'int64', nullCount: 0, nullRate: 0, sampleValues: ['1'] },
        { name: 'Email', detectedType: 'string', nullCount: 0, nullRate: 0, sampleValues: ['a@example.com'] },
        { name: 'unused', detectedType: 'string', nullCount: 1, nullRate: 1, sampleValues: [] },
    ],
    preview: [{ id: '1', Email: 'a@example.com', unused: null }],
};

const target: TargetSchema = {
    exists: true,
    columns: [
        { name: 'id', databaseType: 'bigint', importType: 'int64', nullable: false, hasDefault: false },
        { name: 'email', databaseType: 'text', importType: 'string', nullable: false, hasDefault: false },
        { name: 'created_at', databaseType: 'timestamp', importType: 'datetime', nullable: false, hasDefault: true },
    ],
};

test('default mapping uses exact then unambiguous case-insensitive matches', () => {
    assert.deepEqual(createDefaultMappings(profile, target), [
        { source: 'id', target: 'id', targetType: 'int64', ignored: false, order: 0 },
        { source: 'Email', target: 'email', targetType: 'string', ignored: false, order: 1 },
        { source: 'unused', target: 'unused', targetType: 'string', ignored: true, order: 2 },
    ]);
});

test('required target coverage allows nullable and defaulted columns only', () => {
    const mappings = createDefaultMappings(profile, target);
    assert.deepEqual(validateTargetCoverage(target, mappings), []);
    assert.deepEqual(
        validateTargetCoverage(
            target,
            mappings.map(mapping => (mapping.target === 'email' ? { ...mapping, ignored: true } : mapping)),
        ),
        ['email'],
    );
});

test('plan validation rejects replace-on-create and duplicate target names', () => {
    const plan = buildPlan();
    assert.equal(importPlanV1Schema.safeParse(plan).success, true);
    assert.equal(importPlanV1Schema.safeParse({ ...plan, mode: 'replace' }).success, false);
    assert.equal(
        importPlanV1Schema.safeParse({
            ...plan,
            columns: [...plan.columns, { ...plan.columns[0], source: 'Email', target: 'id', order: 1 }],
        }).success,
        false,
    );
});

test('plan hash is stable for equivalent objects and changes with mapping order', () => {
    const plan = buildPlan();
    assert.equal(hashImportPlan(plan), hashImportPlan(structuredClone(plan)));
    assert.notEqual(hashImportPlan(plan), hashImportPlan({ ...plan, columns: plan.columns.map(column => ({ ...column, order: column.order + 1 })) }));
});

function buildPlan(): ImportPlanV1 {
    return {
        version: 'dory.import-plan.v1',
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
        target: { mode: 'create', schema: 'public', table: 'customers' },
        columns: [{ source: 'id', target: 'id', targetType: 'int64', ignored: false, order: 0 }],
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: 'a'.repeat(64),
    };
}
